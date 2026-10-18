/*
 * Benepisyo API + admin (Cloudflare Worker, D1, optional R2).
 *
 * Public:  POST /api/reports, POST /api/checkins, POST /api/city-requests,
 *          GET /api/counts?ids=a,b, GET /api/public/benefits
 * Admin:   GET /admin, /api/admin/*  (behind Cloudflare Access; editor emails in EDITORS)
 * Cron:    erases report contact details older than 90 days.
 */
import { ADMIN_HTML } from './admin-html.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const CONFIRMING_SOURCES = ['law', 'ordinance', 'official_site', 'official_post', 'direct'];
const REASONS = ['budget', 'ended', 'sched', 'other'];
const ANSWERS = ['yes', 'no', 'different'];
const STATUSES = ['new', 'checking', 'fixed', 'rejected'];
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

const now = () => new Date().toISOString();
/* Calendar dates follow Philippine time (UTC+8, no daylight saving). */
const today = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function bad(message, status = 400, headers = {}) { return json({ ok: false, error: message }, status, headers); }

function cors(env, request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.SITE_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
}

async function readJson(request, limit = 3 * 1024 * 1024) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > limit) throw new HttpError(413, 'Request is too large.');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'Request is too large.');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'Body must be JSON.'); }
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Fixed-window rate limit keyed by a salted hash of the client IP (no raw IPs stored). */
async function rateLimit(env, request, bucket, limit, windowSec = 3600) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const key = bucket + ':' + (await sha256((env.RATE_SALT || 'benepisyo') + ip)).slice(0, 32);
  const t = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT count, window_start FROM rate WHERE key = ?').bind(key).first();
  if (!row || t - row.window_start >= windowSec) {
    await env.DB.prepare('INSERT INTO rate (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start').bind(key, t).run();
    return;
  }
  if (row.count >= limit) throw new HttpError(429, 'Too many requests. Please try again later.');
  await env.DB.prepare('UPDATE rate SET count = count + 1 WHERE key = ?').bind(key).run();
}

/* ---------- validation of benefit records ---------- */
export function validateBenefit(b, { forPublish = false } = {}) {
  const errors = [];
  const bi = (o, name) => { if (!o || !str(o.tl, 2000) || !str(o.en, 2000)) errors.push(`${name} needs Tagalog and English`); };
  if (!b || typeof b !== 'object') return ['Benefit must be an object'];
  if (!ID_RE.test(b.id || '')) errors.push('id must be lowercase letters, digits and dashes (3–64)');
  if (!['local', 'national'].includes(b.level)) errors.push('level must be local or national');
  if (b.level === 'local' && !b.city) errors.push('local benefits need a city');
  if (!Array.isArray(b.groups) || !b.groups.length) errors.push('groups must list at least one group');
  bi(b.title, 'title');
  bi(b.summary, 'summary');
  bi(b.who, 'who');
  bi(b.frequency, 'frequency');
  if (!b.office) errors.push('office is required');
  if (!Array.isArray(b.requirements) || !b.requirements.length) errors.push('requirements must list at least one item');
  if (!Array.isArray(b.steps) || !b.steps.length) errors.push('steps must list at least one step');
  if (b.amount_php != null && !(Number.isFinite(b.amount_php) && b.amount_php >= 0)) errors.push('amount_php must be a number or null');
  if (!Array.isArray(b.sources) || !b.sources.length) errors.push('at least one source is required');
  else b.sources.forEach((s, i) => { if (!s.url || !/^https:\/\//.test(s.url)) errors.push(`source ${i + 1} needs an https URL`); if (!s.label) errors.push(`source ${i + 1} needs a label`); });
  const v = b.verification || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.checked_on || '')) errors.push('verification.checked_on must be YYYY-MM-DD');
  if (!['confirmed', 'reported'].includes(v.status)) errors.push('verification.status must be confirmed or reported');
  if (v.status === 'confirmed' && Array.isArray(b.sources) && !b.sources.some((s) => CONFIRMING_SOURCES.includes(s.type))) {
    errors.push('confirmed needs an official source (law, ordinance, official site or post, or a logged direct confirmation)');
  }
  if (forPublish && errors.length) errors.unshift('Cannot publish until these are fixed');
  return errors;
}

/* ---------- auth ---------- */
function editorFor(request, env) {
  let email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (!email && env.DEV_AUTH === 'true') email = request.headers.get('X-Dev-Editor');
  if (!email) return null;
  email = email.toLowerCase();
  const editors = (env.EDITORS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return editors.includes(email) ? email : null;
}

async function addHistory(env, id, editor, action, note) {
  await env.DB.prepare('INSERT INTO history (benefit_id, at, editor, action, note) VALUES (?, ?, ?, ?, ?)').bind(id, now(), editor, action, note || null).run();
}

async function triggerDeploy(env) {
  if (!env.DEPLOY_HOOK_URL) return false;
  try { const r = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' }); return r.ok; } catch { return false; }
}

function daysSince(iso) { return Math.max(0, Math.floor((Date.parse(today()) - Date.parse(iso)) / 86400000)); }

/* ---------- public handlers ---------- */
async function postReport(request, env) {
  await rateLimit(env, request, 'report', Number(env.REPORT_LIMIT || 10));
  const body = await readJson(request);
  const benefitId = str(body.benefit_id, 64);
  const message = str(body.message, 1000);
  if (!ID_RE.test(benefitId)) throw new HttpError(400, 'benefit_id is invalid.');
  if (!message) throw new HttpError(400, 'Describe what changed.');
  let photoKey = null;
  if (body.photo) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.photo));
    if (!m) throw new HttpError(400, 'Photo must be a JPEG, PNG or WebP image.');
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_PHOTO_BYTES) throw new HttpError(413, 'Photo is too large.');
    if (env.FILES) {
      photoKey = `reports/${today()}/${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
      await env.FILES.put(photoKey, bytes, { httpMetadata: { contentType: 'image/' + m[1] } });
    }
  }
  const res = await env.DB.prepare('INSERT INTO reports (benefit_id, message, contact, photo_key, page, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(benefitId, message, str(body.contact, 100) || null, photoKey, str(body.page, 200) || null, 'new', now()).run();
  return { ok: true, id: res.meta && res.meta.last_row_id };
}

async function postCheckin(request, env) {
  await rateLimit(env, request, 'checkin', Number(env.CHECKIN_LIMIT || 30));
  const body = await readJson(request, 20000);
  const benefitId = str(body.benefit_id, 64);
  if (!ID_RE.test(benefitId)) throw new HttpError(400, 'benefit_id is invalid.');
  if (!ANSWERS.includes(body.answer)) throw new HttpError(400, 'answer must be yes, no or different.');
  const reason = body.reason == null ? null : String(body.reason);
  if (reason && !REASONS.includes(reason)) throw new HttpError(400, 'reason is invalid.');
  await env.DB.prepare('INSERT INTO checkins (benefit_id, answer, reason, detail, city, month, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(benefitId, body.answer, reason, str(body.detail, 500) || null, str(body.city, 40) || null, today().slice(0, 7), now()).run();
  return { ok: true };
}

async function postCityRequest(request, env) {
  await rateLimit(env, request, 'city', 10);
  const body = await readJson(request, 2000);
  const city = str(body.city, 60);
  if (!city) throw new HttpError(400, 'city is required.');
  await env.DB.prepare('INSERT INTO city_requests (city, created_at) VALUES (?, ?)').bind(city, now()).run();
  return { ok: true };
}

async function getCounts(url, env) {
  const ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter((s) => ID_RE.test(s)).slice(0, 50);
  const counts = {};
  if (!ids.length) return { counts };
  const month = today().slice(0, 7);
  const q = `SELECT benefit_id, COUNT(*) AS n FROM checkins WHERE answer = 'yes' AND month = ? AND benefit_id IN (${ids.map(() => '?').join(',')}) GROUP BY benefit_id`;
  const { results } = await env.DB.prepare(q).bind(month, ...ids).all();
  // Small counts are hidden so a single person's visit cannot be singled out.
  for (const r of results) if (r.n >= 3) counts[r.benefit_id] = r.n;
  return { counts, month };
}

async function getPublicBenefits(env) {
  const { results } = await env.DB.prepare("SELECT published FROM benefits WHERE published IS NOT NULL AND status != 'archived' ORDER BY id").all();
  return { benefits: results.map((r) => JSON.parse(r.published)), generated: now() };
}

/* ---------- admin handlers ---------- */
async function getBenefitRow(env, id) {
  const row = await env.DB.prepare('SELECT * FROM benefits WHERE id = ?').bind(id).first();
  if (!row) throw new HttpError(404, 'Benefit not found.');
  return row;
}

function summarize(row) {
  const d = JSON.parse(row.draft);
  const checked = d.verification && d.verification.checked_on;
  const age = checked ? daysSince(checked) : null;
  return {
    id: row.id, title: d.title && d.title.en, level: d.level, city: d.city, status: row.status,
    verification: d.verification && d.verification.status, checked_on: checked, days_since_check: age,
    flag: age == null || age > 180 ? 'outdated' : age > 90 ? 'recheck' : 'fresh',
    updated_by: row.updated_by, updated_at: row.updated_at, submitted_by: row.submitted_by, published_at: row.published_at,
    unpublished_changes: row.published !== row.draft
  };
}

async function adminRoute(request, env, url, editor) {
  const parts = url.pathname.replace(/^\/api\/admin\/?/, '').split('/').filter(Boolean);
  const method = request.method;

  if (parts[0] === 'me' && method === 'GET') return { email: editor };

  if (parts[0] === 'queue' && method === 'GET') {
    const { results } = await env.DB.prepare("SELECT * FROM benefits WHERE status != 'archived'").all();
    const items = results.map(summarize).sort((a, b) => (a.checked_on || '') < (b.checked_on || '') ? -1 : 1);
    const { results: openReports } = await env.DB.prepare("SELECT benefit_id, COUNT(*) AS n FROM reports WHERE status IN ('new','checking') GROUP BY benefit_id").all();
    const byId = Object.fromEntries(openReports.map((r) => [r.benefit_id, r.n]));
    items.forEach((i) => { i.open_reports = byId[i.id] || 0; });
    return { items };
  }

  if (parts[0] === 'import' && method === 'POST') {
    const body = await readJson(request);
    const list = Array.isArray(body.benefits) ? body.benefits : [];
    const out = { imported: 0, skipped: [], errors: {} };
    for (const b of list) {
      const errs = validateBenefit(b);
      if (errs.length) { out.errors[b.id || '?'] = errs; continue; }
      const exists = await env.DB.prepare('SELECT id FROM benefits WHERE id = ?').bind(b.id).first();
      if (exists) { out.skipped.push(b.id); continue; }
      const text = JSON.stringify(b);
      const publish = body.publish === true;
      await env.DB.prepare('INSERT INTO benefits (id, draft, published, status, updated_by, updated_at, published_by, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(b.id, text, publish ? text : null, publish ? 'published' : 'draft', editor, now(), publish ? editor : null, publish ? now() : null).run();
      await addHistory(env, b.id, editor, 'import', publish ? 'imported and published from seed data' : 'imported as draft');
      out.imported++;
    }
    return out;
  }

  if (parts[0] === 'benefits') {
    const id = parts[1];
    const action = parts[2];
    if (!id && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM benefits ORDER BY id').all();
      return { items: results.map(summarize) };
    }
    if (!id && method === 'POST') {
      const body = await readJson(request);
      const b = body.data;
      const errs = validateBenefit(b);
      if (errs.length) throw new HttpError(422, errs.join('; '));
      const exists = await env.DB.prepare('SELECT id FROM benefits WHERE id = ?').bind(b.id).first();
      if (exists) throw new HttpError(409, 'A benefit with this id already exists.');
      await env.DB.prepare('INSERT INTO benefits (id, draft, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)').bind(b.id, JSON.stringify(b), 'draft', editor, now()).run();
      await addHistory(env, b.id, editor, 'create');
      return { ok: true, id: b.id };
    }
    if (!ID_RE.test(id || '')) throw new HttpError(400, 'Invalid id.');
    const row = await getBenefitRow(env, id);

    if (!action && method === 'GET') return { ...summarize(row), draft: JSON.parse(row.draft), published: row.published ? JSON.parse(row.published) : null };

    if (!action && method === 'PUT') {
      const body = await readJson(request);
      const b = body.data;
      if (!b || b.id !== id) throw new HttpError(400, 'data.id must match the URL.');
      const errs = validateBenefit(b);
      if (errs.length) throw new HttpError(422, errs.join('; '));
      await env.DB.prepare("UPDATE benefits SET draft = ?, status = CASE WHEN status = 'archived' THEN 'archived' ELSE 'draft' END, updated_by = ?, updated_at = ?, submitted_by = NULL, submitted_at = NULL WHERE id = ?")
        .bind(JSON.stringify(b), editor, now(), id).run();
      await addHistory(env, id, editor, 'save', str(body.note, 300));
      return { ok: true };
    }

    if (action === 'submit' && method === 'POST') {
      const errs = validateBenefit(JSON.parse(row.draft), { forPublish: true });
      if (errs.length) throw new HttpError(422, errs.join('; '));
      await env.DB.prepare("UPDATE benefits SET status = 'in_review', submitted_by = ?, submitted_at = ? WHERE id = ?").bind(editor, now(), id).run();
      await addHistory(env, id, editor, 'submit');
      return { ok: true };
    }

    if (action === 'publish' && method === 'POST') {
      if (row.status !== 'in_review') throw new HttpError(409, 'Submit the draft for review before publishing.');
      if (row.submitted_by === editor && env.ALLOW_SELF_REVIEW !== 'true') throw new HttpError(403, 'A second editor must review and publish (four-eyes rule).');
      const draft = JSON.parse(row.draft);
      const errs = validateBenefit(draft, { forPublish: true });
      if (errs.length) throw new HttpError(422, errs.join('; '));
      const body = await readJson(request, 5000);
      const note = str(body.note, 300);
      if (note) {
        draft.history = (draft.history || []).concat([{ date: today(), tl: str(body.note_tl, 300) || note, en: note }]);
      }
      const text = JSON.stringify(draft);
      await env.DB.prepare("UPDATE benefits SET draft = ?, published = ?, status = 'published', published_by = ?, published_at = ? WHERE id = ?").bind(text, text, editor, now(), id).run();
      await addHistory(env, id, editor, 'publish', note);
      const deployed = await triggerDeploy(env);
      return { ok: true, deploy_triggered: deployed };
    }

    if (action === 'verify' && method === 'POST') {
      const body = await readJson(request, 10000);
      const status = body.status;
      if (!['confirmed', 'reported'].includes(status)) throw new HttpError(400, 'status must be confirmed or reported.');
      const checkedOn = /^\d{4}-\d{2}-\d{2}$/.test(body.checked_on || '') ? body.checked_on : today();
      const method_ = { tl: str(body.method_tl, 300) || str(body.method, 300), en: str(body.method, 300) };
      if (!method_.en) throw new HttpError(400, 'Describe how it was checked (method).');
      const apply = (b) => {
        b.verification = { status, checked_on: checkedOn, method: method_ };
        if (body.source && body.source.url) b.sources = (b.sources || []).concat([{ type: str(body.source.type, 20) || 'direct', label: str(body.source.label, 200), url: str(body.source.url, 500) }]);
        const errs = validateBenefit(b);
        if (errs.length) throw new HttpError(422, errs.join('; '));
        return JSON.stringify(b);
      };
      const draftText = apply(JSON.parse(row.draft));
      const pubText = row.published ? apply(JSON.parse(row.published)) : null;
      await env.DB.prepare('UPDATE benefits SET draft = ?, published = COALESCE(?, published), updated_by = ?, updated_at = ? WHERE id = ?').bind(draftText, pubText, editor, now(), id).run();
      await addHistory(env, id, editor, 'verify', `${status} on ${checkedOn}: ${method_.en}`);
      const deployed = pubText ? await triggerDeploy(env) : false;
      return { ok: true, deploy_triggered: deployed };
    }

    if (action === 'archive' && method === 'POST') {
      const body = await readJson(request, 5000);
      const reason = str(body.reason, 300);
      if (!reason) throw new HttpError(400, 'Give a reason, e.g. the program ended.');
      await env.DB.prepare("UPDATE benefits SET status = 'archived', updated_by = ?, updated_at = ? WHERE id = ?").bind(editor, now(), id).run();
      await addHistory(env, id, editor, 'archive', reason);
      await triggerDeploy(env);
      return { ok: true };
    }

    if (action === 'history' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT at, editor, action, note FROM history WHERE benefit_id = ? ORDER BY id DESC LIMIT 100').bind(id).all();
      return { items: results };
    }
  }

  if (parts[0] === 'reports') {
    const id = parts[1];
    if (!id && method === 'GET') {
      const status = url.searchParams.get('status');
      const q = status && STATUSES.includes(status)
        ? env.DB.prepare('SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 200').bind(status)
        : env.DB.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 200');
      const { results } = await q.all();
      return { items: results.map((r) => ({ ...r, has_photo: !!r.photo_key, photo_key: undefined })) };
    }
    if (id && parts[2] === 'photo' && method === 'GET') {
      const r = await env.DB.prepare('SELECT photo_key FROM reports WHERE id = ?').bind(Number(id)).first();
      if (!r || !r.photo_key || !env.FILES) throw new HttpError(404, 'No photo.');
      const obj = await env.FILES.get(r.photo_key);
      if (!obj) throw new HttpError(404, 'No photo.');
      return new Response(obj.body, { headers: { 'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg', 'Cache-Control': 'private, no-store' } });
    }
    if (id && method === 'PATCH') {
      const body = await readJson(request, 5000);
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'status must be new, checking, fixed or rejected.');
      await env.DB.prepare('UPDATE reports SET status = ?, reply = ?, handled_by = ?, updated_at = ? WHERE id = ?').bind(body.status, str(body.reply, 500) || null, editor, now(), Number(id)).run();
      return { ok: true };
    }
  }

  if (parts[0] === 'stats' && method === 'GET') {
    const month = today().slice(0, 7);
    const reports = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM reports GROUP BY status").all();
    const checkins = await env.DB.prepare('SELECT answer, COUNT(*) AS n FROM checkins WHERE month = ? GROUP BY answer').bind(month).all();
    const cities = await env.DB.prepare('SELECT city, COUNT(*) AS n FROM city_requests GROUP BY lower(city) ORDER BY n DESC LIMIT 20').all();
    return { month, reports: reports.results, checkins: checkins.results, city_requests: cities.results };
  }

  throw new HttpError(404, 'Not found.');
}

/* ---------- scheduled privacy job ---------- */
export async function purgeOldContacts(env) {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const res = await env.DB.prepare('UPDATE reports SET contact = NULL WHERE contact IS NOT NULL AND created_at < ?').bind(cutoff).run();
  return res.meta ? res.meta.changes : 0;
}

/* ---------- entry ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = cors(env, request);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

      if (url.pathname === '/api/reports' && request.method === 'POST') return json(await postReport(request, env), 201, corsHeaders);
      if (url.pathname === '/api/checkins' && request.method === 'POST') return json(await postCheckin(request, env), 201, corsHeaders);
      if (url.pathname === '/api/city-requests' && request.method === 'POST') return json(await postCityRequest(request, env), 201, corsHeaders);
      if (url.pathname === '/api/counts' && request.method === 'GET') return json(await getCounts(url, env), 200, { ...corsHeaders, 'Cache-Control': 'public, max-age=300' });
      if (url.pathname === '/api/public/benefits' && request.method === 'GET') return json(await getPublicBenefits(env), 200, { ...corsHeaders, 'Cache-Control': 'public, max-age=60' });

      if (url.pathname === '/admin' || url.pathname.startsWith('/api/admin')) {
        const editor = editorFor(request, env);
        if (!editor) return url.pathname === '/admin' ? new Response('Editors only. Sign in through Cloudflare Access.', { status: 403 }) : bad('Editors only.', 403);
        if (url.pathname === '/admin') return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });
        const out = await adminRoute(request, env, url, editor);
        return out instanceof Response ? out : json(out);
      }
      if (url.pathname === '/api/health') return json({ ok: true });
      return bad('Not found.', 404, corsHeaders);
    } catch (e) {
      if (e instanceof HttpError) return bad(e.message, e.status, corsHeaders);
      console.error(e);
      return bad('Something went wrong on our side. Please try again.', 500, corsHeaders);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(purgeOldContacts(env));
  }
};

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import worker, { validateBenefit, purgeOldContacts } from '../src/index.js';

const require = createRequire(import.meta.url);
const { createD1, createR2 } = require('./d1-shim.cjs');
const seed = require('../../data/benefits.json');

function makeEnv(extra = {}) {
  return { DB: createD1(), FILES: createR2(), SITE_ORIGIN: 'https://benepisyo.ph', EDITORS: 'ana@x.ph,ben@x.ph', DEV_AUTH: 'true', RATE_SALT: 's', ...extra };
}
const ctx = { waitUntil() {} };

async function call(env, method, path, { body, editor, ip = '1.1.1.1', origin = 'https://benepisyo.ph' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: origin };
  if (editor) headers['X-Dev-Editor'] = editor;
  const res = await worker.fetch(new Request('https://api.benepisyo.ph' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), env, ctx);
  const type = res.headers.get('Content-Type') || '';
  return { status: res.status, headers: res.headers, json: type.includes('json') ? await res.json() : null, text: type.includes('json') ? null : await res.text() };
}

test('seed data passes publish validation', () => {
  for (const b of seed) assert.deepEqual(validateBenefit(b, { forPublish: true }), [], b.id);
});

test('confirmed status needs an official source', () => {
  const b = structuredClone(seed.find((x) => x.id === 'calamba-senior-birthday-cash'));
  b.verification.status = 'confirmed';
  assert.ok(validateBenefit(b).some((e) => e.includes('official source')));
});

test('report: stored, CORS allowed for the site, photo goes to private storage', async () => {
  const env = makeEnv();
  const photo = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
  const r = await call(env, 'POST', '/api/reports', { body: { benefit_id: 'calamba-senior-birthday-cash', message: 'Now ₱1,500', contact: '0917', photo } });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://benepisyo.ph');
  assert.equal(env.FILES.store.size, 1);
  const list = await call(env, 'GET', '/api/admin/reports?status=new', { editor: 'ana@x.ph' });
  assert.equal(list.json.items.length, 1);
  assert.equal(list.json.items[0].has_photo, true);
  assert.equal(list.json.items[0].photo_key, undefined, 'storage key is not exposed');
});

test('report validation and rate limit', async () => {
  const env = makeEnv({ REPORT_LIMIT: '2' });
  assert.equal((await call(env, 'POST', '/api/reports', { body: { benefit_id: 'x', message: 'hi' } })).status, 400);
  assert.equal((await call(env, 'POST', '/api/reports', { body: { benefit_id: 'senior-discount', message: '' } })).status, 400);
  await call(env, 'POST', '/api/reports', { body: { benefit_id: 'senior-discount', message: 'a' } });
  const third = await call(env, 'POST', '/api/reports', { body: { benefit_id: 'senior-discount', message: 'c' } });
  assert.equal(third.status, 429);
  const otherIp = await call(env, 'POST', '/api/reports', { body: { benefit_id: 'senior-discount', message: 'd' }, ip: '2.2.2.2' });
  assert.equal(otherIp.status, 201);
});

test('check-ins feed a monthly count that hides small numbers', async () => {
  const env = makeEnv();
  for (let i = 0; i < 2; i++) await call(env, 'POST', '/api/checkins', { body: { benefit_id: 'senior-discount', answer: 'yes' }, ip: '9.9.9.' + i });
  let c = await call(env, 'GET', '/api/counts?ids=senior-discount');
  assert.deepEqual(c.json.counts, {}, 'fewer than 3 is hidden');
  await call(env, 'POST', '/api/checkins', { body: { benefit_id: 'senior-discount', answer: 'yes' }, ip: '9.9.9.9' });
  await call(env, 'POST', '/api/checkins', { body: { benefit_id: 'senior-discount', answer: 'no', reason: 'budget' }, ip: '9.9.9.8' });
  c = await call(env, 'GET', '/api/counts?ids=senior-discount');
  assert.equal(c.json.counts['senior-discount'], 3);
  assert.equal((await call(env, 'POST', '/api/checkins', { body: { benefit_id: 'senior-discount', answer: 'maybe' } })).status, 400);
});

test('admin requires an allowed editor', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/api/admin/queue')).status, 403);
  assert.equal((await call(env, 'GET', '/api/admin/queue', { editor: 'stranger@x.ph' })).status, 403);
  assert.equal((await call(env, 'GET', '/api/admin/queue', { editor: 'ANA@x.ph' })).status, 200);
  const page = await call(env, 'GET', '/admin', { editor: 'ana@x.ph' });
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('Benepisyo Editor'));
});

test('editorial workflow: draft, submit, four-eyes publish, verify, public feed, archive', async () => {
  const env = makeEnv();
  const imp = await call(env, 'POST', '/api/admin/import', { editor: 'ana@x.ph', body: { benefits: seed, publish: true } });
  assert.equal(imp.json.imported, seed.length);
  let pub = await call(env, 'GET', '/api/public/benefits');
  assert.equal(pub.json.benefits.length, seed.length);

  const id = 'calamba-senior-birthday-cash';
  const got = await call(env, 'GET', '/api/admin/benefits/' + id, { editor: 'ana@x.ph' });
  const draft = got.json.draft;
  draft.amount_php = 1500;
  assert.equal((await call(env, 'PUT', '/api/admin/benefits/' + id, { editor: 'ana@x.ph', body: { data: draft } })).status, 200);

  pub = await call(env, 'GET', '/api/public/benefits');
  assert.equal(pub.json.benefits.find((b) => b.id === id).amount_php, 1000, 'unpublished draft is not public');

  assert.equal((await call(env, 'POST', `/api/admin/benefits/${id}/publish`, { editor: 'ben@x.ph', body: {} })).status, 409, 'must be submitted first');
  assert.equal((await call(env, 'POST', `/api/admin/benefits/${id}/submit`, { editor: 'ana@x.ph', body: {} })).status, 200);
  assert.equal((await call(env, 'POST', `/api/admin/benefits/${id}/publish`, { editor: 'ana@x.ph', body: {} })).status, 403, 'four-eyes rule');
  const ok = await call(env, 'POST', `/api/admin/benefits/${id}/publish`, { editor: 'ben@x.ph', body: { note: 'Amount updated per OSCA' } });
  assert.equal(ok.status, 200);
  pub = await call(env, 'GET', '/api/public/benefits');
  const live = pub.json.benefits.find((b) => b.id === id);
  assert.equal(live.amount_php, 1500);
  assert.equal(live.history.at(-1).en, 'Amount updated per OSCA');

  const badVerify = await call(env, 'POST', `/api/admin/benefits/${id}/verify`, { editor: 'ana@x.ph', body: { status: 'confirmed', method: 'Read a news article' } });
  assert.equal(badVerify.status, 422, 'news alone cannot confirm');
  const goodVerify = await call(env, 'POST', `/api/admin/benefits/${id}/verify`, { editor: 'ana@x.ph', body: { status: 'confirmed', method: 'Called OSCA', source: { type: 'direct', label: 'Phone call with OSCA staff, 2026-10-20', url: 'https://calambacity.gov.ph/' } } });
  assert.equal(goodVerify.status, 200);
  pub = await call(env, 'GET', '/api/public/benefits');
  assert.equal(pub.json.benefits.find((b) => b.id === id).verification.status, 'confirmed');

  const queue = await call(env, 'GET', '/api/admin/queue', { editor: 'ana@x.ph' });
  assert.ok(queue.json.items.every((i, k, a) => k === 0 || (a[k - 1].checked_on || '') <= (i.checked_on || '')), 'queue sorted oldest first');

  assert.equal((await call(env, 'POST', `/api/admin/benefits/${id}/archive`, { editor: 'ana@x.ph', body: {} })).status, 400, 'archive needs a reason');
  assert.equal((await call(env, 'POST', `/api/admin/benefits/${id}/archive`, { editor: 'ana@x.ph', body: { reason: 'Program ended' } })).status, 200);
  pub = await call(env, 'GET', '/api/public/benefits');
  assert.ok(!pub.json.benefits.some((b) => b.id === id), 'archived benefits leave the public feed');

  const hist = await call(env, 'GET', `/api/admin/benefits/${id}/history`, { editor: 'ana@x.ph' });
  assert.deepEqual(hist.json.items.map((h) => h.action).reverse(), ['import', 'save', 'submit', 'publish', 'verify', 'archive']);
});

test('invalid drafts are rejected with readable errors', async () => {
  const env = makeEnv();
  const r = await call(env, 'POST', '/api/admin/benefits', { editor: 'ana@x.ph', body: { data: { id: 'calamba-x', level: 'local', groups: [] } } });
  assert.equal(r.status, 422);
  assert.ok(r.json.error.includes('local benefits need a city'));
  assert.ok(r.json.error.includes('at least one source is required'));
});

test('privacy job erases contacts older than 90 days', async () => {
  const env = makeEnv();
  await env.DB.prepare("INSERT INTO reports (benefit_id, message, contact, status, created_at) VALUES ('senior-discount', 'old', '0917', 'fixed', '2020-01-01T00:00:00.000Z')").run();
  await env.DB.prepare("INSERT INTO reports (benefit_id, message, contact, status, created_at) VALUES ('senior-discount', 'new', '0918', 'new', ?)").bind(new Date().toISOString()).run();
  assert.equal(await purgeOldContacts(env), 1);
  const rows = (await env.DB.prepare('SELECT contact FROM reports ORDER BY id').all()).results;
  assert.deepEqual(rows.map((r) => r.contact), [null, '0918']);
});

/* Helpers shared by the server render and the browser. */
import { createContext, useContext, useEffect, useState } from 'react';
import I18N from '../i18n.js';
import M from '../match.js';

export { M };
export const MAX_PEOPLE = 6;
export const manilaToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

export const store = {
  get(k, d) { try { const v = localStorage.getItem('bp.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bp.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem('bp.' + k); } catch (e) { /* ignore */ } }
};

export const peso = (n) => '₱' + Number(n).toLocaleString('en-PH');
export const uid = () => Math.random().toString(36).slice(2, 10);

/* Everything a component needs: config from the build, current language, data. */
export const Ctx = createContext(null);
export function useApp() { return useContext(Ctx); }

export function makeHelpers(cfg, lang, data) {
  const t = (k, v) => I18N.t(lang, k, v);
  const L = (o) => (o ? o[lang] || o.tl || o.en || '' : '');
  const link = (p) => (cfg.links === 'file' ? cfg.root + (p ? p + 'index.html' : 'home.html') : cfg.root + p);
  const fmtDate = (iso) => {
    try { return new Date(iso + 'T00:00:00Z').toLocaleDateString(lang === 'en' ? 'en-PH' : 'fil-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return iso; }
  };
  const meta = data.meta;
  const cityName = (id) => { const c = meta.cities.find((x) => x.id === id); return c ? c.name : ''; };
  const docName = (id) => { const d = meta.docs.find((x) => x.id === id); return d ? d[lang] : id; };
  const benefitUrl = (b) => link((b.level === 'local' ? b.city : 'calamba') + '/' + b.id + '/');
  const benefitById = (id) => (data.benefits || []).find((b) => b.id === id);
  const officeById = (id) => (data.offices || []).find((o) => o.id === id);
  const subj = (p) => (p.self ? t('subj_self') : p.name ? t('subj_other', { name: p.name }) : t('subj_other_plain'));
  const subjposs = (p) => (p.self ? t('subjposs_self') : p.name ? t('subjposs_other', { name: p.name }) : t('subjposs_other_plain'));
  return { cfg, lang, data, t, L, link, fmtDate, cityName, docName, benefitUrl, benefitById, officeById, subj, subjposs };
}

/* Full data set (all benefits and offices), fetched once in the browser. */
let dataPromise = null;
export function useFullData(root) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!dataPromise) dataPromise = fetch(root + 'data.json').then((r) => { if (!r.ok) throw new Error('data'); return r.json(); });
    let live = true;
    dataPromise.then((x) => live && setD(x)).catch(() => { dataPromise = null; });
    return () => { live = false; };
  }, [root]);
  return d;
}

/* Reports, check-ins and city requests: send now, or keep on the phone until online. */
function post(api, path, payload) {
  if (!api) return Promise.reject(new Error('no-api'));
  return fetch(api.replace(/\/$/, '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
}
function queue(path, payload) {
  const box = store.get('outbox', []); box.push({ path, payload, at: Date.now() }); store.set('outbox', box.slice(-50));
}
export function send(api, path, payload) {
  return post(api, path, payload).then(() => 'sent').catch(() => { queue(path, payload); return 'queued'; });
}
export function flushOutbox(api) {
  if (!api || !navigator.onLine) return;
  const box = store.get('outbox', []); if (!box.length) return;
  store.set('outbox', []);
  box.forEach((item) => post(api, item.path, item.payload).catch(() => queue(item.path, item.payload)));
}

/* Saved family list (phone only). */
export const people = () => store.get('people', []);
export const savePeople = (list) => store.set('people', list.slice(0, MAX_PEOPLE));
export function activePerson() {
  const list = people(); const id = store.get('active', null);
  return list.find((p) => p.id === id) || list[0] || null;
}

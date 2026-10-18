#!/usr/bin/env node
/*
 * Benepisyo static site build. Zero dependencies.
 *   node src/build.js                 -> dist/ with pretty URLs (for Cloudflare Pages)
 *   node src/build.js --links=file    -> dist-preview/ with explicit index.html links (for file previews)
 *   BENEFITS_URL=https://api.../api/public/benefits node src/build.js  -> build from published admin data
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const LINKS = args.links === 'file' ? 'file' : 'pretty';
const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(ROOT, '..', 'data');
const OUT = path.resolve(ROOT, args.out || (LINKS === 'file' ? 'dist-preview' : 'dist'));
const SITE_URL = (process.env.SITE_URL || 'https://benepisyo.ph').replace(/\/$/, '');
const API_BASE = process.env.API_BASE || '';

const read = (p) => fs.readFileSync(p, 'utf8');
const meta = JSON.parse(read(path.join(DATA, 'meta.json')));
const offices = JSON.parse(read(path.join(DATA, 'offices.json')));

async function loadBenefits() {
  if (process.env.BENEFITS_URL) {
    const res = await fetch(process.env.BENEFITS_URL);
    if (!res.ok) throw new Error('Could not load published benefits: HTTP ' + res.status);
    return (await res.json()).benefits;
  }
  return JSON.parse(read(path.join(DATA, 'benefits.json')));
}

const CSS = read(path.join(ROOT, 'src', 'styles.css'));
const JS = ['i18n.js', 'match.js', 'app.js'].map((f) => read(path.join(ROOT, 'src', f))).join('\n;\n');
const I18N = require('./i18n.js');
const M = require('./match.js');
const T = (k, v) => I18N.t('tl', k, v);
const TE = (k, v) => I18N.t('en', k, v);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (obj) => obj ? `<span data-l="tl">${esc(obj.tl)}</span><span data-l="en">${esc(obj.en)}</span>` : '';
const biKey = (k, v) => `<span data-l="tl">${esc(T(k, v))}</span><span data-l="en">${esc(TE(k, v))}</span>`;
const peso = (n) => '₱' + Number(n).toLocaleString('en-PH');
const officeById = Object.fromEntries(offices.map((o) => [o.id, o]));
const cityById = Object.fromEntries(meta.cities.map((c) => [c.id, c]));
const today = process.env.BUILD_DATE || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); // Philippine date

function fmtDate(iso, lang) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString(lang === 'en' ? 'en-PH' : 'fil-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function href(rootPrefix, p) {
  // p like '' (home), 'calamba/', 'calamba/senior-discount/', 'tungkol/'
  if (LINKS === 'file') return rootPrefix + (p ? p + 'index.html' : 'home.html');
  return rootPrefix + p;
}
function canonical(p) { return SITE_URL + '/' + p; }

function badge(b) {
  const st = M.effectiveStatus(b, today);
  return `<span class="badge ${st}">${biKey('badge_' + st)}</span>`;
}

function amountHtml(b) {
  if (b.amount_php) {
    const note = b.amount_note ? `<small>${bi(b.amount_note)}</small>` : '';
    return `<div class="amount">${peso(b.amount_php)} ${note}</div>`;
  }
  if (b.value) return `<div class="value">${bi(b.value)}</div>`;
  return `<div class="value">${biKey('detail_amount_unknown')}</div>`;
}

function levelTag(b) {
  if (b.level === 'local') return `<span class="tag">${biKey('tag_local', { city: cityById[b.city].name })}</span>`;
  return `<span class="tag">${biKey('tag_national')}</span>`;
}

function layout({ title, description, rootPrefix, page, body, canonicalPath, jsonld, active }) {
  const nav = [
    ['', 'nav_family', 'home'],
    ['calamba/', 'nav_city', 'city'],
    ['tungkol/', 'nav_about', 'about']
  ].map(([p, k, id]) => `<a href="${href(rootPrefix, p)}"${active === id ? ' aria-current="page"' : ''}>${biKey(k)}</a>`).join('');
  return `<!doctype html>
<html lang="tl" data-lang="tl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical(canonicalPath))}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical(canonicalPath))}">
<meta property="og:image" content="${esc(SITE_URL + '/og.png')}">
<meta name="theme-color" content="#0b5d4e">
<link rel="manifest" href="${rootPrefix}manifest.webmanifest">
<link rel="icon" href="${rootPrefix}icon-192.png">
<link rel="apple-touch-icon" href="${rootPrefix}icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap">
<style>${CSS}
html:not([data-lang="en"]) [data-l="en"]{display:none!important}
html[data-lang="en"] [data-l="tl"]{display:none!important}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body data-page="${page}" data-root="${rootPrefix}" data-links="${LINKS}" data-api="${esc(API_BASE)}" data-today="${today}">
<div id="offline" class="offline-bar" hidden>${biKey('offline')}</div>
<header class="site-head"><div class="wrap">
  <a class="brand" href="${href(rootPrefix, '')}"><b>Benepisyo<span>.</span></b><small>${biKey('brand_tag')}</small></a>
  <div class="head-actions"><button class="btn quiet small" id="lang-toggle" type="button">${biKey('lang_switch')}</button></div>
</div></header>
<nav class="nav" aria-label="Main"><div class="wrap">${nav}</div></nav>
<main id="main">${body}</main>
<footer class="site-foot"><div class="wrap">
  <p><b>${biKey('footer_disclaimer')}</b></p>
  <p>${biKey('footer_privacy')}</p>
  <p><a href="${href(rootPrefix, 'tungkol/')}">${biKey('nav_about')}</a> · Data ${esc(meta.data_version)}</p>
</div></footer>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script>${JS}</script>
</body>
</html>
`;
}

/* ---------- Pages ---------- */

function cardHtml(b, rootPrefix) {
  const url = href(rootPrefix, `${b.level === 'local' ? b.city : 'calamba'}/${b.id}/`);
  return `<li class="card" data-id="${b.id}" data-groups="${b.groups.join(' ')}">
  <a class="title" href="${url}">${bi(b.title)}</a>
  ${amountHtml(b)}
  <div class="muted small">${bi(b.frequency)}</div>
  <div class="meta">${levelTag(b)}${badge(b)}<span>${biKey('checked', { date: fmtDate(b.verification.checked_on, 'tl') })}</span></div>
</li>`;
}

function homePage(benefits) {
  const body = `
<div class="wrap">
  <section class="hero">
    <h1>${biKey('hero_title')}</h1>
    <p>${biKey('hero_sub')}</p>
  </section>
  <div id="app" class="stack" aria-live="polite">
    <div class="panel stack">
      <label class="q-title" for="city-input">${biKey('step_city')}</label>
      <p class="muted">${biKey('step_city_hint')}</p>
      <input class="input" id="city-input" list="city-list" autocomplete="off" placeholder="Calamba">
      <a class="btn" href="${href('', 'calamba/')}">${biKey('city_page_title', { city: 'Calamba' })}</a>
    </div>
  </div>
  <noscript><p class="note">${biKey('city_page_sub', { city: 'Calamba' })} <a href="${href('', 'calamba/')}">Calamba</a></p></noscript>
</div>`;
  return layout({
    title: 'Benepisyo',
    description: 'Alamin ang lahat ng benepisyo mo sa lungsod mo: senior, PWD, solo parent, estudyante at nanay. May source at petsa ang bawat isa.',
    rootPrefix: '', page: 'home', body, canonicalPath: '', active: 'home',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Benepisyo', url: SITE_URL + '/', inLanguage: ['tl', 'en'] }
  });
}

function cityPage(city, benefits) {
  const list = benefits.filter((b) => M.appliesToCity(b, city.id));
  const local = list.filter((b) => b.level === 'local');
  const national = list.filter((b) => b.level === 'national');
  const filters = [`<button type="button" data-filter="all" aria-pressed="true">${biKey('filter_all')}</button>`]
    .concat(meta.groups.map((g) => `<button type="button" data-filter="${g.id}" aria-pressed="false">${bi({ tl: g.tl, en: g.en })}</button>`)).join('');
  const body = `
<div class="wrap stack">
  <section class="hero">
    <h1>${biKey('city_page_title', { city: city.name })}</h1>
    <p>${biKey('city_page_sub', { city: city.name })}</p>
  </section>
  <a class="btn block" href="${href('../', '')}">${biKey('start_quiz')}</a>
  <label class="sr-only" for="search">${biKey('search_ph')}</label>
  <input class="input" id="search" type="search" placeholder="${esc(T('search_ph'))}" data-ph-en="${esc(TE('search_ph'))}">
  <p id="search-none" class="muted" hidden>${biKey('search_none')}</p>
  <div class="filters" role="group" aria-label="Filter">${filters}</div>
  <div class="section-label">${biKey('tag_local', { city: city.name })} <span class="count">${local.length}</span></div>
  <ul class="cards" id="list-local">${local.map((b) => cardHtml(b, '../')).join('')}</ul>
  <div class="section-label">${biKey('tag_national')} <span class="count">${national.length}</span></div>
  <ul class="cards" id="list-national">${national.map((b) => cardHtml(b, '../')).join('')}</ul>
</div>`;
  return layout({
    title: `Benepisyo sa ${city.name}`,
    description: T('city_page_sub', { city: city.name }),
    rootPrefix: '../', page: 'city', body, canonicalPath: `${city.id}/`, active: 'city'
  });
}

function detailPage(b, cityId, benefits) {
  const city = cityById[cityId];
  const office = officeById[b.office];
  const st = M.effectiveStatus(b, today);
  const reqs = b.requirements.map((r) => `<li data-doc="${esc(r.doc || '')}"><span class="tick" aria-hidden="true"></span><span>${bi(r)}${r.note ? `<span class="req-note">${bi(r.note)}</span>` : ''} <span class="have-label" hidden>· ${biKey('detail_have')}</span></span></li>`).join('');
  const steps = b.steps.map((s) => `<li>${bi(s)}</li>`).join('');
  const sources = b.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join('');
  const history = (b.history || []).slice().sort((x, y) => (x.date < y.date ? 1 : -1)).map((h) => `<li>${esc(fmtDate(h.date, 'tl'))}: ${bi(h)}</li>`).join('');
  const mapUrl = office && office.map_query ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(office.map_query) : null;
  const warn = st === 'outdated' ? `<p class="note bad">${biKey('outdated_warn')}</p>` : st === 'reported' ? `<p class="note warn">${biKey('reported_warn')}${b.verification.method ? ' ' + bi(b.verification.method) : ''}</p>` : '';
  const body = `
<div class="wrap">
  <p class="crumbs"><a href="${href('../../', cityId + '/')}">${biKey('city_page_title', { city: city.name })}</a></p>
  <article class="stack" data-benefit="${b.id}">
    <header class="detail-head">
      <div class="meta">${levelTag(b)}<span class="tag">${biKey('kind_' + b.kind)}</span></div>
      <h1>${bi(b.title)}</h1>
      ${amountHtml(b)}
      <p class="muted">${bi(b.frequency)}</p>
      <div class="meta">${badge(b)}<span>${biKey('checked', { date: fmtDate(b.verification.checked_on, 'tl') })}</span><span id="checkin-count"></span></div>
      ${warn}
      <p>${bi(b.summary)}</p>
    </header>
    <div id="why-slot"></div>
    <section class="detail-section">
      <h2>${biKey('detail_who')}</h2>
      <p>${bi(b.who)}</p>
    </section>
    <section class="detail-section">
      <h2>${biKey('detail_bring')}</h2>
      <ul class="checklist" id="checklist">${reqs}</ul>
      ${b.free ? `<span class="free-stamp">${biKey('card_free')}</span><p>${biKey('detail_free_more')}${b.free_note ? ' ' + bi(b.free_note) : ''}</p>` : ''}
    </section>
    <section class="detail-section office">
      <h2>${biKey('detail_where')}</h2>
      <p><b>${bi(office.name)}</b>${bi(office.place)}</p>
      <div class="row">${mapUrl ? `<a class="btn secondary small" href="${esc(mapUrl)}" target="_blank" rel="noopener">${biKey('map')}</a>` : ''}${office.web ? `<a class="btn secondary small" href="${esc(office.web)}" target="_blank" rel="noopener">${biKey('website')}</a>` : ''}</div>
    </section>
    <section class="detail-section">
      <h2>${biKey('detail_how')}</h2>
      <ol class="steps">${steps}</ol>
    </section>
    <section class="detail-section">
      <h2>${biKey('detail_source')}</h2>
      <ul class="sources">${sources}</ul>
      <p class="muted small">${bi(b.verification.method)}</p>
      <h3>${biKey('detail_history')}</h3>
      <ul class="history">${history}</ul>
    </section>
    <div class="sticky-cta">
      <button class="btn" type="button" id="plan-visit">${biKey('plan_visit')}</button>
      <button class="btn secondary" type="button" id="share-btn">${biKey('share')}</button>
      <button class="linkish" type="button" id="report-btn">${biKey('report_btn')}</button>
    </div>
  </article>
</div>`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'GovernmentService',
    name: b.title.tl,
    alternateName: b.title.en,
    description: b.summary.tl,
    areaServed: b.level === 'local' ? { '@type': 'City', name: city.name + ', ' + city.province } : { '@type': 'Country', name: 'Philippines' },
    provider: { '@type': 'GovernmentOrganization', name: office.name.en },
    isAccessibleForFree: !!b.free,
    url: canonical(`${cityId}/${b.id}/`)
  };
  return layout({
    title: `${b.title.tl} – ${city.name}`,
    description: b.summary.tl.slice(0, 155),
    rootPrefix: '../../', page: 'detail', body, canonicalPath: `${cityId}/${b.id}/`, active: 'city', jsonld
  });
}

function aboutPage() {
  const body = `
<div class="wrap stack" style="padding-block:24px">
  <h1>${biKey('about_title')}</h1>
  <div class="stack">
    <p><span data-l="tl">Ang Benepisyo ay libreng gabay para malaman ng bawat Pilipino ang lahat ng benepisyong puwede niyang makuha sa sariling lungsod: pambansa at lokal, may eksaktong halaga, dadalhin at opisina.</span><span data-l="en">Benepisyo is a free guide that helps every Filipino find every benefit they can get in their own city: national and local, with exact amounts, what to bring and which office to visit.</span></p>
    <p><b><span data-l="tl">Hindi ito opisyal na website ng gobyerno.</span><span data-l="en">This is not an official government website.</span></b> <span data-l="tl">Ang opisina na nagbibigay ng benepisyo ang magpapasya kung kwalipikado kayo. Kumpirmahin muna bago pumunta.</span><span data-l="en">The issuing office decides eligibility. Confirm before you go.</span></p>
    <h2><span data-l="tl">Paano namin sinisigurong tama</span><span data-l="en">How we keep it accurate</span></h2>
    <ul>
      <li><span data-l="tl">Kumpirmado: may opisyal na source (batas, ordinansa, website o post ng lungsod) at na-check sa loob ng 6 na buwan.</span><span data-l="en">Confirmed: backed by an official source (law, ordinance, city website or post) and checked within 6 months.</span></li>
      <li><span data-l="tl">Ulat: galing sa balita, paaralan o user; hindi pa kumpirmado ng opisyal na source.</span><span data-l="en">Reported: from news, a school or a user; not yet confirmed by an official source.</span></li>
      <li><span data-l="tl">Baka nagbago na: hindi pa nare-recheck nang higit 6 na buwan.</span><span data-l="en">May have changed: not rechecked in over 6 months.</span></li>
    </ul>
    <h2><span data-l="tl">Privacy</span><span data-l="en">Privacy</span></h2>
    <p><span data-l="tl">Walang account. Ang inyong mga sagot at listahan ng pamilya ay naka-save lang sa phone ninyo. Hindi kami humihingi ng ID number, eksaktong kita o birthday. Ang contact sa report ay opsyonal at binubura pagkalipas ng 90 araw (RA 10173, Data Privacy Act).</span><span data-l="en">No accounts. Your answers and family list are saved on your phone only. We never ask for ID numbers, exact income or birthdays. Contact details on reports are optional and deleted after 90 days (RA 10173, Data Privacy Act).</span></p>
    <h2><span data-l="tl">Walang bayad, walang fixer</span><span data-l="en">Free, no fixers</span></h2>
    <p><span data-l="tl">Libre ang mga benepisyong nakalista dito. Huwag magbayad sa sinumang nag-aalok na "ilakad" ito.</span><span data-l="en">The benefits listed here are free. Don't pay anyone offering to "process" them for you.</span></p>
    <p class="muted small">Data ${esc(meta.data_version)} · <span data-l="tl">Ang lungsod na saklaw ngayon: Calamba, Laguna.</span><span data-l="en">City covered now: Calamba, Laguna.</span></p>
  </div>
</div>`;
  return layout({ title: 'Tungkol sa Benepisyo', description: T('footer_disclaimer'), rootPrefix: '../', page: 'about', body, canonicalPath: 'tungkol/', active: 'about' });
}

function notFoundPage() {
  const body = `<div class="wrap stack" style="padding-block:40px"><h1>${biKey('not_found')}</h1><a class="btn" href="/">Benepisyo</a></div>`;
  return layout({ title: 'Benepisyo', description: T('not_found'), rootPrefix: '/', page: 'notfound', body, canonicalPath: '', active: '' });
}

/* Preview hosts that supply their own <html>/<head>/<body>: keep title, styles and content only. */
function artifactMain(full) {
  const head = full.split('<head>')[1].split('</head>')[0];
  const keep = (re) => (head.match(re) || []).join('\n');
  const bodyOpen = full.match(/<body([^>]*)>/)[1];
  const bodyInner = full.split(/<body[^>]*>/)[1].split('</body>')[0];
  return [
    keep(/<title>[\s\S]*?<\/title>/g),
    keep(/<meta name="claude:viewport-fit-sides"[^>]*>/g),
    keep(/<link rel="stylesheet"[^>]*>/g),
    keep(/<style>[\s\S]*?<\/style>/g),
    `<div id="bp-config"${bodyOpen} hidden></div>`,
    bodyInner
  ].join('\n');
}

/* ---------- Static assets ---------- */

function manifest() {
  return JSON.stringify({
    name: 'Benepisyo', short_name: 'Benepisyo', lang: 'tl', start_url: './', scope: './', display: 'standalone',
    background_color: '#f3f6f2', theme_color: '#0b5d4e',
    description: 'Libreng gabay sa benepisyo ng gobyerno, para sa lungsod mo.',
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
  }, null, 2);
}

function serviceWorker(pages) {
  const shell = ['./', 'data.json', 'manifest.webmanifest', 'icon-192.png'].concat(pages);
  return `/* Benepisyo service worker: offline lists, checklists and office info. */
const CACHE = 'benepisyo-${meta.data_version}';
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
      e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; }))));
    }
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  // Network first for pages and data (fresh when online), cache fallback offline.
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('./'))));
});
`;
}

function sitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${esc(canonical(p))}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
}

function writeFile(rel, content) {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

async function main() {
  const benefits = await loadBenefits();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const pagePaths = [''];

  const home = homePage(benefits);
  writeFile('index.html', home);
  if (LINKS === 'file') {
    writeFile('home.html', home);
    writeFile('artifact-main.html', artifactMain(home));
  }
  for (const city of meta.cities.filter((c) => c.supported)) {
    writeFile(`${city.id}/index.html`, cityPage(city, benefits));
    pagePaths.push(`${city.id}/`);
    for (const b of benefits.filter((x) => M.appliesToCity(x, city.id))) {
      writeFile(`${city.id}/${b.id}/index.html`, detailPage(b, city.id, benefits));
      pagePaths.push(`${city.id}/${b.id}/`);
    }
  }
  writeFile('tungkol/index.html', aboutPage());
  pagePaths.push('tungkol/');
  writeFile('404.html', notFoundPage());

  writeFile('data.json', JSON.stringify({ version: meta.data_version, built: today, benefits, offices, meta }));
  writeFile('manifest.webmanifest', manifest());
  writeFile('sw.js', serviceWorker(pagePaths.filter(Boolean)));
  writeFile('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  writeFile('sitemap.xml', sitemap(pagePaths));
  writeFile('_headers', `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(), camera=(), microphone=()\n/sw.js\n  Cache-Control: no-cache\n/data.json\n  Cache-Control: no-cache\n`);
  for (const f of fs.readdirSync(path.join(ROOT, 'public'))) {
    fs.copyFileSync(path.join(ROOT, 'public', f), path.join(OUT, f));
  }
  console.log(`Built ${pagePaths.length} pages into ${path.relative(process.cwd(), OUT) || OUT} (${LINKS} links)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

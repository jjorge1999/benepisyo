#!/usr/bin/env node
/*
 * Benepisyo static site build: React + Ant Design pages, rendered to HTML at build time and hydrated in the browser.
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
const SITE_URL = (process.env.SITE_URL || 'https://benepisyo.pages.dev').replace(/\/$/, '');
const API_BASE = process.env.API_BASE || '';
// Path the site is served under, e.g. '/benepisyo/' on GitHub Pages; '/' on its own domain.
const BASE_PATH = ('/' + (process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '') + '/').replace('//', '/');
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

const read = (p) => fs.readFileSync(p, 'utf8');
const meta = JSON.parse(read(path.join(DATA, 'meta.json')));
const offices = JSON.parse(read(path.join(DATA, 'offices.json')));

async function loadBenefits() {
  if (process.env.BENEFITS_URL) {
    const res = await fetch(process.env.BENEFITS_URL);
    if (!res.ok) throw new Error('Could not load published benefits: HTTP ' + res.status);
    const list = (await res.json()).benefits || [];
    if (list.length) return list;
    console.warn('Published feed is empty; building from data/benefits.json instead.');
  }
  return JSON.parse(read(path.join(DATA, 'benefits.json')));
}

const esbuild = require('esbuild');
const CSS = read(path.join(ROOT, 'src', 'styles.css'));
const BUILD_TMP = path.join(ROOT, '.build');
let renderPage = null; // set in main() after bundling
let CLIENT_JS = '';
let ENTRY = {};
let CHUNKS = [];
const ENTRY_FOR = { home: 'home', city: 'city', detail: 'detail', about: 'about', notfound: 'about' };
const I18N = require('./i18n.js');
const M = require('./match.js');
const T = (k, v) => I18N.t('tl', k, v);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const officeById = Object.fromEntries(offices.map((o) => [o.id, o]));
const cityById = Object.fromEntries(meta.cities.map((c) => [c.id, c]));
const today = process.env.BUILD_DATE || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); // Philippine date

function canonical(p) { return SITE_URL + '/' + p; }

const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function layout({ title, description, rootPrefix, canonicalPath, jsonld, props }) {
  const { html, css } = renderPage(props);
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&display=swap">
<style>${CSS}</style>
${css}
${jsonld ? `<script type="application/ld+json">${safeJson(jsonld)}</script>` : ''}
</head>
<body>
<div id="root">${html}</div>
<script id="bp-props" type="application/json">${safeJson(props)}</script>
${LINKS === 'file' ? `<script>${CLIENT_JS}</script>` : `<script type="module" src="${rootPrefix}${ENTRY[ENTRY_FOR[props.page]]}"></script>`}
</body>
</html>
`;
}

/* ---------- Pages ---------- */

const CARD_FIELDS = ['id', 'level', 'city', 'groups', 'title', 'amount_php', 'amount_note', 'value', 'frequency', 'expires_on', 'no_apply', 'verification', 'summary', 'keywords', 'kind'];
const slim = (b) => Object.fromEntries(CARD_FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
const cfgFor = (rootPrefix) => ({ root: rootPrefix, links: LINKS, api: API_BASE, site: SITE_HOST, today, base: BASE_PATH });

function homePage() {
  return layout({
    title: 'Benepisyo',
    description: 'Alamin ang lahat ng benepisyo mo sa lungsod mo: pamilya, senior, PWD, solo parent, estudyante at nanay. May source at petsa ang bawat isa.',
    rootPrefix: '', canonicalPath: '',
    props: { page: 'home', cfg: cfgFor(''), data: { meta } },
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Benepisyo', url: SITE_URL + '/', inLanguage: ['tl', 'en'] }
  });
}

function cityPage(city, benefits) {
  const list = benefits.filter((b) => M.appliesToCity(b, city.id)).map(slim);
  return layout({
    title: `Benepisyo sa ${city.name}`,
    description: T('city_page_sub', { city: city.name }),
    rootPrefix: '../', canonicalPath: `${city.id}/`,
    props: { page: 'city', cfg: cfgFor('../'), city, data: { meta, benefits: list } },
    jsonld: { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: list.map((b, i) => ({ '@type': 'ListItem', position: i + 1, url: canonical(`${city.id}/${b.id}/`), name: b.title.tl })) }
  });
}

function detailPage(b, cityId) {
  const city = cityById[cityId];
  const office = officeById[b.office];
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
    rootPrefix: '../../', canonicalPath: `${cityId}/${b.id}/`, jsonld,
    props: { page: 'detail', cfg: cfgFor('../../'), city, benefit: b, office, data: { meta, benefits: [b], offices: [office] } }
  });
}

function aboutPage() {
  return layout({ title: 'Tungkol sa Benepisyo', description: T('footer_disclaimer'), rootPrefix: '../', canonicalPath: 'tungkol/', props: { page: 'about', cfg: cfgFor('../'), data: { meta } } });
}

function notFoundPage() {
  return layout({ title: 'Benepisyo', description: T('not_found'), rootPrefix: BASE_PATH, canonicalPath: '', props: { page: 'notfound', cfg: cfgFor(BASE_PATH), data: { meta } } });
}

/* Preview hosts that supply their own <html>/<head>/<body>: keep title, styles and content only. */
function artifactMain(full) {
  const head = full.split('<head>')[1].split('</head>')[0];
  const keep = (re) => (head.match(re) || []).join('\n');
  const bodyInner = full.split(/<body[^>]*>/)[1].split('</body>')[0];
  return [
    keep(/<title>[\s\S]*?<\/title>/g),
    keep(/<meta name="claude:viewport-fit-sides"[^>]*>/g),
    keep(/<link rel="stylesheet"[^>]*>/g),
    keep(/<style[^>]*>[\s\S]*?<\/style>/g),
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
  const shell = ['./', 'data.json', 'manifest.webmanifest', 'icon-192.png'].concat(CHUNKS.map((c) => c.rel), pages);
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

async function bundle() {
  const common = { bundle: true, jsx: 'automatic', loader: { '.js': 'jsx' }, logLevel: 'warning', legalComments: 'none' };
  fs.mkdirSync(BUILD_TMP, { recursive: true });
  const serverFile = path.join(BUILD_TMP, 'server.cjs');
  await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'src/ui/entry-server.jsx')], platform: 'node', format: 'cjs', outfile: serverFile, define: { 'process.env.NODE_ENV': '"production"' } });
  delete require.cache[serverFile];
  renderPage = require(serverFile).render;
  const client = { ...common, platform: 'browser', minify: true, target: 'es2020', define: { 'process.env.NODE_ENV': '"production"' } };
  if (LINKS === 'file') {
    const out = await esbuild.build({ ...client, entryPoints: [path.join(ROOT, 'src/ui/entry-all.jsx')], format: 'iife', write: false });
    CLIENT_JS = out.outputFiles[0].text;
    return;
  }
  // One small bundle per page type plus shared chunks, so each page downloads only what it uses.
  const out = await esbuild.build({
    ...client,
    entryPoints: ['home', 'city', 'detail', 'about'].map((n) => ({ in: path.join(ROOT, `src/ui/entry-${n}.jsx`), out: n })),
    format: 'esm', splitting: true, outdir: path.join(OUT, 'js'), entryNames: '[name]-[hash]', chunkNames: 'c-[hash]', metafile: true, write: false
  });
  ENTRY = {};
  CHUNKS = [];
  for (const f of out.outputFiles) {
    const rel = path.relative(OUT, f.path).split(path.sep).join('/');
    CHUNKS.push({ rel, text: f.text });
    const m = rel.match(/^js\/(home|city|detail|about)-/);
    if (m) ENTRY[m[1]] = rel;
  }
}

async function main() {
  await bundle();
  const benefits = (await loadBenefits()).filter((b) => !b.expires_on || b.expires_on >= today);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const pagePaths = [''];

  for (const c of CHUNKS) writeFile(c.rel, c.text);
  const home = homePage();
  writeFile('index.html', home);
  if (LINKS === 'file') {
    writeFile('home.html', home);
    writeFile('artifact-main.html', artifactMain(home));
  }
  for (const city of meta.cities.filter((c) => c.supported)) {
    writeFile(`${city.id}/index.html`, cityPage(city, benefits));
    pagePaths.push(`${city.id}/`);
    for (const b of benefits.filter((x) => M.appliesToCity(x, city.id))) {
      writeFile(`${city.id}/${b.id}/index.html`, detailPage(b, city.id));
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
  writeFile('.nojekyll', '');
  writeFile('_headers', `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(self), camera=(), microphone=()\n/sw.js\n  Cache-Control: no-cache\n/data.json\n  Cache-Control: no-cache\n`);
  for (const f of fs.readdirSync(path.join(ROOT, 'public'))) {
    fs.copyFileSync(path.join(ROOT, 'public', f), path.join(OUT, f));
  }
  console.log(`JS ${CHUNKS.map((c) => c.rel.slice(3) + ' ' + Math.round(c.text.length / 1024) + 'KB').join(', ')}. Built ${pagePaths.length} pages into ${path.relative(process.cwd(), OUT) || OUT} (${LINKS} links)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

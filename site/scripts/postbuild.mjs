#!/usr/bin/env node
/* After `ng build`: dark theme link, 404 page, sitemap, robots, manifest, offline service worker, GitHub Pages files. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../dist/browser');
const data = JSON.parse(fs.readFileSync(path.resolve(here, '../src/generated/data.json'), 'utf8'));
const write = (rel, s) => fs.writeFileSync(path.join(OUT, rel), s);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const rel = (f) => path.relative(OUT, f).split(path.sep).join('/');

// Dark theme: a separate stylesheet the browser only applies in dark mode.
const dark = fs.readdirSync(OUT).find((f) => /^dark(-[A-Z0-9]+)?\.css$/.test(f));
const pages = walk(OUT).filter((f) => f.endsWith('.html'));
for (const f of pages) {
  let html = fs.readFileSync(f, 'utf8');
  if (dark && !html.includes(dark)) html = html.replace('</head>', `<link rel="stylesheet" href="${dark}" media="(prefers-color-scheme: dark)"></head>`);
  fs.writeFileSync(f, html);
}

// GitHub Pages serves 404.html for unknown paths.
// GitHub Pages serves 404.html for any path without a file: the client shell renders towns that are not pre-built.
if (fs.existsSync(path.join(OUT, 'index.csr.html'))) fs.renameSync(path.join(OUT, 'index.csr.html'), path.join(OUT, '404.html'));

const htmlPaths = walk(OUT).filter((f) => f.endsWith('index.html')).map((f) => rel(f).replace(/index\.html$/, '')).sort();
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${htmlPaths.map((p) => `  <url><loc>${data.site_url}/${p}</loc><lastmod>${data.built}</lastmod></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${data.site_url}/sitemap.xml\n`);
write('data.json', JSON.stringify(data));
write('manifest.webmanifest', JSON.stringify({
  name: 'Benepisyo', short_name: 'Benepisyo', lang: 'tl', start_url: './', scope: './', display: 'standalone',
  background_color: '#f5f7f6', theme_color: '#0b5d4e', description: 'Libreng gabay sa benepisyo ng gobyerno, para sa lungsod mo.',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
}, null, 2));
write('.nojekyll', '');
write('_headers', `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: geolocation=(self), camera=(), microphone=()\n/sw.js\n  Cache-Control: no-cache\n`);

// Offline: cache the app shell, scripts, styles and every page; network first so updates show when online.
const assets = walk(OUT).map(rel).filter((p) => /\.(js|css|png|webmanifest)$/.test(p) && !p.startsWith('og'));
// Pre-cache the shell and every benefit page; city pages are cached as they are visited (there are 150 of them).
const benefitPages = htmlPaths.filter((p) => p.split('/').length === 3);
const shell = ['./', '404.html', 'tungkol/'].concat(benefitPages, assets);
write('sw.js', `/* Benepisyo service worker: offline lists, checklists and office info. */
const CACHE = 'benepisyo-${data.version}-${Date.now().toString(36)}';
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
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
  if (url.pathname.includes('/api/')) return;
  e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
    .catch(() => caches.match(req).then((hit) => hit || caches.match('404.html'))));
});
`);
console.log(`postbuild: ${htmlPaths.length} pages, dark theme ${dark || 'missing'}, ${assets.length} cached assets`);

/* Benepisyo service worker: offline lists, checklists and office info. */
const CACHE = 'benepisyo-2026-10-19.4-mvefakh8';
const SHELL = ["./","404.html","tungkol/","b/aics/","b/four-ps/","b/free-tuition-sucs/","b/lgu-pwd-id/","b/lgu-senior-id/","b/lgu-solo-parent-id/","b/lifeline-rate/","b/maternity-leave/","b/philhealth-gamot/","b/philhealth-yakap/","b/pwd-discount/","b/senior-discount/","b/senior-milestone-cash-gift/","b/senior-social-pension/","b/solo-parent-discount/","b/solo-parent-leave/","b/solo-parent-subsidy/","b/tupad/","b/uplift-2026/","calamba/calamba-balik-probinsya/","calamba/calamba-burial-aid/","calamba/calamba-calamity-aid/","calamba/calamba-ccc-free-tuition/","calamba/calamba-city-scholarship/","calamba/calamba-free-skills-training/","calamba/calamba-hospital-aid/","calamba/calamba-indigency-certificate/","calamba/calamba-livelihood-capital/","calamba/calamba-medical-aid/","calamba/calamba-pwd-id/","calamba/calamba-senior-birthday-cash/","calamba/calamba-senior-id/","calamba/calamba-solo-parent-id/","chunk-87ftPNDu.js","chunk-8QRuxSTg.js","chunk-BSdgRVpi.js","chunk-BcTyC1Hc.js","chunk-BgIpR3S3.js","chunk-BnG55Hur.js","chunk-CiZmJf-Z.js","chunk-DAj4A2dP.js","chunk-DZd4yXw_.js","chunk-M0IIhWeF.js","chunk-iHKGEWv4.js","dark.css","icon-192.png","icon-512.png","main-UIRWXKI2.js","manifest.webmanifest","styles-RULMG4SX.css"];
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

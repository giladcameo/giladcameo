/*
 * Service worker for gcameo.com
 *
 * Privacy notes (DSGVO / TDDDG §25):
 * - Only this site's own, public, static files are ever stored in the Cache
 *   Storage (icon, manifest, self-hosted fonts and vendor libraries). They
 *   contain no personal data.
 * - Cross-origin requests (map tiles, transit / OSM / open-data APIs) are NOT
 *   intercepted at all: the browser handles them normally and the service
 *   worker never stores their responses. Search queries, addresses and
 *   locations therefore never end up in the cache.
 * - HTML pages (incl. datenschutz.html, barrierefreiheit.html)
 *   are always fetched from the network so legal texts are never stale. They
 *   are not written to the cache.
 */
const CACHE = 'giladcameo-v5';
const STATIC = [
  './icon.png',
  './manifest.json',
  './assets/fonts/fonts.css',
  './assets/fonts/inter-latin-wght-normal.woff2',
  './assets/fonts/ibm-plex-mono-latin-400-normal.woff2',
  './assets/fonts/ibm-plex-mono-latin-500-normal.woff2',
  './assets/fonts/ibm-plex-mono-latin-600-normal.woff2',
  './assets/fonts/ibm-plex-mono-latin-700-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .catch(() => { /* a missing optional file must not block installation */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;

  /* Only handle same-origin GET requests. Everything else (third-party APIs,
     map tiles, POST requests) goes straight to the network, untouched and
     uncached. */
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Network-first for all HTML pages (including the legal pages): always get
     the latest version; fall back to a cached copy only if one exists. */
  const isHTML = req.mode === 'navigate' || req.destination === 'document' ||
    url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isHTML) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  /* Cache-first for the site's own static assets (fonts, vendor libraries,
     icons). Successful responses under /assets/ are added to the cache so
     they are served locally next time. Bump CACHE when these files change. */
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && res.type === 'basic' && url.pathname.includes('/assets/')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});

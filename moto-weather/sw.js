// Service worker: caches the app shell only. API hosts (geocoding, routing, forecast) and map tiles
// are never intercepted, so a stale forecast or an error response can never be served from cache.
// Bump VERSION on every release: it renames the cache, the old one is deleted on activate, and the
// page shows an "update available" prompt (the new worker waits until the user accepts).
const VERSION = 'v1.1.0';
const SHELL_CACHE = `mwr-shell-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/i18n.js',
  'js/geo.js',
  'js/weather.js',
  'js/risk.js',
  'js/comfort.js',
  'js/planner.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    // CDN assets are best effort: a failure must not block installation.
    await Promise.all(CDN.map(async (u) => {
      try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await cache.put(u, r); } catch (e) { /* offline at install */ }
    }));
    // No automatic skipWaiting: the page asks for it (message below) so a reload never happens mid-ride.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith('mwr-') && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App shell (same origin and pinned CDN files): cache first.
  const isShell = url.origin === self.location.origin || CDN.includes(req.url);
  if (!isShell) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit; // versioned cache: files only change together, via a VERSION bump
    const refresh = fetch(req).then((res) => {
      if (res.ok && res.status === 200 && res.type !== 'opaque') cache.put(req, res.clone()).catch(() => {});
      return res;
    });
    try { return await refresh; }
    catch (err) {
      if (req.mode === 'navigate') { const idx = await cache.match('index.html'); if (idx) return idx; }
      throw err;
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

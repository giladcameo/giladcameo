const CACHE = 'giladcameo-v3';
const STATIC = [
  './icon.png',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
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
  const url = e.request.url;

  /* Always network-first for VBB API */
  if (url.includes('vbb.transport.rest')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ departures: [] }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  /* Network-first for all HTML pages — always get the latest version */
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  /* Cache-first for static assets (images, manifest) */
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

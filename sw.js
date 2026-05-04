const CACHE = 'berlin-transit-v1';
const SHELL = ['./'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
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

/* Network-first for API calls, cache-first for shell */
self.addEventListener('fetch', e => {
  const url = e.request.url;

  /* Always go network-first for VBB API */
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

  /* Cache-first for the app shell */
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

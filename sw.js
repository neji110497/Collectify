const PRECACHE = 'collectify-precache-v2';
const RUNTIME = 'collectify-runtime-v2';
const PRECACHE_URLS = [
  './collectify.html',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== PRECACHE && key !== RUNTIME) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // passthrough non-GET

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // App shell navigation: prefer network, fallback to cached collectify.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        return net;
      } catch (e) {
        const cache = await caches.open(PRECACHE);
        const cached = await cache.match('./collectify.html');
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Same-origin assets: cache-first, update in background
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(PRECACHE);
      const cached = await cache.match(req);
      if (cached) {
        event.waitUntil((async () => {
          try {
            const fresh = await fetch(req);
            if (fresh && fresh.ok) cache.put(req, fresh.clone());
          } catch (_) {}
        })());
        return cached;
      }
      try {
        const net = await fetch(req);
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Cross-origin (e.g., model files/CDNs): network-first with runtime cache fallback
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    try {
      const net = await fetch(req, { mode: req.mode, credentials: 'omit' });
      if (net && (net.status === 200 || net.type === 'opaque')) {
        cache.put(req, net.clone());
      }
      return net;
    } catch (e) {
      const cached = await cache.match(req);
      return cached || Response.error();
    }
  })());
});

// AI-ROS Service Worker
// Strategy:
//  - Navigation requests: network-first, fall back to offline page.
//  - Static assets (_next/static, /favicon.svg, /manifest.json): stale-while-revalidate.
//  - API requests (/api/*): network-only, never cache to avoid stale data.
const SW_VERSION = 'airos-v1';
const STATIC_CACHE = `${SW_VERSION}-static`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([OFFLINE_URL, '/favicon.svg', '/manifest.json']).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(SW_VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API: network only
  if (url.pathname.startsWith('/api/') || url.host !== self.location.host && url.protocol === 'https:') {
    return;
  }

  // Static assets
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/favicon.svg' || url.pathname === '/manifest.json') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Same-origin navigations
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

async function networkFirst(req) {
  try {
    const response = await fetch(req);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(req, response.clone());
    return response;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const networkFetch = fetch(req)
    .then((response) => {
      if (response && response.status === 200) cache.put(req, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

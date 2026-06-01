/*
  Basic PWA service worker:
  - Precaches core shell pages/assets
  - Runtime caching for images
  - Network-first for API calls

  Note: Update CACHE_VERSION when you deploy changes.
*/

// Bump this on every deploy to ensure clients receive updated assets.
// This fixes cases where pages (e.g. wishlist) load without CSS due to stale SW caches.
const CACHE_VERSION = 'v3';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',

  // Core shared assets
  '/style.css',
  '/product-card.css',
  '/script.js',
  '/theme.js',
  '/manifest.json',
  '/offline.html',

  // Pages + their page-level styles
  '/wishlist.html',
  '/wishlist.css',
  '/compare.html',
  '/login.html',
  '/register.html',
  '/checkout.html',
  '/admin-login.html',
  '/admin.html',
  '/about.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k.startsWith('static-') || k.startsWith('runtime-'))
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

function isApiRequest(req) {
  try {
    const url = new URL(req.url);
    return url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // Ignore unsupported schemes (e.g. chrome-extension:// injected by extensions)
  // Otherwise cache.put() will throw and the SW will spam console errors.
  try {
    const u = new URL(req.url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return
  } catch {
    return
  }

  // Network-first for API
  if (isApiRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(() => caches.match(req))
    );
    return;
  }

  // Runtime cache for images
  if (req.destination === 'image') {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);

          // Avoid caching partial-content responses (206) which are not storable in Cache API.
          // This can happen with range requests or some CDNs.
          if (fresh && fresh.ok && fresh.status !== 206) {
            cache.put(req, fresh.clone());
          }

          return fresh;
        } catch {
          return cached || new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  // Default: cache-first for static (offline fallback)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Avoid caching partial-content responses (206) which are not storable in Cache API.
          if (!res || !res.ok || res.status === 206) return res;
          return caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(req, res.clone());
            return res;
          });
        })
        .catch(async () => {
          // If navigation request, show offline page
          if (req.mode === 'navigate') {
            const offline = await caches.match('/offline.html');
            if (offline) return offline;
          }
          throw new Error('Offline');
        });
    })
  );
});

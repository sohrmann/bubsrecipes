const CACHE_NAME = 'bubs-recipes-v1';

// Core assets to pre-cache immediately on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './static/css/output.css',
  './static/css/cooking-mode.css',
  './static/js/custom.js',
  './static/js/search.js',
  './static/js/timers.js',
  './static/js/cooking-mode.js',
  './static/search-index.js',
  './static/site.webmanifest',
  './static/favicon.ico',
  './static/apple-touch-icon.png',
  './static/android-chrome-192x192.png',
  './static/android-chrome-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-cache partial notice:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML, JS, CSS & Manifest: Stale-While-Revalidate (instant offline access, background update for new recipes)
  const isDynamicAsset =
    event.request.headers.get('accept')?.includes('text/html') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('.json');

  if (isDynamicAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const ignoreSearchReq = url.search ? new Request(url.origin + url.pathname) : event.request;
        const cachedResponse = (await cache.match(event.request)) || (await cache.match(ignoreSearchReq));
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(ignoreSearchReq, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Static Assets (CSS, JS, images, icons, fonts): Cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});

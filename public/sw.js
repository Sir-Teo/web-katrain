const CACHE_VERSION = 'web-katrain-v2';
const APP_SHELL_CACHE = `${CACHE_VERSION}:shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa/icon.svg',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
  './pwa/apple-touch-icon.png',
  './pwa/screenshot-wide.png',
  './pwa/screenshot-mobile.png',
  './models/katago-small.bin.gz',
  './tfjs/tfjs-backend-wasm.wasm',
  './tfjs/tfjs-backend-wasm-simd.wasm',
  './tfjs/tfjs-backend-wasm-threaded-simd.wasm',
  './katrain/B_stone.png',
  './katrain/W_stone.png',
  './katrain/board.png',
  './katrain/dot.png',
  './katrain/graph_bg.png',
  './katrain/inner.png',
  './katrain/topmove.png',
];

const isSameOrigin = (url) => url.origin === self.location.origin;

const isCacheFirstAsset = (url) =>
  /\.(?:png|jpg|jpeg|webp|svg|gif|wasm|bin|gz|woff2?)$/i.test(url.pathname) ||
  url.pathname.includes('/models/') ||
  url.pathname.includes('/tfjs/') ||
  url.pathname.includes('/themes/') ||
  url.pathname.includes('/katrain/');

/**
 * Whether a response may go in the cache.
 *
 * `response.ok` is not the test: it is true for 206 Partial Content, and
 * `cache.put()` throws on those — "Partial response (status code 206) is
 * unsupported". Browsers issue Range requests for exactly the assets this app
 * is largest in: the recommended network is ~96MB and the TFJS wasm files are
 * megabytes each. Caching on `.ok` alone therefore meant a rejected promise on
 * a perfectly ordinary request. Found by comparison with web-chess's worker,
 * which had inherited the same shape.
 */
const isStorableResponse = (response) => response.status === 200;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful navigations; a transient 404/500 must not
          // become the offline shell.
          if (isStorableResponse(response)) {
            const copy = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put('./', copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(APP_SHELL_CACHE);
          return (await cache.match('./')) || cache.match('./index.html');
        })
    );
    return;
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (isStorableResponse(response)) {
              const copy = response.clone();
              caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          })
      )
    );
    return;
  }

  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      try {
        const response = await fetch(request);
        // Quota is the realistic failure here, and a cache miss later beats a
        // rejected fetch now.
        if (isStorableResponse(response)) {
          cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        return caches.match(request);
      }
    })
  );
});

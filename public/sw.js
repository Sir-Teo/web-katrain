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
          const copy = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put('./', copy));
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
            if (response.ok) {
              const copy = response.clone();
              caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, copy));
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
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        return caches.match(request);
      }
    })
  );
});

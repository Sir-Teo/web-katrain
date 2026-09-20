const CACHE_VERSION = 'web-katrain-v3';
const APP_SHELL_CACHE = `${CACHE_VERSION}:shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;
const MAX_RUNTIME_CACHE_ENTRIES = 64;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './pwa/icon.svg',
  './pwa/icon-192.png',
  './pwa/icon-512.png',
  './pwa/apple-touch-icon.png',
  // The manifest's screenshots are not here on purpose. They are 504KB of the
  // install dialog's rich preview and of the social card in index.html -- shown
  // by the browser, the OS or a crawler, never by the running app, and never
  // wanted offline. They stay runtime-cacheable like any other image, so
  // nothing is lost if something does ask for them.
  './models/katago-small.bin.gz',
  // One of the three TFJS builds, not all three. TFJS picks exactly one at
  // runtime: the threaded one only when the page is cross-origin isolated, the
  // plain one only where SIMD is missing, and the SIMD one otherwise. The
  // deployed site is GitHub Pages, which cannot send COOP/COEP -- README and
  // docs/deployment.md both say so -- and without them `SharedArrayBuffer` is
  // undefined, which is the feature test TFJS uses. So on the live site the
  // threaded build is never requested, and no browser new enough to run this
  // app asks for the non-SIMD one either.
  //
  // That made 746KB of a 1.17MB wasm precache dead weight on the first visit,
  // for the same reason the manifest screenshots are not in this list. Both of
  // the others stay cache-first at runtime, so a self-hosted deployment that
  // does send the headers still keeps its threaded build after using it once.
  './tfjs/tfjs-backend-wasm-simd.wasm',
  // Only the images the *default* board draws are here. `dot`, `inner` and
  // `topmove` are drawn by GoBoard under every theme, and `graph_bg` is 694
  // bytes.
  //
  // The other three are 484KB -- 73% of this list -- for surfaces the default
  // experience never renders: `board.png` is the bamboo texture alone, and the
  // two stones belong to bamboo, flat and dark. Anyone who picks one of those
  // themes fetches them once and cache-first keeps them, so a theme that has
  // ever been used still works offline. What this trades away is narrow and
  // cosmetic: choosing one of those three themes for the first time while
  // offline falls back to the flat board colour, and the pass-preview chip
  // (which borrows a stone image under every theme) loses its stone until the
  // first time online.
  './katrain/dot.png',
  './katrain/graph_bg.png',
  './katrain/inner.png',
  './katrain/topmove.png',
];

/**
 * The two entries the app cannot start without.
 *
 * `cache.addAll` is atomic: one failed request rejects the whole promise, so
 * `install` never resolves, the worker never activates, and the app is left
 * with no offline support at all -- silently, and again on the next visit if
 * the cause is not transient. The list above is 5MB of model and wasm over
 * whatever connection the first visit happens to have, which is the part most
 * likely to fail and the part least worth failing for: every one of those is
 * cache-first at runtime, so a visit that uses them caches them anyway.
 *
 * So the shell is fetched atomically -- half a shell serves a broken page
 * offline -- and everything else is allowed to fail on its own.
 */
const PRECACHE_REQUIRED = ['./', './index.html'];

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
const isCacheableRequest = (request) => request.cache !== 'no-store';

/**
 * Keep old hashed bundles from accumulating across deployments. Cache keys are
 * returned in insertion order, so deleting the excess from the front retains
 * the most recently seen assets. Failures stay best-effort: caching must never
 * turn a successful network response into a failed app request.
 */
const trimRuntimeCache = async (cache) => {
  const keys = await cache.keys();
  const excess = keys.length - MAX_RUNTIME_CACHE_ENTRIES;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
};

const putRuntimeResponse = (cache, request, response) =>
  cache
    .put(request, response)
    .then(() => trimRuntimeCache(cache))
    .catch(() => undefined);

/**
 * Install does *not* call `skipWaiting()`.
 *
 * It used to, unconditionally, which quietly defeated the app's own update
 * flow: a replacement worker went straight past the waiting state, so
 * `registration.waiting` was null by the time the "Update ready" banner was
 * clicked, `requestPwaUpdateActivation`'s whole postMessage/controllerchange
 * path was unreachable, and the `SKIP_WAITING` handler below was dead code.
 * What actually happened instead was the opposite of what the banner offers:
 * the new worker claimed a page still running the previous bundle, before
 * anyone agreed to update.
 *
 * Waiting costs nothing on a first install -- with no active worker to replace,
 * the new one activates immediately either way, and `clients.claim()` below is
 * what takes over the page that registered it.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) =>
        cache
          .addAll(PRECACHE_REQUIRED)
          .then(() =>
            Promise.allSettled(
              PRECACHE_URLS.filter((url) => !PRECACHE_REQUIRED.includes(url)).map((url) => cache.add(url))
            )
          )
      )
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

/** The page asking for the update it just offered the reader. */
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
          if (isCacheableRequest(request) && isStorableResponse(response)) {
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
            if (isCacheableRequest(request) && isStorableResponse(response)) {
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
        if (isCacheableRequest(request) && isStorableResponse(response)) {
          putRuntimeResponse(cache, request, response.clone());
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

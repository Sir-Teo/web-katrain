import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Listener = (event: never) => void;

type FakeResponse = { status: number; body: string; clone: () => FakeResponse };
const response = (body: string, status = 200): FakeResponse => ({
  status,
  body,
  clone: () => response(body, status),
});

/**
 * Runs public/sw.js with a stub `self` and `caches` and returns what `install`
 * did. The worker only registers listeners at load time — every use of
 * `self.location`, `fetch` and `clients` sits inside a handler — so a plain
 * function wrapper is enough to reach the install path.
 */
function runInstall(options: { failing?: string[] } = {}) {
  const failing = new Set(options.failing ?? []);
  const added: string[] = [];
  const listeners = new Map<string, Listener>();
  let skipWaitingCalls = 0;

  const cache = {
    add: (url: string) =>
      failing.has(url)
        ? Promise.reject(new Error(`offline: ${url}`))
        : Promise.resolve(added.push(url) && undefined),
    addAll: (urls: string[]) =>
      Promise.all(urls.map((url) => cache.add(url))).then(() => undefined),
  };

  const selfStub = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => { skipWaitingCalls += 1; },
    clients: { claim: () => Promise.resolve() },
    location: { origin: 'https://example.test' },
  };
  const cachesStub = { open: () => Promise.resolve(cache), keys: () => Promise.resolve([]), delete: () => Promise.resolve(true) };

  const source = readFileSync('public/sw.js', 'utf8');
  new Function('self', 'caches', source)(selfStub, cachesStub);

  const install = listeners.get('install') as unknown as (e: { waitUntil: (p: Promise<unknown>) => void }) => void;
  expect(install, 'sw.js registered no install listener').toBeTruthy();
  let waited: Promise<unknown> = Promise.resolve();
  install({ waitUntil: (p) => { waited = p; } });

  return waited.then(() => ({ added, skipWaitingCalls }));
}

/**
 * The same wrapper, driving the fetch listener. Caches are plain Maps and the
 * network is whatever `network` returns, so a test can say "offline" by
 * throwing.
 */
function runFetch(options: {
  url: string;
  mode?: string;
  network?: (url: string) => FakeResponse;
  seeded?: Record<string, Record<string, FakeResponse>>;
}) {
  const stores: Record<string, Map<string, FakeResponse>> = {};
  for (const [name, entries] of Object.entries(options.seeded ?? {})) {
    stores[name] = new Map(Object.entries(entries));
  }
  const keyOf = (request: unknown) =>
    typeof request === 'string' ? request : (request as { url: string }).url;

  const openCache = (name: string) => {
    const store = (stores[name] ??= new Map());
    return {
      match: (request: unknown) => Promise.resolve(store.get(keyOf(request))),
      put: (request: unknown, value: FakeResponse) => Promise.resolve(store.set(keyOf(request), value) && undefined),
      keys: () => Promise.resolve([...store.keys()]),
      delete: (request: unknown) => Promise.resolve(store.delete(keyOf(request))),
      add: () => Promise.resolve(),
      addAll: () => Promise.resolve(),
    };
  };

  const listeners = new Map<string, Listener>();
  const selfStub = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() },
    location: { origin: 'https://example.test' },
  };
  const cachesStub = {
    open: (name: string) => Promise.resolve(openCache(name)),
    keys: () => Promise.resolve(Object.keys(stores)),
    delete: () => Promise.resolve(true),
    match: (request: unknown) => {
      for (const store of Object.values(stores)) {
        const hit = store.get(keyOf(request));
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(undefined);
    },
  };

  const network = options.network ?? ((url: string) => response(`network:${url}`));
  const fetchStub = (request: unknown) => {
    try {
      return Promise.resolve(network(keyOf(request)));
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const source = readFileSync('public/sw.js', 'utf8');
  new Function('self', 'caches', 'fetch', source)(selfStub, cachesStub, fetchStub);

  const handler = listeners.get('fetch') as unknown as (e: {
    request: unknown;
    respondWith: (p: Promise<FakeResponse | undefined>) => void;
  }) => void;
  let answered: Promise<FakeResponse | undefined> | null = null;
  handler({
    request: { url: options.url, method: 'GET', mode: options.mode ?? 'no-cors', cache: 'default' },
    respondWith: (p) => { answered = p; },
  });

  return { answered: answered as Promise<FakeResponse | undefined> | null, stores };
}

describe('service worker install', () => {
  it('caches the whole list when every request succeeds', async () => {
    const { added, skipWaitingCalls } = await runInstall();

    expect(added).toContain('./');
    expect(added).toContain('./index.html');
    expect(added).toContain('./models/katago-small.bin.gz');
    expect(added.filter((url) => url.endsWith('.wasm'))).toHaveLength(3);
    expect(skipWaitingCalls).toBe(1);
  });

  it('still installs when a large optional asset cannot be fetched', async () => {
    // `addAll` is atomic. Precaching the whole list through it meant one failed
    // request — the 3.7MB model over a bad connection, most likely — rejected
    // the install, so skipWaiting never ran and the app had no offline support
    // at all, silently, and again on the next visit.
    const { added, skipWaitingCalls } = await runInstall({
      failing: ['./models/katago-small.bin.gz', './tfjs/tfjs-backend-wasm-simd.wasm'],
    });

    expect(skipWaitingCalls).toBe(1);
    expect(added).toContain('./');
    expect(added).toContain('./index.html');
    expect(added).toContain('./pwa/icon-192.png');
    expect(added).not.toContain('./models/katago-small.bin.gz');
  });

  it('fails the install when the shell itself cannot be cached', async () => {
    // Half a shell serves a broken page offline, so this one is worth retrying
    // on the next visit rather than activating around.
    await expect(runInstall({ failing: ['./index.html'] })).rejects.toThrow(/index\.html/);
  });
});

const SHELL = 'web-katrain-v3:shell';
const RUNTIME = 'web-katrain-v3:runtime';
const ORIGIN = 'https://example.test';

describe('service worker fetch', () => {
  it('serves the cached shell when a navigation cannot reach the network', async () => {
    const { answered } = runFetch({
      url: `${ORIGIN}/`,
      mode: 'navigate',
      network: () => { throw new Error('offline'); },
      seeded: { [SHELL]: { './': response('cached shell') } },
    });

    expect((await answered!)?.body).toBe('cached shell');
  });

  it('does not let a failed navigation become the offline shell', async () => {
    // A transient 404 or 500 cached as './' would serve that error page to
    // every later offline visit.
    const { answered, stores } = runFetch({
      url: `${ORIGIN}/`,
      mode: 'navigate',
      network: () => response('server error', 500),
      seeded: { [SHELL]: { './': response('good shell') } },
    });

    expect((await answered!)?.body).toBe('server error');
    expect(stores[SHELL]!.get('./')!.body).toBe('good shell');
  });

  it('answers a cache-first asset without touching the network', async () => {
    let networkCalls = 0;
    const { answered } = runFetch({
      url: `${ORIGIN}/models/katago-small.bin.gz`,
      network: () => { networkCalls += 1; return response('from network'); },
      seeded: { [SHELL]: { [`${ORIGIN}/models/katago-small.bin.gz`]: response('from cache') } },
    });

    expect((await answered!)?.body).toBe('from cache');
    expect(networkCalls).toBe(0);
  });

  it('keeps a range response out of the cache', async () => {
    // `cache.put()` throws on 206 Partial Content, and browsers issue Range
    // requests for exactly the assets this app is largest in. Caching on
    // `response.ok` alone rejected the promise on an ordinary request.
    const url = `${ORIGIN}/tfjs/tfjs-backend-wasm.wasm`;
    const { answered, stores } = runFetch({ url, network: () => response('partial', 206) });

    expect((await answered!)?.body).toBe('partial');
    expect(stores[SHELL]?.has(url) ?? false).toBe(false);
  });

  it('falls back to the runtime cache when a plain request goes offline', async () => {
    const url = `${ORIGIN}/assets/main-abc123.js`;
    const { answered } = runFetch({
      url,
      network: () => { throw new Error('offline'); },
      seeded: { [RUNTIME]: { [url]: response('cached bundle') } },
    });

    expect((await answered!)?.body).toBe('cached bundle');
  });

  it('leaves another origin to the browser', async () => {
    const { answered } = runFetch({ url: 'https://senseis.xmp.net/?Tengen' });

    expect(answered).toBeNull();
  });
});

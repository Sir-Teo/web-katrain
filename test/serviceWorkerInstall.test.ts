import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

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

  const install = listeners.get('install');
  expect(install, 'sw.js registered no install listener').toBeTruthy();
  let waited: Promise<unknown> = Promise.resolve();
  install!({ waitUntil: (p) => { waited = p; } });

  return waited.then(() => ({ added, skipWaitingCalls }));
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

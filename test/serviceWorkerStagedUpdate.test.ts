import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;
const ORIGIN = 'https://example.test';
const abs = (u: string | { url: string }) => new URL(typeof u === 'string' ? u : u.url, `${ORIGIN}/sw.js`).href;

/** In-memory CacheStorage and a server that serves whatever it was given. */
const makeWorld = () => {
  const stores = new Map<string, Map<string, string>>();
  const server = new Map<string, string>();
  const fetchText = async (url: string) => {
    const body = server.get(url);
    if (body === undefined) throw new Error(`404 ${url}`);
    return body;
  };
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: string | { url: string }) => {
        const body = store.get(abs(req));
        return body === undefined ? undefined : new Response(body, { status: 200 });
      },
      put: async (req: string | { url: string }, res: Response) => { store.set(abs(req), await res.text()); },
      add: async (req: string) => { store.set(abs(req), await fetchText(abs(req))); },
      addAll: async (list: string[]) => {
        const got = await Promise.all(list.map(async (u) => [abs(u), await fetchText(abs(u))] as const));
        for (const [k, v] of got) store.set(k, v);
      },
      keys: async () => [...store.keys()].map((url) => ({ url })),
      delete: async (req: string | { url: string }) => store.delete(abs(req)),
    };
  };
  const caches = {
    open: async (name: string) => open(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const serveDeployment = (tag: string) => {
    const html = `<script type="module" src="/assets/main-${tag}.js"></script><script>add("modulepreload","/assets/Dashboard-${tag}.js")</script>`;
    server.clear();
    server.set(abs('./'), html);
    server.set(abs('./index.html'), html);
    server.set(abs(`/assets/main-${tag}.js`), `main ${tag}`);
    server.set(abs(`/assets/Dashboard-${tag}.js`), `dashboard ${tag}`);
  };
  const shellIndex = () => stores.get('web-katrain-v3:shell')?.get(abs('./index.html')) ?? '';
  return { stores, server, caches, serveDeployment, shellIndex };
};

const loadWorker = (world: ReturnType<typeof makeWorld>) => {
  const listeners = new Map<string, Listener>();
  const selfStub = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    clients: { claim: () => Promise.resolve() },
    location: new URL(`${ORIGIN}/sw.js`),
  };
  new Function('self', 'caches', 'fetch', readFileSync('public/sw.js', 'utf8'))(selfStub, world.caches, () => Promise.reject(new Error('offline')));
  const run = async (type: string) => {
    let waited: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ waitUntil: (p) => { waited = p; } });
    await waited;
  };
  return { install: () => run('install'), activate: () => run('activate') };
};

describe('a service worker update', () => {
  it('leaves the running version whole until it activates', async () => {
    const world = makeWorld();
    // Only the files the precache must have; the optional ones may 404.
    world.serveDeployment('old');
    const current = loadWorker(world);
    await current.install();
    await current.activate();
    expect(world.shellIndex()).toContain('main-old.js');
    // The inline preload script names a first-paint chunk too.
    expect(world.stores.get('web-katrain-v3:shell')!.has(abs('/assets/Dashboard-old.js'))).toBe(true);

    world.serveDeployment('new');
    const next = loadWorker(world);
    await next.install();
    // Waiting: the live shell still describes, and holds, the old version.
    expect(world.shellIndex()).toContain('main-old.js');

    await next.activate();
    expect(world.shellIndex()).toContain('main-new.js');
    expect(world.stores.get('web-katrain-v3:shell')!.has(abs('/assets/Dashboard-new.js'))).toBe(true);
    expect([...world.stores.keys()]).not.toContain('web-katrain-v3:shell-next');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, mapStorage } from './helpers/fakeIndexedDb';

const KEY = 'web-katrain:library:v1';
const CACHE = 'web-katrain-library-data-v1';

function cacheStorage() {
  const state = {
    values: new Map<string, string>(),
    failRead: false,
    failWrite: false,
    failDelete: false,
    match: vi.fn(async (_request: unknown, options?: MultiCacheQueryOptions) => {
      if (state.failRead) throw new Error('cache read failed');
      const raw = state.values.get(options?.cacheName ?? '');
      return raw === undefined ? undefined : new Response(raw);
    }),
    open: vi.fn(async (name: string) => ({
      put: async (_request: unknown, response: Response) => {
        if (state.failWrite) throw new Error('cache write failed');
        state.values.set(name, await response.text());
      },
    })),
    delete: vi.fn(async (name: string) => {
      if (state.failDelete) throw new Error('cache delete failed');
      return state.values.delete(name);
    }),
  };
  return state;
}

let local: ReturnType<typeof mapStorage>;
let cache: ReturnType<typeof cacheStorage>;
beforeEach(() => {
  vi.resetModules();
  local = mapStorage();
  local.setItem('web-katrain:library_preloaded_version:v1', '3');
  local.setItem(KEY, '[]');
  cache = cacheStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('caches', cache);
});
afterEach(() => vi.unstubAllGlobals());

describe('coherent Library fallback snapshots', () => {
  it('preserves another tab’s save when this renderer still reads an old localStorage value', async () => {
    const first = await import('../src/utils/library');
    await first.saveLibrary([first.createLibraryItem('Tab A', '(;SZ[9])')]);
    const get = local.getItem.bind(local);
    vi.spyOn(local, 'getItem').mockImplementation(key => key === KEY ? '[]' : get(key));
    vi.resetModules();
    const second = await import('../src/utils/library');
    await second.updateStoredLibrary(items => ({ items: [second.createLibraryItem('Tab B', '(;SZ[9])'), ...items], result: true }));
    expect((await second.loadLibrary()).map(item => item.name).sort()).toEqual(['Tab A', 'Tab B']);
    expect(JSON.parse(cache.values.get(CACHE)!).map((item: { name: string }) => item.name).sort()).toEqual(['Tab A', 'Tab B']);
  });

  it('does not resurrect games after an acknowledged clear when localStorage is stale', async () => {
    const lib = await import('../src/utils/library');
    const old = lib.createLibraryItem('Old game', '(;SZ[9])');
    await lib.saveLibrary([old]);
    await lib.saveLibrary([]);
    const get = local.getItem.bind(local);
    vi.spyOn(local, 'getItem').mockImplementation(key => key === KEY ? JSON.stringify([old]) : key.includes('preloaded_version') ? null : get(key));
    vi.resetModules();
    expect(await (await import('../src/utils/library')).loadLibrary()).toEqual([]);
  });

  it('keeps both previous copies if the legacy write is rejected', async () => {
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Saved game', '(;SZ[9])')]);
    const before = cache.values.get(CACHE);
    vi.spyOn(local, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(lib.saveLibrary([])).rejects.toThrow(lib.LIBRARY_SAVE_FAILED_MESSAGE);
    expect(cache.values.get(CACHE)).toBe(before);
    expect(local.getItem(KEY)).toBe(before);
  });

  it('rolls a failed mirror commit back to the prior acknowledged records', async () => {
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Saved game', '(;SZ[9])')]);
    const before = cache.values.get(CACHE);
    cache.failWrite = true;
    await expect(lib.saveLibrary([])).rejects.toThrow('cache write failed');
    expect(cache.values.get(CACHE)).toBe(before);
    expect(local.getItem(KEY)).toBe(before);
    expect((await lib.loadLibrary()).map(item => item.name)).toEqual(['Saved game']);
  });

  it('does not modify records if the initial backup cannot be stored', async () => {
    const lib = await import('../src/utils/library');
    const old = lib.createLibraryItem('Original', '(;SZ[9])');
    local.setItem(KEY, JSON.stringify([old]));
    cache.failWrite = true;
    await expect(lib.saveLibrary([])).rejects.toThrow('cache write failed');
    expect(JSON.parse(local.getItem(KEY)!)[0].name).toBe('Original');
    expect(cache.values.has(CACHE)).toBe(false);
  });

  it('does not fall back to stale local bytes when the shared snapshot is unreadable', async () => {
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Saved game', '(;SZ[9])')]);
    const before = cache.values.get(CACHE);
    cache.failRead = true;
    await expect(lib.loadLibrary()).rejects.toThrow('cache read failed');
    await expect(lib.saveLibrary([])).rejects.toThrow('cache read failed');
    expect(cache.values.get(CACHE)).toBe(before);
  });

  it.each(['not JSON', '{}', '[null]'])('rejects a corrupt shared snapshot: %s', async raw => {
    const lib = await import('../src/utils/library');
    cache.values.set(CACHE, raw);
    await expect(lib.loadLibrary()).rejects.toThrow();
    expect(cache.values.get(CACHE)).toBe(raw);
  });

  it('moves fallback records into IndexedDB when it becomes available', async () => {
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Fallback game', '(;SZ[9])')]);
    const idb = createFakeIdb();
    vi.stubGlobal('indexedDB', idb.factory);
    expect((await lib.loadLibrary()).map(item => item.name)).toEqual(['Fallback game']);
    expect(cache.values.has(CACHE)).toBe(false);
    expect(local.getItem(KEY)).toBeNull();
    expect([...idb.stores.get('items')!.values()].map(item => (item as { name: string }).name)).toEqual(['Fallback game']);
  });

  it('keeps a fallback save through reload and an IndexedDB write outage', async () => {
    const idb = createFakeIdb();
    vi.stubGlobal('indexedDB', idb.factory);
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Existing', '(;SZ[9])')]);
    idb.failWrites = true;
    await lib.updateStoredLibrary(items => ({ items: [lib.createLibraryItem('During outage', '(;SZ[9])'), ...items], result: true }));
    idb.failWrites = false;
    vi.resetModules();
    const reloaded = await import('../src/utils/library');
    expect((await reloaded.loadLibrary()).map(item => item.name).sort()).toEqual(['During outage', 'Existing']);
    expect(cache.values.has(CACHE)).toBe(false);
  });

  it('keeps healthy IndexedDB working when the Cache API is exposed but disabled', async () => {
    cache.match.mockRejectedValue(new DOMException('Disabled in this context', 'SecurityError'));
    const idb = createFakeIdb();
    vi.stubGlobal('indexedDB', idb.factory);
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('IndexedDB game', '(;SZ[9])')]);
    expect((await lib.loadLibrary()).map(item => item.name)).toEqual(['IndexedDB game']);
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('retains the existing legacy path when the Cache API is unsupported', async () => {
    cache.match.mockRejectedValue(new DOMException('Unsupported', 'NotSupportedError'));
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Legacy game', '(;SZ[9])')]);
    expect((await lib.loadLibrary()).map(item => item.name)).toEqual(['Legacy game']);
    expect(cache.open).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, mapStorage } from './helpers/fakeIndexedDb';

const UNFLUSHED_KEY = 'web-katrain:library_fallback_unflushed:v1';
const FALLBACK_KEY = 'web-katrain:library:v1';

let idb: ReturnType<typeof createFakeIdb>;
let ls: ReturnType<typeof mapStorage>;
beforeEach(() => {
  vi.resetModules();
  idb = createFakeIdb();
  ls = mapStorage();
  ls.setItem('web-katrain:library_preloaded_version:v1', '3');
  vi.stubGlobal('indexedDB', idb.factory);
  vi.stubGlobal('localStorage', ls);
});
afterEach(() => vi.unstubAllGlobals());

const lib = () => import('../src/utils/library');
const names = (items: { name: string }[]) => items.map((item) => item.name).sort();

const addGame = async (name: string) => {
  const { updateStoredLibrary, createLibraryItem } = await lib();
  return updateStoredLibrary((items) => {
    const item = createLibraryItem(name, '(;GM[1]SZ[9];B[aa])');
    return { items: [item, ...items], result: item };
  });
};

describe('a save made while IndexedDB is missing altogether', () => {
  /**
   * Only a save whose IndexedDB write *failed* was marked for reconciliation.
   * When the browser offered no IndexedDB at all for a while, the save went to
   * localStorage unmarked, and the database -- older, but back -- was read over
   * it: the game saved in between was gone.
   */
  it('is merged into the database when it comes back in the same session', async () => {
    await addGame('Before');
    vi.stubGlobal('indexedDB', undefined);
    await addGame('While missing');
    expect(ls.getItem(FALLBACK_KEY)).toContain('While missing');
    expect(ls.getItem(UNFLUSHED_KEY)).toBe('true');

    vi.stubGlobal('indexedDB', idb.factory);
    const { loadLibrary } = await lib();
    expect(names(await loadLibrary())).toEqual(['Before', 'While missing']);
    expect(ls.getItem(UNFLUSHED_KEY)).toBeNull();
  });

  it('is merged after a reload too', async () => {
    await addGame('Before');
    vi.stubGlobal('indexedDB', undefined);
    await addGame('While missing');

    vi.stubGlobal('indexedDB', idb.factory);
    vi.resetModules();
    expect(names(await (await lib()).loadLibrary())).toEqual(['Before', 'While missing']);
    // And it is in the database itself now, not only in the fallback.
    expect([...idb.stores.get('items')!.values()].map((item) => (item as { name: string }).name).sort())
      .toEqual(['Before', 'While missing']);
  });

  it('marks nothing when the fallback write itself is refused', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const full = {
      ...ls,
      setItem: (key: string, value: string) => {
        if (key === FALLBACK_KEY) throw new Error('QuotaExceededError');
        ls.setItem(key, value);
      },
    };
    vi.stubGlobal('localStorage', full);
    vi.stubGlobal('window', {});
    await expect(addGame('Too big')).rejects.toThrow(/Could not save the library/);
    expect(ls.getItem(UNFLUSHED_KEY)).toBeNull();
  });
});

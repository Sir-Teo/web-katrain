import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, mapStorage } from './helpers/fakeIndexedDb';

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

describe('cleared library after one fallback write', () => {
  it('stays empty after reload', async () => {
    const { saveLibrary, loadLibrary, createLibraryItem } = await lib();
    const a = createLibraryItem('A', '(;GM[1]SZ[9];B[aa])');
    const b = createLibraryItem('B', '(;GM[1]SZ[9];B[bb])');
    await saveLibrary([a, b]);
    expect((await loadLibrary()).map((i) => i.name)).toEqual(['A', 'B']);
    // One transient IndexedDB write failure (quota / abort): fallback to localStorage
    idb.failWrites = true;
    await saveLibrary([a, b]);
    idb.failWrites = false;
    expect((await loadLibrary()).length).toBe(2); // reconciled
    // user clears the library ("Clear all ... items?")
    await saveLibrary([]);
    expect(await loadLibrary()).toEqual([]);
    // reload page
    vi.resetModules();
    const again = await (await lib()).loadLibrary();
    expect(again.map((i) => i.name)).toEqual([]);
  });
});

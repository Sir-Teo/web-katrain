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

describe('a save that IndexedDB refused but localStorage accepted', () => {
  it('survives a reload', async () => {
    const { saveLibrary, loadLibrary, createLibraryItem } = await lib();
    const a = createLibraryItem('A', '(;GM[1]SZ[9];B[aa])');
    await saveLibrary([a]);
    expect((await loadLibrary()).map((i) => i.name)).toEqual(['A']);

    // IndexedDB write rejected (e.g. origin quota used by model cache); the
    // localStorage fallback takes it and saveLibrary resolves => "Saved to Library."
    idb.failWrites = true;
    const b = createLibraryItem('B', '(;GM[1]SZ[9];B[bb])');
    await expect(saveLibrary([b, a])).resolves.toBeUndefined();
    expect(ls.getItem('web-katrain:library:v1')).toContain('"B"');

    // Page reload (module state reset). IndexedDB may or may not work now.
    idb.failWrites = false;
    vi.resetModules();
    const after = await (await lib()).loadLibrary();
    expect(after.map((i) => i.name).sort()).toEqual(['A', 'B']);
  });
});

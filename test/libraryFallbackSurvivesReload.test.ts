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

describe('the fallback copy after IndexedDB recovers', () => {
  it('is dropped, so a later failed read cannot bring deleted games back', async () => {
    const { saveLibrary, createLibraryItem } = await lib();
    const a = createLibraryItem('A', '(;GM[1]SZ[9];B[aa])');
    const b = createLibraryItem('B', '(;GM[1]SZ[9];B[bb])');
    await saveLibrary([a, b]);

    // One refused write puts the whole library in the fallback.
    idb.failWrites = true;
    await saveLibrary([a, b]);
    idb.failWrites = false;
    expect(ls.getItem('web-katrain:library:v1')).toContain('"B"');

    // Reload: the recovered database takes the fallback in.
    vi.resetModules();
    expect((await (await lib()).loadLibrary()).map((i) => i.name).sort()).toEqual(['A', 'B']);
    expect(ls.getItem('web-katrain:library:v1')).toBeNull();

    // B is deleted, then after a reload one read fails and the panel's first
    // write goes to the fallback before the database comes back.
    const reloaded = await lib();
    await reloaded.saveLibrary((await reloaded.loadLibrary()).filter((item) => item.name !== 'B'));
    vi.resetModules();
    const again = await lib();
    idb.failReads = true;
    await again.loadLibrary().catch(() => []);
    idb.failReads = false;
    vi.resetModules();
    const final = await (await lib()).loadLibrary();
    expect(final.map((i) => i.name)).toEqual(['A']);
  });
});

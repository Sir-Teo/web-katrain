import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, mapStorage } from './helpers/fakeIndexedDb';

let storage: ReturnType<typeof mapStorage>;
beforeEach(() => {
  vi.resetModules();
  storage = mapStorage();
  storage.setItem('web-katrain:library_preloaded_version:v1', '3');
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('fallback snapshots changed by another tab', () => {
  it('includes an externally added game in the next read/modify/write', async () => {
    const lib = await import('../src/utils/library');
    const a = lib.createLibraryItem('A', '(;SZ[9])');
    const b = lib.createLibraryItem('B', '(;SZ[9])');
    const c = lib.createLibraryItem('C', '(;SZ[9])');
    await lib.saveLibrary([a]);
    await lib.loadLibrary();
    storage.setItem('web-katrain:library:v1', JSON.stringify([b, a]));
    await lib.updateStoredLibrary(items => ({ items: [c, ...items], result: true }));
    expect((await lib.loadLibrary()).map(item => item.name)).toEqual(['C', 'B', 'A']);
    expect(JSON.parse(storage.getItem('web-katrain:library:v1')!).map((item: { name: string }) => item.name))
      .toEqual(['C', 'B', 'A']);
  });

  it('does not bring back games another tab cleared', async () => {
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Old game', '(;SZ[9])')]);
    storage.setItem('web-katrain:library:v1', '[]');
    expect(await lib.loadLibrary()).toEqual([]);
    await lib.updateStoredLibrary(items => ({ items: [lib.createLibraryItem('New game', '(;SZ[9])'), ...items], result: true }));
    expect((await lib.loadLibrary()).map(item => item.name)).toEqual(['New game']);
  });

  it('keeps the cached games if storage becomes unreadable', async () => {
    const lib = await import('../src/utils/library');
    await lib.saveLibrary([lib.createLibraryItem('Known game', '(;SZ[9])')]);
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect((await lib.loadLibrary()).map(item => item.name)).toEqual(['Known game']);
  });

  it('does not resurrect an outage copy another tab already reconciled and edited', async () => {
    const idb = createFakeIdb();
    vi.stubGlobal('indexedDB', idb.factory);
    const firstTab = await import('../src/utils/library');
    const a = firstTab.createLibraryItem('A', '(;SZ[9])');
    const b = firstTab.createLibraryItem('B', '(;SZ[9])');
    await firstTab.saveLibrary([a, b]);
    idb.failWrites = true;
    await firstTab.saveLibrary([a, b]);
    idb.failWrites = false;
    vi.resetModules();
    const secondTab = await import('../src/utils/library');
    await secondTab.loadLibrary();
    await secondTab.saveLibrary([a]);
    expect(storage.getItem('web-katrain:library:v1')).toBeNull();
    expect((await firstTab.loadLibrary()).map(item => item.name)).toEqual(['A']);
  });
});

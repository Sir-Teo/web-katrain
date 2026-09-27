import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, mapStorage, resetFakeIdbCounts } from './helpers/fakeIndexedDb';

type LibraryModule = typeof import('../src/utils/library');

let idb: ReturnType<typeof createFakeIdb>;
beforeEach(() => {
  vi.resetModules();
  idb = createFakeIdb();
  const ls = mapStorage();
  ls.setItem('web-katrain:library_preloaded_version:v1', '3');
  vi.stubGlobal('indexedDB', idb.factory);
  vi.stubGlobal('localStorage', ls);
});
afterEach(() => vi.unstubAllGlobals());

const openTab = async (): Promise<LibraryModule> => {
  vi.resetModules();
  return import('../src/utils/library');
};

const seed = async (tab: LibraryModule, count: number) => {
  const games = Array.from({ length: count }, (_, i) => tab.createLibraryItem(`Game ${i}`, `(;GM[1]SZ[9]PB[B${i}];B[aa])`));
  await tab.saveLibrary(games);
  return games;
};

const storedRecords = () => [...idb.stores.get('items')!.values()] as Array<{ id: string; name: string; parentId: string | null; favorite?: boolean }>;
/** Item puts, leaving out the three meta records every write updates. */
const itemPuts = () => idb.counts.put - 3;

describe('a small library edit', () => {
  /**
   * Each change cleared the store and put every record back, after reading
   * and re-normalizing all of them: starring one game in 3,000 rewrote 3,000.
   */
  it('writes only the record it changed', async () => {
    const tab = await openTab();
    const games = await seed(tab, 40);
    await tab.loadLibrary();
    resetFakeIdbCounts(idb);

    await tab.updateStoredLibrary((items) => ({ items: tab.toggleLibraryFileFavorite(items, games[7]!.id), result: null }));

    expect(idb.counts.clear).toBe(0);
    expect(itemPuts()).toBe(1);
    expect(idb.counts.delete).toBe(0);
    // Nothing else wrote since this tab's own read, so it did not read all
    // 40 records again to apply the change.
    expect(idb.counts.getAll).toBe(0);
    expect(storedRecords().filter((record) => record.favorite).map((record) => record.name)).toEqual(['Game 7']);
    expect(storedRecords()).toHaveLength(40);
  });

  it('deletes only the removed records', async () => {
    const tab = await openTab();
    const games = await seed(tab, 10);
    resetFakeIdbCounts(idb);

    await tab.updateStoredLibrary((items) => ({ items: tab.deleteLibraryItems(items, [games[2]!.id, games[5]!.id]), result: null }));

    expect(idb.counts.clear).toBe(0);
    expect(idb.counts.delete).toBe(2);
    expect(itemPuts()).toBe(0);
    expect(storedRecords().map((record) => record.name).sort()).not.toContain('Game 2');
    expect(storedRecords()).toHaveLength(8);
  });

  it('writes nothing for a change that changed nothing, even in a new array', async () => {
    const tab = await openTab();
    await seed(tab, 5);
    resetFakeIdbCounts(idb);
    await tab.updateStoredLibrary((items) => ({ items: [...items], result: null }));
    expect(idb.counts.commits).toBe(0);
  });

  it('reads everything again once another tab has written', async () => {
    const first = await openTab();
    await seed(first, 5);
    await first.loadLibrary();
    const second = await openTab();
    await second.updateStoredLibrary((items) => ({ items: [second.createLibraryItem('Elsewhere', '(;GM[1])'), ...items], result: null }));
    resetFakeIdbCounts(idb);

    const seen = await first.loadLibrary();
    expect(idb.counts.getAll).toBe(1);
    expect(seen.map((item) => item.name)).toContain('Elsewhere');
  });

  it('still puts a record back at the root when its folder goes', async () => {
    const tab = await openTab();
    const folder = tab.createLibraryFolder('Folder');
    const inside = tab.createLibraryItem('Inside', '(;GM[1])', folder.id);
    await tab.saveLibrary([folder, inside]);

    // A panel edit batch removes only what it knew about, the folder alone.
    await tab.updateStoredLibrary((items) => ({ items: items.filter((item) => item.id !== folder.id), result: null }));

    expect(storedRecords()).toEqual([expect.objectContaining({ name: 'Inside', parentId: null })]);
    const reloaded = await openTab();
    expect(await reloaded.loadLibrary()).toEqual([expect.objectContaining({ name: 'Inside', parentId: null })]);
  });

  it('reads an edited game afresh, and keeps what it read from an untouched one', async () => {
    const tab = await openTab();
    const [game] = await seed(tab, 1);
    await tab.updateStoredLibrary((items) => ({
      items: tab.updateLibraryFileSgf(items, game!.id, '(;GM[1]SZ[13]PB[New Black];B[aa];W[bb])'),
      result: null,
    }));
    const [edited] = await (await openTab()).loadLibrary();
    expect(edited).toMatchObject({ moveCount: 2, metadata: { black: 'New Black', boardSize: 13 } });

    await tab.updateStoredLibrary((items) => ({ items: tab.updateLibraryItem(items, game!.id, { name: 'Renamed' }), result: null }));
    const [renamed] = await (await openTab()).loadLibrary();
    expect(renamed).toMatchObject({ name: 'Renamed', moveCount: 2, metadata: { black: 'New Black' } });
  });
});

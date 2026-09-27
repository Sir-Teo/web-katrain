import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIdb, createFakeLocks, mapStorage } from './helpers/fakeIndexedDb';

type LibraryModule = typeof import('../src/utils/library');

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

/** A second copy of the module is a second tab: its own queue, memory and cache. */
const openTab = async (): Promise<LibraryModule> => {
  vi.resetModules();
  return import('../src/utils/library');
};

const addGame = (tab: LibraryModule, name: string, calls?: { count: number }) =>
  tab.updateStoredLibrary((items) => {
    if (calls) calls.count++;
    const item = tab.createLibraryItem(tab.getUniqueLibraryItemName(name, items, null), '(;GM[1]SZ[9];B[aa])');
    return { items: [item, ...items], result: item };
  });

const storedNames = async (tab: LibraryModule) => (await tab.loadLibrary()).map((item) => item.name).sort();

describe('two tabs adding games at the same time', () => {
  /**
   * Each tab ran its read-modify-write through its own queue, so both read
   * the same library and the second write replaced the first: two "Saved to
   * Library." toasts and one game after a reload.
   */
  it('keeps both games when the browser has no Web Locks', async () => {
    const first = await openTab();
    const second = await openTab();
    await Promise.all([addGame(first, 'From tab one'), addGame(second, 'From tab two')]);
    const reloaded = await openTab();
    expect(await storedNames(reloaded)).toEqual(['From tab one', 'From tab two']);
  });

  it('keeps both games in the localStorage fallback too', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const first = await openTab();
    const second = await openTab();
    await Promise.all([addGame(first, 'From tab one'), addGame(second, 'From tab two')]);
    const reloaded = await openTab();
    expect(await storedNames(reloaded)).toEqual(['From tab one', 'From tab two']);
  });

  it('runs one tab at a time under Web Locks, so neither has to retry', async () => {
    const locks = createFakeLocks();
    vi.stubGlobal('navigator', { locks });
    const first = await openTab();
    const second = await openTab();
    const firstCalls = { count: 0 };
    const secondCalls = { count: 0 };
    await Promise.all([addGame(first, 'Study', firstCalls), addGame(second, 'Study', secondCalls)]);
    expect(firstCalls.count).toBe(1);
    expect(secondCalls.count).toBe(1);
    expect(locks.granted).toBeGreaterThanOrEqual(2);
    // The second tab read the first tab's game inside the lock, so it named
    // its own against it.
    expect(await storedNames(await openTab())).toEqual(['Study', 'Study 2']);
  });

  it('still keeps both edits when locks are unavailable and a write races', async () => {
    const first = await openTab();
    const second = await openTab();
    const secondCalls = { count: 0 };
    await Promise.all([addGame(first, 'Study'), addGame(second, 'Study', secondCalls)]);
    // The second tab's write found the stored revision had moved on and ran
    // its change again against what the first tab wrote.
    expect(secondCalls.count).toBe(2);
    expect(await storedNames(await openTab())).toEqual(['Study', 'Study 2']);
  });

  it('keeps a panel edit batch from replacing another tab’s addition', async () => {
    const first = await openTab();
    const seed = first.createLibraryItem('Seed', '(;GM[1]SZ[9])');
    await first.saveLibrary([seed]);
    const second = await openTab();
    const { getLibraryChanges } = await import('../src/utils/libraryEdits');
    const starred = second.toggleLibraryFileFavorite([seed], seed.id);
    const save = second.createLibraryEditSaver();
    await Promise.all([
      addGame(first, 'Added elsewhere'),
      save([{ revision: 1, changes: getLibraryChanges([seed], starred) }]),
    ]);
    const final = await (await openTab()).loadLibrary();
    expect(final.map((item) => item.name).sort()).toEqual(['Added elsewhere', 'Seed']);
    expect(final.find((item) => item.name === 'Seed')).toMatchObject({ favorite: true });
  });
});

describe('telling other tabs the library changed', () => {
  it('notifies a subscriber in another tab after a save, and not the saving tab', async () => {
    const listening = await openTab();
    const saving = await openTab();
    const heard: string[] = [];
    const ownHeard: string[] = [];
    const stop = listening.subscribeToLibraryChanges(() => heard.push('changed'));
    const stopOwn = saving.subscribeToLibraryChanges(() => ownHeard.push('changed'));
    try {
      await addGame(saving, 'Elsewhere');
      await vi.waitFor(() => expect(heard.length).toBeGreaterThan(0));
      expect(ownHeard).toEqual([]);
    } finally {
      stop();
      stopOwn();
    }
  });

  it('does nothing where BroadcastChannel is missing', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const tab = await openTab();
    const stop = tab.subscribeToLibraryChanges(() => undefined);
    await expect(addGame(tab, 'Quiet')).resolves.toMatchObject({ name: 'Quiet' });
    stop();
  });
});

describe('the Library panel in the other tab', () => {
  it('reads the library again when told, keeping its own unsaved edits on top', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    expect(source).toContain('subscribeToLibraryChanges(() => setRemoteChange((count) => count + 1))');
    expect(source).toContain("dispatchItems({ type: 'remote', items: loaded });");
    expect(source).toMatch(/action\.type === 'remote'[\s\S]{0,200}state\.edits\.reduce/);
  });
});

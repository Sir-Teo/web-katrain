import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLibraryChanges } from '../src/utils/libraryEdits';

const storageKey = 'web-katrain:library:v1';
let stored: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  stored = new Map([['web-katrain:library_preloaded_version:v1', '3']]);
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('ordered library read/modify/write operations', () => {
  it('does not replay an acknowledged game edit over an intervening save when starring', async () => {
    const { createLibraryEditSaver, saveLibrary, loadLibrary, createLibraryItem, updateStoredLibrary, updateLibraryFileSgf, toggleLibraryFileFavorite } = await import('../src/utils/library');
    const before = [createLibraryItem('Study', '(;SZ[9])')];
    await saveLibrary(before);
    const first = updateLibraryFileSgf(before, before[0].id, '(;SZ[9];B[aa])');
    const starred = toggleLibraryFileFavorite(first, before[0].id);
    const edits = [
      { revision: 1, changes: getLibraryChanges(before, first) },
      { revision: 2, changes: getLibraryChanges(first, starred) },
    ];
    const save = createLibraryEditSaver();
    const panel = save(edits.slice(0, 1));
    const toolbar = updateStoredLibrary(items => ({ items: updateLibraryFileSgf(items, before[0].id, '(;SZ[9];B[aa];W[bb])'), result: undefined }));
    const star = save(edits);
    await Promise.all([panel, toolbar, star]);
    expect(await loadLibrary()).toEqual([expect.objectContaining({ favorite: true, sgf: '(;SZ[9];B[aa];W[bb])' })]);
  });

  it('retries unacknowledged field edits against the current persisted game', async () => {
    const { createLibraryEditSaver, saveLibrary, loadLibrary, createLibraryItem, toggleLibraryFileFavorite, updateStoredLibrary, updateLibraryFileSgf } = await import('../src/utils/library');
    const before = [createLibraryItem('Study', '(;SZ[9])')];
    await saveLibrary(before);
    const edits = [{ revision: 1, changes: getLibraryChanges(before, toggleLibraryFileFavorite(before, before[0].id)) }];
    const storage = globalThis.localStorage;
    vi.stubGlobal('localStorage', { ...storage, setItem: () => { throw new Error('Quota exceeded'); } });
    const save = createLibraryEditSaver();
    await expect(save(edits)).rejects.toThrow('Could not save the library');
    vi.stubGlobal('localStorage', storage);
    await updateStoredLibrary(items => ({ items: updateLibraryFileSgf(items.map(item => ({ ...item, favorite: false })), before[0].id, '(;SZ[9];B[cc])'), result: undefined }));
    await save(edits);
    expect(await loadLibrary()).toEqual([expect.objectContaining({ favorite: true, sgf: '(;SZ[9];B[cc])' })]);
  });

  it('preserves both simultaneous additions and chooses names against the preceding save', async () => {
    const { updateStoredLibrary, createLibraryItem, getUniqueLibraryItemName, loadLibrary } = await import('../src/utils/library');
    const add = (sgf: string) => updateStoredLibrary(items => {
      const item = createLibraryItem(getUniqueLibraryItemName('Study', items, null), sgf);
      return { items: [item, ...items], result: item };
    });
    const [first, second] = await Promise.all([add('(;SZ[9];B[aa])'), add('(;SZ[9];B[bb])')]);
    expect(first.name).toBe('Study');
    expect(second.name).not.toBe(first.name);
    expect(await loadLibrary()).toEqual([second, first]);
    expect(JSON.parse(stored.get(storageKey)!)).toEqual([second, first]);
  });

  it('orders replacement, updates and reads while preserving unrelated records', async () => {
    const { saveLibrary, loadLibrary, createLibraryItem, updateStoredLibrary, updateLibraryFileSgf } = await import('../src/utils/library');
    const original = createLibraryItem('Study', '(;SZ[9])');
    const other = createLibraryItem('Other', '(;SZ[13])');
    const replacement = saveLibrary([original, other]);
    const first = updateStoredLibrary(items => ({ items: updateLibraryFileSgf(items, original.id, '(;SZ[9];B[aa])'), result: 1 }));
    const second = updateStoredLibrary(items => ({ items: updateLibraryFileSgf(items, original.id, '(;SZ[9];B[aa];W[bb])'), result: 2 }));
    const read = loadLibrary();
    expect(await Promise.all([replacement, first, second])).toEqual([undefined, 1, 2]);
    expect(await read).toEqual([expect.objectContaining({ sgf: '(;SZ[9];B[aa];W[bb])' }), other]);
  });

  it('allows a later save after a rejected mutation without persisting its changes', async () => {
    const { updateStoredLibrary, createLibraryItem, loadLibrary } = await import('../src/utils/library');
    const rejected = updateStoredLibrary(() => { throw new Error('invalid destination'); });
    const item = createLibraryItem('Retained study', '(;SZ[9])');
    const next = updateStoredLibrary(items => ({ items: [...items, item], result: item.id }));
    await expect(rejected).rejects.toThrow('invalid destination');
    await expect(next).resolves.toBe(item.id);
    expect(await loadLibrary()).toEqual([item]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRELOADED_GAMES } from '../src/data/preloadedGames';

const storageKey = 'web-katrain:library:v1';
const versionKey = 'web-katrain:library_preloaded_version:v1';
let stored: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal('indexedDB', undefined);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

// Reset module memory to exercise the next page's load, rather than getting
// the in-session cached items. The browser gate covers real IndexedDB too.
const reload = async () => {
  vi.resetModules();
  return (await import('../src/utils/library')).loadLibrary();
};

describe('library sample initialization with local fallback storage', () => {
  it('keeps offering samples if an initial read was never saved', async () => {
    const { loadLibrary } = await import('../src/utils/library');
    const initial = await loadLibrary();
    expect(await reload()).toEqual(initial.map(item => expect.objectContaining({ name: item.name, type: item.type })));
  });

  it('offers every bundled game on a first visit and retains the same IDs after reload', async () => {
    const { loadLibrary, saveLibrary } = await import('../src/utils/library');
    const initial = await loadLibrary();
    expect(initial.filter(item => item.type === 'file').map(item => item.name).sort())
      .toEqual(PRELOADED_GAMES.map(game => game.name).sort());
    await saveLibrary(initial);
    expect(await reload()).toEqual(initial);
  });

  it('keeps all samples deleted after the very first visit', async () => {
    const { loadLibrary, saveLibrary } = await import('../src/utils/library');
    expect((await loadLibrary()).length).toBeGreaterThan(0);
    await saveLibrary([]);
    expect(JSON.parse(stored.get(storageKey)!)).toEqual([]);
    expect(await reload()).toEqual([]);
  });

  it('does not restore one deleted sample while keeping the other records intact', async () => {
    const { loadLibrary, saveLibrary, createLibraryItem } = await import('../src/utils/library');
    const initial = await loadLibrary();
    const removed = initial.find(item => item.type === 'file')!;
    const ownGame = createLibraryItem('My review', '(;GM[1]SZ[9]C[My notes];B[dd])');
    const remaining = [...initial.filter(item => item.id !== removed.id), ownGame];
    await saveLibrary(remaining);
    expect(await reload()).toEqual(remaining);
  });

  it('preserves an intentionally empty backup restored over the initial samples', async () => {
    const { loadLibrary, restoreLibrary } = await import('../src/utils/library');
    await loadLibrary();
    await restoreLibrary(JSON.stringify({ app: 'web-katrain', version: 2, items: [] }));
    expect(await reload()).toEqual([]);
  });

  it('still adds an older sample-version update once without replacing a saved game', async () => {
    const { createLibraryItem, loadLibrary, saveLibrary } = await import('../src/utils/library');
    const ownGame = createLibraryItem('My review', '(;GM[1]SZ[9]C[Keep this note];B[dd])');
    stored.set(storageKey, JSON.stringify([ownGame]));
    stored.set(versionKey, '2');
    const loaded = await loadLibrary();
    expect(loaded.find(item => item.id === ownGame.id)).toEqual(ownGame);
    expect(loaded.filter(item => item.type === 'file')).toHaveLength(PRELOADED_GAMES.length + 1);
    await saveLibrary(loaded);
    expect(await reload()).toEqual(loaded);
  });

  it('does not mark an unsaved sample update as finished when its write is rejected', async () => {
    const { loadLibrary, saveLibrary, LIBRARY_SAVE_FAILED_MESSAGE } = await import('../src/utils/library');
    const initial = await loadLibrary();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === storageKey) throw new Error('Quota exceeded');
        stored.set(key, value);
      },
    });
    await expect(saveLibrary(initial)).rejects.toThrow(LIBRARY_SAVE_FAILED_MESSAGE);
    expect((await reload()).map(item => item.name)).toEqual(initial.map(item => item.name));
  });
});

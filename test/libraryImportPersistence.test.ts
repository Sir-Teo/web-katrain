import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../src/utils/library';
import { createLibraryFolder, createLibraryItem, updateStoredLibrary } from '../src/utils/library';
import { persistLibraryImports, persistOgsLibraryImports, subscribeLibraryImports } from '../src/utils/libraryImports';

const storage = vi.hoisted(() => ({ items: [] as LibraryItem[], gate: Promise.resolve(), fail: false }));
vi.mock('../src/utils/library', async (load) => {
  const actual = await load<typeof import('../src/utils/library')>();
  return {
    ...actual,
    updateStoredLibrary: vi.fn(async (update: (items: LibraryItem[]) => { items: LibraryItem[]; result: unknown }) => {
      await storage.gate;
      if (storage.fail) throw new Error('Storage is full');
      const mutation = update(storage.items);
      storage.items = mutation.items;
      return mutation.result;
    }),
  };
});

const cleanups: Array<() => void> = [];
beforeEach(() => {
  storage.items = [];
  storage.gate = Promise.resolve();
  storage.fail = false;
  vi.clearAllMocks();
});
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });
const subscribe = (listener: (items: LibraryItem[]) => void) => {
  const unsubscribe = subscribeLibraryImports(listener);
  cleanups.push(unsubscribe);
  return unsubscribe;
};

describe('durable Library import completion', () => {
  it('saves before notifying a panel mounted after the originating panel closed', async () => {
    let release!: () => void;
    storage.gate = new Promise<void>(resolve => { release = resolve; });
    const original = vi.fn(), reopened = vi.fn();
    const unsubscribe = subscribe(original);
    const incoming = createLibraryItem('Study', '(;SZ[9])');
    const saving = persistLibraryImports([incoming]);
    unsubscribe();
    subscribe(reopened);
    expect(reopened).not.toHaveBeenCalled();
    expect(storage.items).toEqual([]);
    release();
    expect(await saving).toEqual([incoming]);
    expect(storage.items).toEqual([incoming]);
    expect(original).not.toHaveBeenCalled();
    expect(reopened).toHaveBeenCalledExactlyOnceWith(storage.items);
  });

  it('resolves destinations and unique names against storage at commit time', async () => {
    const folder = createLibraryFolder('Destination');
    storage.items = [folder];
    let release!: () => void;
    storage.gate = new Promise<void>(resolve => { release = resolve; });
    const incoming = createLibraryItem('Study', '(;SZ[9])', folder.id);
    const saving = persistLibraryImports([incoming]);
    const concurrent = createLibraryItem('Study', '(;SZ[13]C[Keep me])');
    storage.items = [concurrent]; // Destination was deleted while the read was pending.
    release();
    expect(await saving).toEqual([{ ...incoming, name: 'Study 2', parentId: null }]);
    expect(storage.items).toEqual([{ ...incoming, name: 'Study 2', parentId: null }, concurrent]);
  });

  it('reports a failed write without publishing success, and allows a clean retry', async () => {
    const existing = createLibraryItem('Study', '(;SZ[13])');
    const incoming = createLibraryItem('Study', '(;SZ[9])');
    storage.items = [existing];
    storage.fail = true;
    const listener = vi.fn();
    subscribe(listener);
    await expect(persistLibraryImports([incoming])).rejects.toThrow('Storage is full');
    expect(storage.items).toEqual([existing]);
    expect(listener).not.toHaveBeenCalled();
    storage.fail = false;
    expect(await persistLibraryImports([incoming])).toEqual([{ ...incoming, name: 'Study 2' }]);
    expect(storage.items).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps nested archive folders intact when their outer target disappears', async () => {
    const folder = createLibraryFolder('Archive', 'missing');
    const child = createLibraryItem('Game', '(;SZ[9])', folder.id);
    const listener = vi.fn();
    subscribe(listener);
    expect(await persistLibraryImports([child, folder])).toEqual([child, { ...folder, parentId: null }]);
    expect(listener).toHaveBeenCalledWith([child, { ...folder, parentId: null }]);
  });

  it('does not write or publish an empty batch', async () => {
    const listener = vi.fn();
    subscribe(listener);
    expect(await persistLibraryImports([])).toEqual([]);
    expect(updateStoredLibrary).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('saves OGS games in the current destination before notifying a reopened panel', async () => {
    let release!: () => void;
    storage.gate = new Promise<void>(resolve => { release = resolve; });
    const proposed = createLibraryFolder('OGS - Player');
    const file = createLibraryItem('Study (ogs-123)', '(;SZ[9]C[Imported notes])', proposed.id);
    const original = vi.fn(), reopened = vi.fn();
    const closeOriginal = subscribe(original);
    const saving = persistOgsLibraryImports(proposed, [file]);
    closeOriginal();
    subscribe(reopened);
    const currentFolder = createLibraryFolder('OGS - Player');
    const localStudy = createLibraryItem('Keep local notes', '(;SZ[13]C[Local notes])');
    storage.items = [currentFolder, localStudy];
    expect(reopened).not.toHaveBeenCalled();
    release();
    expect(await saving).toEqual([{ ...file, parentId: currentFolder.id }]);
    expect(storage.items).toEqual([{ ...file, parentId: currentFolder.id }, currentFolder, localStudy]);
    expect(original).not.toHaveBeenCalled();
    expect(reopened).toHaveBeenCalledExactlyOnceWith(storage.items);
  });

  it('rejects failed OGS persistence without reporting added games or reserving a second copy', async () => {
    const folder = createLibraryFolder('OGS - Player');
    const original = createLibraryItem('Keep', '(;SZ[13]C[Original notes])');
    const file = createLibraryItem('Study (ogs-123)', '(;SZ[9])', folder.id);
    storage.items = [original];
    storage.fail = true;
    const listener = vi.fn();
    subscribe(listener);
    await expect(persistOgsLibraryImports(folder, [file])).rejects.toThrow('Storage is full');
    expect(listener).not.toHaveBeenCalled();
    expect(storage.items).toEqual([original]);
    storage.fail = false;
    expect(await persistOgsLibraryImports(folder, [file])).toEqual([file]);
    expect(storage.items).toEqual([file, folder, original]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not create an OGS folder or write when no new games were downloaded', async () => {
    const listener = vi.fn();
    subscribe(listener);
    expect(await persistOgsLibraryImports(createLibraryFolder('OGS - Player'), [])).toEqual([]);
    expect(updateStoredLibrary).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns no added games when the same OGS game arrives before the queued commit', async () => {
    let release!: () => void;
    storage.gate = new Promise<void>(resolve => { release = resolve; });
    const folder = createLibraryFolder('OGS - Player');
    const incoming = createLibraryItem('Downloaded (ogs-123)', '(;SZ[9])', folder.id);
    const saving = persistOgsLibraryImports(folder, [incoming]);
    const arrived = { ...createLibraryItem('Other tab (ogs-123)', '(;SZ[9]C[Preserve other tab notes])'), favorite: true };
    storage.items = [arrived];
    const listener = vi.fn();
    subscribe(listener);
    release();
    expect(await saving).toEqual([]);
    expect(storage.items).toEqual([arrived]);
    expect(listener).toHaveBeenCalledExactlyOnceWith([arrived]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../src/utils/library';
import { createLibraryFolder, createLibraryItem, updateStoredLibrary } from '../src/utils/library';
import { persistLibraryImports, subscribeLibraryImports } from '../src/utils/libraryImports';

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
});

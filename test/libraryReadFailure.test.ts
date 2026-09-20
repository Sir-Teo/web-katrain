import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

let entries: Map<string, string>;

/** An IndexedDB that exists and refuses to open, as a broken one does. */
const installBrokenIndexedDb = () => {
    Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        writable: true,
        value: { open: () => { throw new Error('Simulated read failure'); } },
    });
};

beforeEach(() => {
    entries = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: {
            getItem: (key: string) => entries.get(key) ?? null,
            setItem: (key: string, value: string) => { entries.set(key, String(value)); },
            removeItem: (key: string) => { entries.delete(key); },
        },
    });
    // An established install: the bundled games have already been seeded, so
    // the localStorage fallback is genuinely empty rather than full of samples.
    entries.set('web-katrain:library_preloaded_version:v1', '99');
    vi.resetModules();
});

afterEach(() => {
    if (originalIndexedDb) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb);
    else Reflect.deleteProperty(globalThis as object, 'indexedDB');
    if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    else Reflect.deleteProperty(globalThis as object, 'localStorage');
});

describe('a library read that fails', () => {
    /**
     * It used to fall back silently, so a database that would not open showed
     * "Library is empty" over games that were still in it -- alarming, and an
     * invitation to save something over them. Measured in the browser: eight
     * games stored, IndexedDB broken, panel said the library was empty.
     */
    it('says so instead of reporting an empty library', async () => {
        installBrokenIndexedDb();
        const { loadLibrary, LIBRARY_READ_FAILED_MESSAGE } = await import('../src/utils/library');

        await expect(loadLibrary()).rejects.toThrow(LIBRARY_READ_FAILED_MESSAGE);
    });

    it('carries the underlying reason for whoever has to diagnose it', async () => {
        installBrokenIndexedDb();
        const { loadLibrary } = await import('../src/utils/library');

        await expect(loadLibrary()).rejects.toThrow(/Simulated read failure/);
    });

    it('still shows a fallback copy when there is one, rather than failing', async () => {
        const stored = [{
            id: 'kept', name: 'Saved in localStorage', parentId: null, type: 'file',
            sgf: '(;GM[1]SZ[9];B[dd])', createdAt: 1, updatedAt: 1, moveCount: 1, size: 20, metadata: {},
        }];
        entries.set('web-katrain:library:v1', JSON.stringify(stored));
        installBrokenIndexedDb();
        const { loadLibrary } = await import('../src/utils/library');

        const items = await loadLibrary();
        expect(items.map((item) => item.name)).toEqual(['Saved in localStorage']);
    });

    it('is untouched where there is no IndexedDB at all', async () => {
        // Memory-only is the intended mode there, not an error.
        Reflect.deleteProperty(globalThis as object, 'indexedDB');
        const { loadLibrary } = await import('../src/utils/library');

        await expect(loadLibrary()).resolves.toEqual([]);
    });

    it('still seeds a first run rather than failing it', async () => {
        // With no record of the bundled games, the fallback has something real
        // to show and a broken database should not stop it being shown.
        entries.delete('web-katrain:library_preloaded_version:v1');
        installBrokenIndexedDb();
        const { loadLibrary } = await import('../src/utils/library');

        await expect(loadLibrary()).resolves.not.toHaveLength(0);
    });
});

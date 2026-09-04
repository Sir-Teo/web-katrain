import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_SAVE_FAILED_MESSAGE, createLibraryItem, saveLibrary } from '../src/utils/library';

/**
 * `saveLibrary` resolved whether or not anything was written.
 *
 * That mattered most on the path that saves a game to the Library: it showed a
 * green "Saved ... to Library." and then cleared the autosave, so a device out
 * of storage lost both copies at once and was told the opposite. Rejecting runs
 * the callers' existing catch blocks first, which is what keeps the autosave.
 *
 * The distinction the fix turns on: a store that is *absent* (SSR, this test
 * file's own default, a browser with site data off) is memory-only by design
 * and must stay silent. A store that is present and *refuses* the write is out
 * of room, and that is the failure worth raising.
 */
const SGF = '(;GM[1]FF[4]SZ[19]KM[6.5];B[pd];W[dd])';

const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

const restore = (name: string, descriptor: PropertyDescriptor | undefined) => {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
};

const setGlobal = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { configurable: true, value });

/** A localStorage that is present but out of room, as a full quota behaves. */
const fullLocalStorage = () => ({
  getItem: () => null,
  removeItem: () => undefined,
  setItem: () => {
    const error = new Error('QuotaExceededError');
    error.name = 'QuotaExceededError';
    throw error;
  },
});

const workingLocalStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

afterEach(() => {
  restore('indexedDB', originalIndexedDB);
  restore('localStorage', originalLocalStorage);
  vi.restoreAllMocks();
});

describe('saving the library when storage will not take it', () => {
  const item = () => [createLibraryItem('Some Game', SGF)];

  it('rejects when localStorage is present but out of room', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
    setGlobal('localStorage', fullLocalStorage());

    await expect(saveLibrary(item())).rejects.toThrow(LIBRARY_SAVE_FAILED_MESSAGE);
  });

  it('rejects when IndexedDB throws and localStorage is full', async () => {
    setGlobal('indexedDB', {
      open: () => {
        throw new Error('db unavailable');
      },
    });
    setGlobal('localStorage', fullLocalStorage());

    await expect(saveLibrary(item())).rejects.toThrow(LIBRARY_SAVE_FAILED_MESSAGE);
  });

  it('resolves when localStorage catches what IndexedDB dropped', async () => {
    const storage = workingLocalStorage();
    setGlobal('indexedDB', {
      open: () => {
        throw new Error('db unavailable');
      },
    });
    setGlobal('localStorage', storage);

    await expect(saveLibrary(item())).resolves.toBeUndefined();
    expect(storage.getItem('web-katrain:library:v1')).toContain('Some Game');
  });

  it('stays quiet where there is no storage at all, which is memory-only by design', async () => {
    // Never an error per save: this is how SSR, a Node run and a browser with
    // site data switched off all behave, and the app supports running that way.
    Reflect.deleteProperty(globalThis, 'indexedDB');
    Reflect.deleteProperty(globalThis, 'localStorage');

    await expect(saveLibrary(item())).resolves.toBeUndefined();
  });

  it('names storage as the reason, so the message is actionable', () => {
    expect(LIBRARY_SAVE_FAILED_MESSAGE).toMatch(/storage/i);
    expect(LIBRARY_SAVE_FAILED_MESSAGE).toMatch(/full|unavailable/i);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { defaultUiState, loadUiState, saveUiState, UI_STATE_KEY } from '../src/components/layout/types';
import {
  getIndexedDB,
  getLocalStorage,
  getSessionStorage,
  readLocalStorage,
  readSessionStorage,
  removeLocalStorage,
  removeSessionStorage,
  writeLocalStorage,
  writeSessionStorage,
} from '../src/utils/storage';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function restoreLocalStorage() {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

function restoreIndexedDB() {
  if (originalIndexedDB) {
    Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB);
  } else {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  }
}

function restoreSessionStorage() {
  if (originalSessionStorage) {
    Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
}

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } satisfies Storage;
}

function installMemoryStorage() {
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

function installMemorySessionStorage() {
  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

afterEach(() => {
  restoreLocalStorage();
  restoreSessionStorage();
  restoreIndexedDB();
});

describe('safe localStorage helpers', () => {
  it('reads, writes, and removes values when storage is available', () => {
    installMemoryStorage();

    expect(writeLocalStorage('key', 'value')).toBe(true);
    expect(readLocalStorage('key')).toBe('value');
    expect(removeLocalStorage('key')).toBe(true);
    expect(readLocalStorage('key')).toBeNull();

    installMemorySessionStorage();
    expect(writeSessionStorage('session-key', 'session-value')).toBe(true);
    expect(readSessionStorage('session-key')).toBe('session-value');
    expect(removeSessionStorage('session-key')).toBe(true);
    expect(readSessionStorage('session-key')).toBeNull();
  });

  it('swallows storage access exceptions', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage blocked');
      },
    });

    expect(getLocalStorage()).toBeNull();
    expect(readLocalStorage('key')).toBeNull();
    expect(writeLocalStorage('key', 'value')).toBe(false);
    expect(removeLocalStorage('key')).toBe(false);

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('session storage blocked');
      },
    });

    expect(getSessionStorage()).toBeNull();
    expect(readSessionStorage('key')).toBeNull();
    expect(writeSessionStorage('key', 'value')).toBe(false);
    expect(removeSessionStorage('key')).toBe(false);
  });

  it('swallows IndexedDB access exceptions', () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get: () => {
        throw new Error('indexedDB blocked');
      },
    });

    expect(getIndexedDB()).toBeNull();
  });
});

describe('UI state storage', () => {
  it('falls back to defaults when localStorage is blocked', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage blocked');
      },
    });

    expect(loadUiState()).toEqual(defaultUiState());
    expect(() => saveUiState(defaultUiState())).not.toThrow();
  });

  it('loads saved UI state through the safe storage path', () => {
    const storage = installMemoryStorage();
    storage.setItem(UI_STATE_KEY, JSON.stringify({ mode: 'analyze' }));

    expect(loadUiState().mode).toBe('analyze');
  });
});

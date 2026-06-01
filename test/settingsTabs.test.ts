import { afterEach, describe, expect, it } from 'vitest';
import {
  isSettingsTabId,
  readSettingsActiveTab,
  saveSettingsActiveTab,
  SETTINGS_ACTIVE_TAB_STORAGE_KEY,
} from '../src/utils/settingsTabs';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function restoreLocalStorage() {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

function installMemoryStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
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
    } satisfies Storage,
  });
}

afterEach(() => {
  restoreLocalStorage();
});

describe('settings tab storage', () => {
  it('validates known settings tabs', () => {
    expect(isSettingsTabId('general')).toBe(true);
    expect(isSettingsTabId('shortcuts')).toBe(true);
    expect(isSettingsTabId('keyboard')).toBe(false);
    expect(isSettingsTabId(null)).toBe(false);
  });

  it('persists the requested settings tab through safe storage', () => {
    installMemoryStorage();

    expect(readSettingsActiveTab()).toBe('general');
    saveSettingsActiveTab('shortcuts');

    expect(localStorage.getItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY)).toBe('shortcuts');
    expect(readSettingsActiveTab()).toBe('shortcuts');
  });

  it('falls back when storage contains an unknown tab', () => {
    installMemoryStorage();
    localStorage.setItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY, 'keyboard');

    expect(readSettingsActiveTab('analysis')).toBe('analysis');
  });
});

import { describe, expect, it } from 'vitest';
import {
  AUTO_SAVED_GAME_KEY,
  clearAutoSavedGame,
  readAutoSavedGame,
  writeAutoSavedGame,
} from '../src/utils/autoSave';

const makeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

describe('auto-save helpers', () => {
  it('round trips an SGF snapshot', () => {
    const storage = makeStorage();

    expect(writeAutoSavedGame('(;GM[1]SZ[19];B[pd])', storage, 123)).toBe(true);
    expect(readAutoSavedGame(storage)).toEqual({
      version: 1,
      savedAt: 123,
      sgf: '(;GM[1]SZ[19];B[pd])',
    });
  });

  it('ignores malformed snapshots and blank games', () => {
    const storage = makeStorage();

    expect(writeAutoSavedGame('   ', storage, 123)).toBe(false);
    storage.setItem(AUTO_SAVED_GAME_KEY, '{"version":1,"savedAt":123,"sgf":"   "}');
    expect(readAutoSavedGame(storage)).toBeNull();
    storage.setItem(AUTO_SAVED_GAME_KEY, '{not json');
    expect(readAutoSavedGame(storage)).toBeNull();
  });

  it('clears snapshots', () => {
    const storage = makeStorage();

    writeAutoSavedGame('(;GM[1]SZ[19])', storage, 123);
    clearAutoSavedGame(storage);

    expect(readAutoSavedGame(storage)).toBeNull();
  });
});

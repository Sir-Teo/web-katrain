import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';
import {
  PIN_GAME_ID_PROP,
  PINNED_VARIATIONS_STORAGE_KEY,
  ensurePinGameId,
  getPinGameId,
  readStoredPinnedVariations,
  restorePinnedVariations,
  writeStoredPinnedVariations,
} from '../src/utils/pinnedVariations';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function installFakeLocalStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return storage;
}

function restoreLocalStorage() {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

describe('pinned variation persistence', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  afterEach(() => {
    useGameStore.getState().resetGame();
    restoreLocalStorage();
  });

  it('assigns a WKID root property on first pin and stores the pin set', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.playMove(3, 3);
    store.playMove(15, 15);

    useGameStore.getState().pinCurrentVariation();

    const state = useGameStore.getState();
    const gameId = getPinGameId(state.rootNode);
    expect(gameId).toBeTruthy();
    expect(state.pinnedVariations).toHaveLength(1);
    expect(readStoredPinnedVariations(gameId)).toEqual(state.pinnedVariations);
  });

  it('restores pins when the same game is reloaded from SGF', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.playMove(3, 3);
    store.playMove(15, 15);
    store.playMove(16, 3);
    useGameStore.getState().pinCurrentVariation();

    const pinned = useGameStore.getState().pinnedVariations;
    const sgf = generateSgfFromTree(useGameStore.getState().rootNode);
    expect(sgf).toContain(PIN_GAME_ID_PROP);

    useGameStore.getState().resetGame();
    expect(useGameStore.getState().pinnedVariations).toHaveLength(0);

    useGameStore.getState().loadGame(parseSgf(sgf));
    const restored = useGameStore.getState().pinnedVariations;
    expect(restored).toHaveLength(1);
    expect(restored[0]!.path).toEqual(pinned[0]!.path);
    expect(restored[0]!.label).toBe(pinned[0]!.label);
  });

  it('drops stored pins whose path no longer resolves', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.playMove(3, 3);
    const root = useGameStore.getState().rootNode;
    const gameId = ensurePinGameId(root);
    writeStoredPinnedVariations(gameId, [
      { id: 'ok', label: 'Move 1', path: [0], moveNumber: 1, createdAt: 0 },
      { id: 'gone', label: 'Move 9', path: [0, 4, 2], moveNumber: 9, createdAt: 0 },
    ]);

    const restored = restorePinnedVariations(root);
    expect(restored.map((p) => p.id)).toEqual(['ok']);
  });

  it('removes the stored entry when the last pin is removed', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.playMove(3, 3);
    useGameStore.getState().pinCurrentVariation();

    const state = useGameStore.getState();
    const gameId = getPinGameId(state.rootNode);
    expect(readStoredPinnedVariations(gameId)).toHaveLength(1);

    state.unpinVariation(state.pinnedVariations[0]!.id);
    expect(readStoredPinnedVariations(gameId)).toHaveLength(0);
    expect(globalThis.localStorage.getItem(PINNED_VARIATIONS_STORAGE_KEY) ?? '{}').not.toContain('"pins"');
  });

  it('ignores malformed stored payloads', () => {
    globalThis.localStorage.setItem(PINNED_VARIATIONS_STORAGE_KEY, '{not json');
    expect(readStoredPinnedVariations('wk-any')).toEqual([]);
    globalThis.localStorage.setItem(PINNED_VARIATIONS_STORAGE_KEY, JSON.stringify({ 'wk-any': { pins: [{ bad: true }] } }));
    expect(readStoredPinnedVariations('wk-any')).toEqual([]);
  });
});

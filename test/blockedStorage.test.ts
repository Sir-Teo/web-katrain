import { afterEach, describe, expect, it } from 'vitest';

/**
 * A browser that blocks site data does not hand back an empty `localStorage` --
 * it makes the property itself throw. Firefox with cookies disabled, Safari in
 * some configurations, Chrome with site data blocked, and restrictive iframes
 * all behave this way.
 *
 * That is nastier than it sounds, because `typeof localStorage` does not
 * protect you: `typeof` only swallows *undeclared* identifiers, and
 * `localStorage` is a declared global property whose getter runs and throws.
 * A guard written that way, sitting outside its own try block, throws during
 * module initialization -- and `tournamentStore` calls these loaders to build
 * its initial state, so the failure took the whole app down to a blank page
 * rather than costing a saved ladder.
 */
const withThrowingLocalStorage = async <T>(body: () => Promise<T> | T): Promise<T> => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
  try {
    return await body();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
};

afterEach(() => {
  // Nothing persistent to undo; the helper restores in its own finally.
});

describe('storage that throws on access', () => {
  it('is what `typeof localStorage` fails to protect against', async () => {
    await withThrowingLocalStorage(() => {
      // The shape of the guard these modules used to carry.
      expect(() => typeof localStorage === 'undefined').toThrow();
    });
  });

  it('lets the ladder load and save without throwing', async () => {
    const { loadLadder, saveLadder, createLadder } = await import('../src/utils/tournament');
    await withThrowingLocalStorage(() => {
      expect(() => loadLadder()).not.toThrow();
      expect(loadLadder()).toBeNull();
      const ladder = createLadder({ startKyu: 15, boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0 });
      expect(() => saveLadder(ladder)).not.toThrow();
      expect(() => saveLadder(null)).not.toThrow();
    });
  });

  it('lets the gauntlet load and save without throwing', async () => {
    const { loadGauntlet, saveGauntlet } = await import('../src/utils/gauntlet');
    await withThrowingLocalStorage(() => {
      expect(() => loadGauntlet()).not.toThrow();
      expect(loadGauntlet()).toBeNull();
      expect(() => saveGauntlet(null)).not.toThrow();
    });
  });

  it('lets the tournament store build its initial state', async () => {
    // This is the path that actually blanked the app: the store's initial
    // state calls both loaders while the module is being imported.
    await withThrowingLocalStorage(async () => {
      const { useTournamentStore } = await import('../src/store/tournamentStore');
      const state = useTournamentStore.getState();
      expect(state.ladder).toBeNull();
      expect(state.gauntlet).toBeNull();
    });
  });
});

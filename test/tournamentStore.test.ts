import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GauntletConfig } from '../src/utils/gauntlet';
import type { LadderConfig } from '../src/utils/tournament';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

let entries: Map<string, string>;

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
  vi.resetModules();
});

afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis as object, 'localStorage');
});

const LADDER: LadderConfig = { boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 };
const GAUNTLET: GauntletConfig = {
  boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, baseKyu: 12, preset: 'match',
};

const loadStore = async () => (await import('../src/store/tournamentStore')).useTournamentStore;

describe('giving up on a run', () => {
  /**
   * The gauntlet's "Give up" called `resetGauntlet`, which deletes the entry.
   * One unconfirmed click part-way through a run left nothing behind -- not
   * even the "Gauntlet ended / Won N of 4" summary the 'lost' status already
   * renders -- while the ladder's Retire, the button beside it in the same
   * footer, has always kept its record.
   */
  it('ends a gauntlet without erasing what the player did', async () => {
    const store = await loadStore();
    store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame();
    store.getState().recordGauntletResult('win');
    store.getState().beginGauntletGame();
    store.getState().recordGauntletResult('win');

    store.getState().retireGauntlet();

    const gauntlet = store.getState().gauntlet;
    expect(gauntlet).not.toBeNull();
    expect(gauntlet).toMatchObject({ status: 'lost', awaitingResult: false, wins: 2, index: 2 });
    expect(gauntlet?.history).toHaveLength(2);
    // And it survives the reload, which is the point of keeping it at all.
    expect(entries.get('web-katrain:gauntlet:v1')).toContain('"status":"lost"');
  });

  it('gives up mid-game without leaving the run waiting on a result', async () => {
    const store = await loadStore();
    store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame();
    expect(store.getState().gauntlet?.awaitingResult).toBe(true);

    store.getState().retireGauntlet();
    expect(store.getState().gauntlet?.awaitingResult).toBe(false);
  });

  it('still clears the gauntlet outright when that is what was asked', async () => {
    const store = await loadStore();
    store.getState().startGauntlet(GAUNTLET);
    store.getState().resetGauntlet();

    expect(store.getState().gauntlet).toBeNull();
    expect(entries.has('web-katrain:gauntlet:v1')).toBe(false);
  });

  it('retires a ladder the same way, which is where the behaviour came from', async () => {
    const store = await loadStore();
    store.getState().startLadder(LADDER);
    store.getState().beginGame();
    store.getState().recordResult('win');

    store.getState().retire();

    expect(store.getState().ladder).toMatchObject({ status: 'ended', awaitingResult: false, wins: 1 });
  });

  it('has nothing to retire when no run was started', async () => {
    const store = await loadStore();
    expect(() => store.getState().retireGauntlet()).not.toThrow();
    expect(store.getState().gauntlet).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GAUNTLET_PRESETS,
  GAUNTLET_ROUNDS,
  type GauntletConfig,
  type GauntletState,
  applyGauntletResult,
  buildGauntletOpponents,
  createGauntlet,
  currentGauntletOpponentKyu,
  loadGauntlet,
  saveGauntlet,
} from '../src/utils/gauntlet';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function stubLocalStorage() {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, String(value)); },
      removeItem: (key: string) => { entries.delete(key); },
    },
    configurable: true,
    writable: true,
  });
  return entries;
}

const config: GauntletConfig = {
  boardSize: 19,
  userColor: 'black',
  komi: 6.5,
  handicap: 0,
  baseKyu: 10,
  preset: 'match',
};

/** Plays `n` wins from a fresh gauntlet. */
function afterWins(count: number, from: GauntletState = createGauntlet(config)): GauntletState {
  let state = from;
  for (let i = 0; i < count; i += 1) state = applyGauntletResult(state, 'win');
  return state;
}

let entries: Map<string, string>;
beforeEach(() => { entries = stubLocalStorage(); });
afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('building the opponent slate', () => {
  it('fields one opponent per round', () => {
    for (const { value } of GAUNTLET_PRESETS) {
      expect(buildGauntletOpponents(10, value)).toHaveLength(GAUNTLET_ROUNDS);
    }
  });

  it('reads lower kyu as stronger, so "harder" fields lower numbers', () => {
    const easier = buildGauntletOpponents(10, 'easier');
    const match = buildGauntletOpponents(10, 'match');
    const harder = buildGauntletOpponents(10, 'harder');

    const total = (slate: number[]) => slate.reduce((sum, kyu) => sum + kyu, 0);
    expect(total(harder)).toBeLessThan(total(match));
    expect(total(match)).toBeLessThan(total(easier));
  });

  it('gets no easier as a run goes on', () => {
    for (const { value } of GAUNTLET_PRESETS) {
      const slate = buildGauntletOpponents(10, value);
      for (let i = 1; i < slate.length; i += 1) {
        expect(slate[i]).toBeLessThanOrEqual(slate[i - 1]);
      }
    }
  });

  it('moves the whole slate with the player rank', () => {
    for (const { value } of GAUNTLET_PRESETS) {
      const at10 = buildGauntletOpponents(10, value);
      const at5 = buildGauntletOpponents(5, value);
      expect(at5).toEqual(at10.map(kyu => kyu - 5));
    }
  });
});

describe('starting a run', () => {
  it('opens at the first opponent with nothing played', () => {
    const state = createGauntlet(config);
    expect(state).toMatchObject({ index: 0, wins: 0, status: 'active', awaitingResult: false, history: [] });
    expect(currentGauntletOpponentKyu(state)).toBe(state.opponents[0]);
  });

  it('carries the game settings through', () => {
    expect(createGauntlet(config)).toMatchObject({ boardSize: 19, komi: 6.5, userColor: 'black' });
  });
});

describe('playing through a run', () => {
  it('advances to the next opponent on a win', () => {
    const state = afterWins(1);
    expect(state.status).toBe('active');
    expect(state.wins).toBe(1);
    expect(currentGauntletOpponentKyu(state)).toBe(state.opponents[1]);
  });

  it('is won only after every round', () => {
    for (let played = 1; played < GAUNTLET_ROUNDS; played += 1) {
      expect(afterWins(played).status).toBe('active');
    }
    const finished = afterWins(GAUNTLET_ROUNDS);
    expect(finished.status).toBe('won');
    expect(finished.wins).toBe(GAUNTLET_ROUNDS);
    expect(finished.index).toBe(GAUNTLET_ROUNDS);
  });

  it('ends the run on the first loss, whenever it comes', () => {
    for (let played = 0; played < GAUNTLET_ROUNDS; played += 1) {
      const lost = applyGauntletResult(afterWins(played), 'loss');
      expect(lost.status).toBe('lost');
      expect(lost.wins).toBe(played);
    }
  });

  it('records who was played and how it went', () => {
    const state = afterWins(2);
    expect(state.history).toEqual([
      { kyu: state.opponents[0], result: 'win' },
      { kyu: state.opponents[1], result: 'win' },
    ]);
  });

  it('keeps the history no longer than the run', () => {
    expect(afterWins(GAUNTLET_ROUNDS).history).toHaveLength(GAUNTLET_ROUNDS);
  });

  it('does not read past the end of the slate once the run is won', () => {
    const finished = afterWins(GAUNTLET_ROUNDS);
    expect(currentGauntletOpponentKyu(finished)).toBe(finished.opponents[GAUNTLET_ROUNDS - 1]);
  });
});

describe('remembering a run', () => {
  it('round-trips a run in progress', () => {
    const state = afterWins(2);
    saveGauntlet(state);
    expect(loadGauntlet()).toEqual(state);
  });

  it('forgets the run when asked', () => {
    saveGauntlet(afterWins(1));
    saveGauntlet(null);
    expect(loadGauntlet()).toBeNull();
  });

  it('has nothing to load before a run is started', () => {
    expect(loadGauntlet()).toBeNull();
  });

  it('reads a corrupted or incomplete run as none', () => {
    const key = [...entries.keys()][0] ?? 'web-katrain:gauntlet:v1';
    entries.set(key, '{not json');
    expect(loadGauntlet()).toBeNull();

    saveGauntlet(afterWins(1));
    const storedKey = [...entries.keys()][0];
    entries.set(storedKey, JSON.stringify({ index: 1 }));
    expect(loadGauntlet()).toBeNull();
    entries.set(storedKey, JSON.stringify({ opponents: [1, 2] }));
    expect(loadGauntlet()).toBeNull();
  });
});

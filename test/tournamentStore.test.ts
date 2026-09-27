import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameNode } from '../src/types';
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

describe('one series game at a time', () => {
  // Both watchers adopt whatever unfinished game is on the board, so a ladder
  // left waiting also scored the gauntlet game that replaced it -- one bot
  // resignation promoted the ladder 12k -> 11k and advanced the gauntlet.
  it('stops the ladder waiting when a gauntlet game begins', async () => {
    const store = await loadStore();
    store.getState().startLadder(LADDER);
    store.getState().beginGame();
    store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame();

    expect(store.getState().ladder?.awaitingResult).toBe(false);
    expect(store.getState().gauntlet?.awaitingResult).toBe(true);
    store.getState().recordResult('win');
    expect(store.getState().ladder?.history).toHaveLength(0);
    expect(entries.get('web-katrain:tournament:v1')).toContain('"awaitingResult":false');
  });

  it('stops the gauntlet waiting when a ladder game begins', async () => {
    const store = await loadStore();
    store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame();
    store.getState().startLadder(LADDER);
    store.getState().beginGame();

    expect(store.getState().gauntlet?.awaitingResult).toBe(false);
    expect(store.getState().ladder?.awaitingResult).toBe(true);
  });
});

describe('counting only the game the run started', () => {
  const root = () => ({ properties: {} } as unknown as GameNode);

  it('stamps the started game and keeps its id on the run', async () => {
    const store = await loadStore();
    store.getState().startLadder(LADDER);
    const gameRoot = root();
    store.getState().beginGame(gameRoot);
    const gameId = gameRoot.properties?.WKID?.[0];
    expect(gameId).toBeTruthy();
    expect(store.getState().ladder?.gameId).toBe(gameId);
    expect(entries.get('web-katrain:tournament:v1')).toContain(String(gameId));
  });

  it('ignores an automatic result read from any other game', async () => {
    const store = await loadStore();
    const ladder = store.getState().startLadder(LADDER);
    store.getState().beginGame(root());
    store.getState().recordResult('win', { runId: ladder.runId, gameId: 'wk-some-other-game' });
    expect(store.getState().ladder).toMatchObject({ wins: 0, awaitingResult: true });

    const gameId = store.getState().ladder!.gameId;
    store.getState().recordResult('win', { runId: ladder.runId, gameId });
    expect(store.getState().ladder).toMatchObject({ wins: 1, awaitingResult: false, gameId: null });
    // A second reading of the same result does not count again.
    store.getState().recordResult('win', { runId: ladder.runId, gameId });
    expect(store.getState().ladder?.wins).toBe(1);
  });

  it('ignores a result meant for an earlier run', async () => {
    const store = await loadStore();
    const first = store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame(root());
    const firstGame = store.getState().gauntlet!.gameId;
    store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame(root());
    store.getState().recordGauntletResult('loss', { runId: first.runId, gameId: firstGame });
    expect(store.getState().gauntlet).toMatchObject({ status: 'active', awaitingResult: true });
  });
});

describe('settling a game that has no winner', () => {
  it('records a draw on the ladder without changing the rung', async () => {
    const store = await loadStore();
    store.getState().startLadder(LADDER);
    store.getState().beginGame();
    store.getState().recordResult('draw');
    expect(store.getState().ladder).toMatchObject({ currentKyu: 10, draws: 1, awaitingResult: false });
  });

  it('replays a drawn gauntlet round', async () => {
    const store = await loadStore();
    store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame();
    store.getState().recordGauntletResult('draw');
    expect(store.getState().gauntlet).toMatchObject({ index: 0, wins: 0, status: 'active', awaitingResult: false });
  });

  it('can abandon a game as no result, recording nothing', async () => {
    const store = await loadStore();
    store.getState().startLadder(LADDER);
    store.getState().beginGame();
    store.getState().abandonGame();
    expect(store.getState().ladder).toMatchObject({ awaitingResult: false, gameId: null, wins: 0, losses: 0, draws: 0, history: [] });
    expect(entries.get('web-katrain:tournament:v1')).toContain('"awaitingResult":false');

    store.getState().startGauntlet(GAUNTLET);
    store.getState().beginGauntletGame();
    store.getState().abandonGauntletGame();
    expect(store.getState().gauntlet).toMatchObject({ awaitingResult: false, index: 0, status: 'active', history: [] });
  });
});

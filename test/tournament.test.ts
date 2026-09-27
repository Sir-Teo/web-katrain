import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyResult,
  createLadder,
  formatKyuRank,
  isResultForRun,
  loadLadder,
  parseResultWinner,
  promoteKyu,
  readRunResult,
  saveLadder,
} from '../src/utils/tournament';

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

let entries: Map<string, string>;
beforeEach(() => { entries = stubLocalStorage(); });
afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('tournament rank labels', () => {
  it('formats kyu and dan ranks (4 = 4k, 0 = 1d, -3 = 4d)', () => {
    expect(formatKyuRank(4)).toBe('4k');
    expect(formatKyuRank(1)).toBe('1k');
    expect(formatKyuRank(0)).toBe('1d');
    expect(formatKyuRank(-3)).toBe('4d');
  });

  it('promotes to a stronger (lower) kyu', () => {
    expect(promoteKyu(5)).toBe(4);
    expect(promoteKyu(0)).toBe(-1);
  });
});

describe('tournament result parsing', () => {
  it('reads the winning color from SGF RE strings', () => {
    expect(parseResultWinner('B+R')).toBe('black');
    expect(parseResultWinner('W+3.5')).toBe('white');
    expect(parseResultWinner('b+resign')).toBe('black');
    expect(parseResultWinner('Void')).toBeNull();
    expect(parseResultWinner(null)).toBeNull();
  });
});

describe('tournament ladder progression', () => {
  it('promotes and tracks best beaten on a win', () => {
    const ladder = createLadder({ boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
    const afterWin = applyResult({ ...ladder, awaitingResult: true }, 'win');
    expect(afterWin.wins).toBe(1);
    expect(afterWin.streak).toBe(1);
    expect(afterWin.currentKyu).toBe(9);
    expect(afterWin.bestKyu).toBe(10);
    expect(afterWin.awaitingResult).toBe(false);
  });

  it('keeps rank and resets streak on a loss', () => {
    const ladder = createLadder({ boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
    const won = applyResult({ ...ladder, awaitingResult: true }, 'win');
    const lost = applyResult({ ...won, awaitingResult: true }, 'loss');
    expect(lost.losses).toBe(1);
    expect(lost.streak).toBe(0);
    expect(lost.currentKyu).toBe(9); // unchanged by the loss
  });
});

describe('a stored ladder that survives the read must survive the next result', () => {
  const KEY = 'web-katrain:tournament:v1';
  const ladder = () => createLadder({ boardSize: 19, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
  const stored = () => JSON.parse(entries.get(KEY)!) as Record<string, unknown>;

  /**
   * `applyResult` spreads `state.history` and adds to `wins`/`streak`. The
   * loader only checked `currentKyu`, which told it the entry *was* a ladder
   * but not that it was a usable one: an older or hand-edited entry loaded
   * cleanly and threw "is not iterable" when the next game finished.
   */
  it.each([
    ['no history at all', (run: Record<string, unknown>) => { delete run.history; }],
    ['a history that is not an array', (run: Record<string, unknown>) => { run.history = 'none'; }],
    ['a history entry with no rank', (run: Record<string, unknown>) => { run.history = [{ result: 'win' }]; }],
    ['counters that are not numbers', (run: Record<string, unknown>) => { run.wins = null; }],
    ['a status it cannot be in', (run: Record<string, unknown>) => { run.status = 'paused'; }],
    ['a board size the app cannot draw', (run: Record<string, unknown>) => { run.boardSize = 21; }],
    ['a colour nobody plays', (run: Record<string, unknown>) => { run.userColor = 'green'; }],
    ['a NaN komi', (run: Record<string, unknown>) => { run.komi = Number.NaN; }],
  ])('drops a ladder with %s', (_label, corrupt) => {
    saveLadder(applyResult(ladder(), 'win'));
    const run = stored();
    corrupt(run);
    entries.set(KEY, JSON.stringify(run));

    expect(loadLadder()).toBeNull();
  });

  it('still restores a ladder it can act on, Infinity and all', () => {
    // bestKyu is +Infinity until something is beaten, and JSON writes that as
    // null; the loader has always had to put it back.
    saveLadder(ladder());
    const fresh = loadLadder()!;
    expect(fresh.bestKyu).toBe(Number.POSITIVE_INFINITY);

    saveLadder(applyResult(ladder(), 'win'));
    const restored = loadLadder()!;
    expect(restored).toMatchObject({ wins: 1, currentKyu: 9, bestKyu: 10 });
    expect(() => applyResult(restored, 'loss')).not.toThrow();
  });
});

describe('readRunResult', () => {
  const watch = (over: Partial<Parameters<typeof readRunResult>[0]> = {}) =>
    readRunResult({
      awaitingResult: true,
      watchedGameId: 'wk-ladder',
      gameId: 'wk-ladder',
      result: null,
      ...over,
    });

  it('reads nothing while no game is awaiting a result', () => {
    expect(watch({ awaitingResult: false, result: 'B+R' })).toBeNull();
  });

  it('records the result that appears on the game the run started', () => {
    expect(watch({ result: 'W+R' })).toBe('white');
    expect(watch({ result: 'B+7.5' })).toBe('black');
  });

  it('ignores a result that arrives with a different game', () => {
    // Opening any finished SGF mid-run used to be recorded as the player's own
    // result: a fresh 12k ladder went to 1-0 and promoted off someone else's
    // file, and the gauntlet ends outright on a loss it invents this way.
    expect(watch({ gameId: 'wk-opened-file', result: 'B+R' })).toBeNull();
    expect(watch({ gameId: null, result: 'B+R' })).toBeNull();
  });

  it('does not let another unfinished game take over the watch', () => {
    // Reproduced: mid-run, opening an unfinished game moved the watch onto it
    // (it was "adopted" as the game being played), and its result was later
    // counted for the series. The run's game is fixed when it begins now, so
    // the other game finishing never reaches the run...
    expect(watch({ gameId: 'wk-other-unfinished', result: null })).toBeNull();
    expect(watch({ gameId: 'wk-other-unfinished', result: 'B+R' })).toBeNull();
    // ...and going back to the series game still counts it.
    expect(watch({ gameId: 'wk-ladder', result: 'W+R' })).toBe('white');
  });

  it('leaves a run with no named game to the manual buttons', () => {
    // An entry saved before runs named their game.
    expect(watch({ watchedGameId: null, gameId: null, result: 'B+R' })).toBeNull();
  });

  it('keeps waiting through a result it cannot read', () => {
    for (const result of ['', '   ', 'Void', '?']) {
      expect(watch({ result }), result).toBeNull();
    }
  });
});

describe('which run a result belongs to', () => {
  const awaiting = { awaitingResult: true, runId: 'run-a', gameId: 'wk-1' };

  it('accepts a manual report for the awaited game', () => {
    expect(isResultForRun(awaiting)).toBe(true);
    expect(isResultForRun({ ...awaiting, awaitingResult: false })).toBe(false);
  });

  it('accepts an automatic reading only from the same run and game', () => {
    expect(isResultForRun(awaiting, { runId: 'run-a', gameId: 'wk-1' })).toBe(true);
    expect(isResultForRun(awaiting, { runId: 'run-b', gameId: 'wk-1' })).toBe(false);
    expect(isResultForRun(awaiting, { runId: 'run-a', gameId: 'wk-2' })).toBe(false);
    expect(isResultForRun({ ...awaiting, gameId: null }, { runId: 'run-a', gameId: null })).toBe(false);
  });

  it('names each new run and restores the name and game from storage', () => {
    const a = createLadder({ boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
    const b = createLadder({ boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
    expect(a.runId).not.toBe(b.runId);
    expect(a.gameId).toBeNull();
    saveLadder({ ...a, awaitingResult: true, gameId: 'wk-1' });
    expect(loadLadder()).toMatchObject({ runId: a.runId, gameId: 'wk-1', awaitingResult: true });
  });

  it('restores an older entry without a game name as waiting on nothing automatic', () => {
    const a = createLadder({ boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
    const legacy: Record<string, unknown> = { ...a, awaitingResult: true };
    delete legacy.runId;
    delete legacy.gameId;
    entries.set('web-katrain:tournament:v1', JSON.stringify(legacy));
    const restored = loadLadder();
    expect(restored?.gameId).toBeNull();
    expect(typeof restored?.runId).toBe('string');
  });
});

describe('the rank bot range', () => {
  it('does not promote past the strongest calibrated rank', () => {
    expect(promoteKyu(-4)).toBe(-5);
    expect(promoteKyu(-5)).toBe(-5);
  });
});

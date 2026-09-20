import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyResult,
  createLadder,
  formatKyuRank,
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
      rootId: 'root-ladder',
      result: null,
      watchedRootId: null,
      ...over,
    });

  it('watches nothing while no game is awaiting a result', () => {
    expect(watch({ awaitingResult: false, watchedRootId: 'root-ladder' }))
      .toEqual({ watchedRootId: null, winner: null });
  });

  it('adopts the unfinished game on the board as the one being played', () => {
    expect(watch()).toEqual({ watchedRootId: 'root-ladder', winner: null });
    // An auto-save restored after a reload replaces the tree; it is still the
    // game the run is waiting on, so the watch follows it.
    expect(watch({ rootId: 'root-restored', watchedRootId: 'root-ladder' }))
      .toEqual({ watchedRootId: 'root-restored', winner: null });
  });

  it('records the result that appears on the game it was watching', () => {
    expect(watch({ result: 'W+R', watchedRootId: 'root-ladder' }))
      .toEqual({ watchedRootId: null, winner: 'white' });
    expect(watch({ result: 'B+7.5', watchedRootId: 'root-ladder' }))
      .toEqual({ watchedRootId: null, winner: 'black' });
  });

  it('ignores a result that arrives with a different game', () => {
    // Opening any finished SGF mid-run used to be recorded as the player's own
    // result: a fresh 12k ladder went to 1-0 and promoted off someone else's
    // file, and the gauntlet ends outright on a loss it invents this way.
    expect(watch({ rootId: 'root-opened-file', result: 'B+R', watchedRootId: 'root-ladder' }))
      .toEqual({ watchedRootId: 'root-ladder', winner: null });
  });

  it('stops watching once it records, so one result counts once', () => {
    const first = watch({ result: 'W+R', watchedRootId: 'root-ladder' });
    expect(first.winner).toBe('white');
    expect(watch({ result: 'W+R', watchedRootId: first.watchedRootId }).winner).toBeNull();
  });

  it('keeps waiting through a result it cannot read', () => {
    for (const result of ['', '   ', 'Void', '0', '?']) {
      expect(watch({ result, watchedRootId: 'root-ladder' }).winner, result).toBeNull();
    }
    // A drawn or void game leaves the run waiting on the manual buttons rather
    // than handing the watch to the next file opened.
    expect(watch({ result: 'Void', watchedRootId: 'root-ladder' }).watchedRootId).toBe('root-ladder');
  });
});

import type { BoardSize, Player } from '../types';
import { isBoardSize } from './boardSize';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './storage';

export type GameResult = 'win' | 'loss';

export interface LadderConfig {
  boardSize: BoardSize;
  userColor: Player;
  komi: number;
  handicap: number;
  startKyu: number;
}

export interface LadderState extends LadderConfig {
  currentKyu: number;
  wins: number;
  losses: number;
  streak: number; // current consecutive wins
  bestKyu: number; // strongest (lowest kyu) opponent defeated; +Infinity if none
  history: Array<{ kyu: number; result: GameResult }>;
  awaitingResult: boolean; // a live game is underway for currentKyu
  status: 'active' | 'ended';
}

const STORAGE_KEY = 'web-katrain:tournament:v1';

/**
 * Format a KaTrain-style kyu-rank number as a human rank label.
 * Matches the engine convention: 4 = 4k, 0 = 1d, -3 = 4d.
 */
export const formatKyuRank = (kyu: number): string => {
  const rounded = Math.round(kyu);
  if (rounded >= 1) return `${rounded}k`;
  return `${1 - rounded}d`;
};

/** Stronger opponent = lower kyu number. */
export const promoteKyu = (kyu: number): number => kyu - 1;

/** Parse an SGF RE result string into the winning color. */
export const parseResultWinner = (re: string | null | undefined): Player | null => {
  if (!re) return null;
  const m = re.trim().toUpperCase();
  if (m.startsWith('B+')) return 'black';
  if (m.startsWith('W+')) return 'white';
  return null;
};

export interface RunResultReading {
  /** The root to go on watching, or null when nothing is being watched. */
  watchedRootId: string | null;
  /** The winner to record against the run, or null for "not this game". */
  winner: Player | null;
}

/**
 * Whether the result now on the board belongs to the game the run started.
 *
 * A run waiting on a result used to accept `RE` from *whatever* tree was
 * loaded, because the watcher only asked whether a result existed. Opening any
 * finished game while a ladder game was underway therefore recorded that file's
 * result as the player's own: measured in the browser, a fresh 12k run went to
 * 1-0, promoted to 11k, "Best beaten 12k" -- and was persisted -- off an SGF
 * nobody in the run had played. The gauntlet shares this watcher, where the
 * same mistake ends the run outright.
 *
 * So the root the result arrives on has to be the root that was on the board
 * *before* there was a result. An unfinished game is adopted as the one being
 * played, which keeps the two ways the ladder's own game can legitimately
 * change identity -- the game it starts, and an auto-save restored after a
 * reload -- while a tree that arrives already carrying a result is not the game
 * anyone just played, and is ignored. "I won" / "I lost" in the panel still
 * covers every case this declines to guess at.
 *
 * Recording stops the watch, so a result cannot be counted twice if the store
 * declines the first attempt.
 */
export function readRunResult(args: {
  awaitingResult: boolean;
  rootId: string;
  result: string | null | undefined;
  watchedRootId: string | null;
}): RunResultReading {
  const { awaitingResult, rootId, result, watchedRootId } = args;
  if (!awaitingResult) return { watchedRootId: null, winner: null };
  if (typeof result !== 'string' || result.trim() === '') {
    return { watchedRootId: rootId, winner: null };
  }
  if (watchedRootId !== rootId) return { watchedRootId, winner: null };
  const winner = parseResultWinner(result);
  if (!winner) return { watchedRootId, winner: null };
  return { watchedRootId: null, winner };
}

export const createLadder = (config: LadderConfig): LadderState => ({
  ...config,
  currentKyu: config.startKyu,
  wins: 0,
  losses: 0,
  streak: 0,
  bestKyu: Number.POSITIVE_INFINITY,
  history: [],
  awaitingResult: false,
  status: 'active',
});

/** Apply a reported game result and return the next ladder state. */
export const applyResult = (state: LadderState, result: GameResult): LadderState => {
  const playedKyu = state.currentKyu;
  const history = [...state.history, { kyu: playedKyu, result }].slice(-50);
  if (result === 'win') {
    return {
      ...state,
      wins: state.wins + 1,
      streak: state.streak + 1,
      bestKyu: Math.min(state.bestKyu, playedKyu),
      currentKyu: promoteKyu(playedKyu),
      history,
      awaitingResult: false,
    };
  }
  return {
    ...state,
    losses: state.losses + 1,
    streak: 0,
    history,
    awaitingResult: false,
  };
};

/** Rejects NaN, Infinity and the strings a JSON round-trip can leave behind. */
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * A stored run only counts if `applyResult` can still act on it.
 *
 * Checking `currentKyu` alone was enough to be sure the entry *was* a ladder,
 * not enough to be sure it was a usable one. `applyResult` spreads
 * `state.history`, so an entry written by an older version -- or edited by
 * hand, which is the whole reason these loaders are wrapped in try/catch --
 * threw "is not iterable" when the next game finished, long after the bad read.
 * Losing a practice ladder is the cheaper failure, so anything that does not
 * fit is dropped at the read, which can still report nothing to restore.
 */
export const isLadderHistory = (value: unknown): value is LadderState['history'] =>
  Array.isArray(value)
  && value.every((entry) => !!entry && typeof entry === 'object'
    && isFiniteNumber((entry as { kyu?: unknown }).kyu)
    && ((entry as { result?: unknown }).result === 'win' || (entry as { result?: unknown }).result === 'loss'));

/**
 * Storage goes through the guarded helpers rather than touching `localStorage`
 * directly. The direct form guarded itself with
 * `typeof localStorage === 'undefined'`, which reads as defensive but is the
 * opposite: `typeof` on a global property still runs its getter, and a browser
 * that blocks site data makes that getter *throw*. The check sat outside the
 * try, so it threw during module init -- and this module is imported by
 * `tournamentStore`, whose initial state calls it, so the whole app rendered a
 * blank page rather than losing a ladder.
 */
export const loadLadder = (): LadderState | null => {
  try {
    const raw = readLocalStorage(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LadderState>;
    if (!parsed || typeof parsed !== 'object') return null;
    const numbers: Array<keyof LadderState> = ['currentKyu', 'startKyu', 'wins', 'losses', 'streak', 'komi', 'handicap'];
    if (!numbers.every((key) => isFiniteNumber(parsed[key]))) return null;
    if (!isLadderHistory(parsed.history)) return null;
    if (parsed.status !== 'active' && parsed.status !== 'ended') return null;
    if (parsed.userColor !== 'black' && parsed.userColor !== 'white') return null;
    if (!isBoardSize(parsed.boardSize as number)) return null;
    // bestKyu serializes Infinity as null via JSON; restore it.
    const bestKyu = isFiniteNumber(parsed.bestKyu) ? parsed.bestKyu : Number.POSITIVE_INFINITY;
    return { ...(parsed as LadderState), bestKyu, awaitingResult: parsed.awaitingResult === true };
  } catch {
    return null;
  }
};

export const saveLadder = (state: LadderState | null): void => {
  if (!state) {
    removeLocalStorage(STORAGE_KEY);
    return;
  }
  const serializable = {
    ...state,
    bestKyu: Number.isFinite(state.bestKyu) ? state.bestKyu : null,
  };
  writeLocalStorage(STORAGE_KEY, JSON.stringify(serializable));
};

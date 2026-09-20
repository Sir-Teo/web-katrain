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

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
  /** Names this run, so a result meant for an earlier run is not counted here. */
  runId: string;
  /**
   * The id (`WKID`) stamped on the root of the game this run is waiting on, or
   * null when no game is underway -- or when the entry predates the stamp, in
   * which case only the manual buttons can settle it.
   */
  gameId: string | null;
}

/** Which run and game a result was read from. */
export interface RunGameRef {
  runId: string;
  gameId: string | null;
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

/**
 * The rank bot's calibrated range, 20k to 6d -- what New Game offers and the
 * ladder describes. Past it the bot plays no rank anyone measured: beating
 * the 6d rung promoted to a "7d", and a 20k gauntlet on Easier opened at 22k.
 */
export const RANK_BOT_WEAKEST_KYU = 20;
export const RANK_BOT_STRONGEST_KYU = -5;

export const clampRankBotKyu = (kyu: number): number =>
  Math.min(RANK_BOT_WEAKEST_KYU, Math.max(RANK_BOT_STRONGEST_KYU, kyu));

/** Stronger opponent = lower kyu number, up to the strongest calibrated rank. */
export const promoteKyu = (kyu: number): number => clampRankBotKyu(kyu - 1);

/** Parse an SGF RE result string into the winning color. */
export const parseResultWinner = (re: string | null | undefined): Player | null => {
  if (!re) return null;
  const m = re.trim().toUpperCase();
  if (m.startsWith('B+')) return 'black';
  if (m.startsWith('W+')) return 'white';
  return null;
};

/**
 * The winner to record against the run for the result now on the board, or
 * null for "not this game" / "nothing to record yet".
 *
 * A run waiting on a result used to accept `RE` from *whatever* tree was
 * loaded. Opening any finished game while a ladder game was underway recorded
 * that file's result as the player's own: measured in the browser, a fresh 12k
 * run went to 1-0, promoted to 11k, "Best beaten 12k" -- and was persisted --
 * off an SGF nobody in the run had played.
 *
 * The next version kept the watch on the root that was on the board before
 * there was a result, adopting any *unfinished* tree as the game being played
 * so that an auto-save restored after a reload -- which gets fresh node ids --
 * kept being watched. That adoption was the next hole: open any other
 * unfinished game mid-run (a library game, a pasted position, a fresh New
 * Game) and the watch moved onto it, so its result was later counted as the
 * series game's.
 *
 * So the run now names its game outright. `beginGame` stamps the new game's
 * root with a stable id (`WKID`, which travels inside the SGF and so survives
 * auto-save and library round-trips) and persists it on the run; only a result
 * on a root carrying that same id is counted. Switching games leaves the run
 * waiting on the one it started. "I won" / "I lost" in the panel still covers
 * every case this declines to guess at.
 */
export function readRunResult(args: {
  awaitingResult: boolean;
  /** The game id the run persisted when its game began. */
  watchedGameId: string | null;
  /** The game id on the root now on the board. */
  gameId: string | null;
  result: string | null | undefined;
}): Player | null {
  const { awaitingResult, watchedGameId, gameId, result } = args;
  if (!awaitingResult || !watchedGameId || gameId !== watchedGameId) return null;
  return parseResultWinner(result);
}

/** A fresh run id; unique enough to tell one practice run from the next. */
export const createRunId = (): string => {
  const cryptoObj = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : null;
  if (cryptoObj?.randomUUID) return `run-${cryptoObj.randomUUID()}`;
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Whether a result read from `from` belongs to the game `state` is waiting on.
 * A manual report carries no ref and always applies to the awaited game.
 */
export const isResultForRun = (
  state: { awaitingResult: boolean; runId: string; gameId: string | null },
  from?: RunGameRef,
): boolean => {
  if (!state.awaitingResult) return false;
  if (!from) return true;
  return from.runId === state.runId && from.gameId !== null && from.gameId === state.gameId;
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
  runId: createRunId(),
  gameId: null,
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
      gameId: null,
    };
  }
  return {
    ...state,
    losses: state.losses + 1,
    streak: 0,
    history,
    awaitingResult: false,
    gameId: null,
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
 * A stored run's identity. Entries written before runs named their game have
 * neither; they get a fresh run id and no game, which leaves a game already
 * underway to the manual buttons rather than to whichever game is open.
 */
export const readRunIdentity = (parsed: { runId?: unknown; gameId?: unknown }): RunGameRef => ({
  runId: typeof parsed.runId === 'string' && parsed.runId ? parsed.runId : createRunId(),
  gameId: typeof parsed.gameId === 'string' && parsed.gameId ? parsed.gameId : null,
});

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
    return {
      ...(parsed as LadderState),
      bestKyu,
      awaitingResult: parsed.awaitingResult === true,
      ...readRunIdentity(parsed),
    };
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

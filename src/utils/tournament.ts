import type { BoardSize, Player } from '../types';

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

export const loadLadder = (): LadderState | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LadderState>;
    if (!parsed || typeof parsed.currentKyu !== 'number') return null;
    // bestKyu serializes Infinity as null via JSON; restore it.
    const bestKyu = typeof parsed.bestKyu === 'number' ? parsed.bestKyu : Number.POSITIVE_INFINITY;
    return { ...(parsed as LadderState), bestKyu };
  } catch {
    return null;
  }
};

export const saveLadder = (state: LadderState | null): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!state) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const serializable = {
      ...state,
      bestKyu: Number.isFinite(state.bestKyu) ? state.bestKyu : null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Ignore storage failures (private mode, quota).
  }
};

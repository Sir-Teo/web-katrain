import type { BoardSize, Player } from '../types';
import type { GameResult } from './tournament';

// A fixed 4-game gauntlet against bots: lose any one game and the run ends.
// Difficulty presets pick the opponent slate relative to the player's rank.
// Remember: LOWER kyu = STRONGER (promoteKyu subtracts).

export type GauntletPreset = 'easier' | 'match' | 'harder';

export interface GauntletConfig {
  boardSize: BoardSize;
  userColor: Player;
  komi: number;
  handicap: number;
  baseKyu: number;
  preset: GauntletPreset;
}

export interface GauntletState extends GauntletConfig {
  opponents: number[]; // GAUNTLET_ROUNDS opponent kyu ranks
  index: number; // 0..GAUNTLET_ROUNDS (=== GAUNTLET_ROUNDS when won)
  wins: number;
  status: 'active' | 'won' | 'lost';
  awaitingResult: boolean;
  history: Array<{ kyu: number; result: GameResult }>;
}

export const GAUNTLET_ROUNDS = 4;
const STORAGE_KEY = 'web-katrain:gauntlet:v1';

export const GAUNTLET_PRESETS: Array<{ value: GauntletPreset; label: string; detail: string }> = [
  { value: 'easier', label: 'Easier', detail: 'Two bots below your level, then even.' },
  { value: 'match', label: 'Match my level', detail: 'A balanced field with one opponent above you.' },
  { value: 'harder', label: 'Harder', detail: 'Two bots above your level. A real stretch.' },
];

export function buildGauntletOpponents(baseKyu: number, preset: GauntletPreset): number[] {
  switch (preset) {
    case 'easier':
      return [baseKyu + 2, baseKyu + 1, baseKyu + 1, baseKyu];
    case 'harder':
      return [baseKyu, baseKyu - 1, baseKyu - 1, baseKyu - 2];
    case 'match':
    default:
      return [baseKyu + 1, baseKyu, baseKyu, baseKyu - 1];
  }
}

export const createGauntlet = (config: GauntletConfig): GauntletState => ({
  ...config,
  opponents: buildGauntletOpponents(config.baseKyu, config.preset),
  index: 0,
  wins: 0,
  status: 'active',
  awaitingResult: false,
  history: [],
});

export const currentGauntletOpponentKyu = (state: GauntletState): number =>
  state.opponents[Math.min(state.index, state.opponents.length - 1)] ?? state.baseKyu;

export const applyGauntletResult = (state: GauntletState, result: GameResult): GauntletState => {
  const playedKyu = currentGauntletOpponentKyu(state);
  const history = [...state.history, { kyu: playedKyu, result }].slice(-GAUNTLET_ROUNDS);
  if (result === 'loss') {
    return { ...state, status: 'lost', awaitingResult: false, history };
  }
  const wins = state.wins + 1;
  const nextIndex = state.index + 1;
  if (nextIndex >= GAUNTLET_ROUNDS) {
    return { ...state, wins, index: GAUNTLET_ROUNDS, status: 'won', awaitingResult: false, history };
  }
  return { ...state, wins, index: nextIndex, awaitingResult: false, history };
};

export const loadGauntlet = (): GauntletState | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GauntletState>;
    if (!parsed || !Array.isArray(parsed.opponents) || typeof parsed.index !== 'number') return null;
    return parsed as GauntletState;
  } catch {
    return null;
  }
};

export const saveGauntlet = (state: GauntletState | null): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!state) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (private mode, quota).
  }
};

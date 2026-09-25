import type { BoardSize, Player } from '../types';
import { isBoardSize } from './boardSize';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './storage';
import { clampRankBotKyu, isFiniteNumber, isLadderHistory, type GameResult } from './tournament';

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
  const offsets = preset === 'easier' ? [2, 1, 1, 0] : preset === 'harder' ? [0, -1, -1, -2] : [1, 0, 0, -1];
  return offsets.map((offset) => clampRankBotKyu(baseKyu + offset));
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

/** Guarded the same way, and for the same reason, as `loadLadder`. */
export const loadGauntlet = (): GauntletState | null => {
  try {
    const raw = readLocalStorage(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GauntletState>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.opponents) || !parsed.opponents.every(isFiniteNumber)) return null;
    const numbers: Array<keyof GauntletState> = ['index', 'wins', 'baseKyu', 'komi', 'handicap'];
    if (!numbers.every((key) => isFiniteNumber(parsed[key]))) return null;
    // `applyGauntletResult` spreads this; an older or hand-edited entry without
    // it threw only when the next game finished. See `loadLadder`.
    if (!isLadderHistory(parsed.history)) return null;
    if (parsed.status !== 'active' && parsed.status !== 'won' && parsed.status !== 'lost') return null;
    if (parsed.userColor !== 'black' && parsed.userColor !== 'white') return null;
    if (!GAUNTLET_PRESETS.some((preset) => preset.value === parsed.preset)) return null;
    if (!isBoardSize(parsed.boardSize as number)) return null;
    return { ...(parsed as GauntletState), awaitingResult: parsed.awaitingResult === true };
  } catch {
    return null;
  }
};

export const saveGauntlet = (state: GauntletState | null): void => {
  if (!state) {
    removeLocalStorage(STORAGE_KEY);
    return;
  }
  writeLocalStorage(STORAGE_KEY, JSON.stringify(state));
};

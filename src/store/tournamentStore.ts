import { createWithEqualityFn as create } from 'zustand/traditional';
import {
  applyResult,
  createLadder,
  loadLadder,
  saveLadder,
  type GameResult,
  type LadderConfig,
  type LadderState,
} from '../utils/tournament';
import {
  applyGauntletResult,
  createGauntlet,
  loadGauntlet,
  saveGauntlet,
  type GauntletConfig,
  type GauntletState,
} from '../utils/gauntlet';

interface TournamentStore {
  ladder: LadderState | null;
  gauntlet: GauntletState | null;
  /** Start a fresh ladder run. Returns the created state for game setup. */
  startLadder: (config: LadderConfig) => LadderState;
  /** Mark the current rung's game as underway (awaiting a result). */
  beginGame: () => void;
  /** Record the outcome of the current rung's game. */
  recordResult: (result: GameResult) => void;
  /** End the run (keeps the summary visible). */
  retire: () => void;
  /** Clear the ladder entirely. */
  reset: () => void;
  /** Start a fresh gauntlet run. Returns the created state for game setup. */
  startGauntlet: (config: GauntletConfig) => GauntletState;
  /** Mark the current gauntlet game as underway (awaiting a result). */
  beginGauntletGame: () => void;
  /** Record the outcome of the current gauntlet game. */
  recordGauntletResult: (result: GameResult) => void;
  /** Clear the gauntlet entirely. */
  resetGauntlet: () => void;
}

const persist = (ladder: LadderState | null): LadderState | null => {
  saveLadder(ladder);
  return ladder;
};

const persistGauntlet = (gauntlet: GauntletState | null): GauntletState | null => {
  saveGauntlet(gauntlet);
  return gauntlet;
};

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  ladder: loadLadder(),
  gauntlet: loadGauntlet(),

  startLadder: (config) => {
    const ladder = createLadder(config);
    set({ ladder: persist(ladder) });
    return ladder;
  },

  beginGame: () => {
    const ladder = get().ladder;
    if (!ladder || ladder.status !== 'active') return;
    set({ ladder: persist({ ...ladder, awaitingResult: true }) });
  },

  recordResult: (result: GameResult) => {
    const ladder = get().ladder;
    if (!ladder || !ladder.awaitingResult) return;
    set({ ladder: persist(applyResult(ladder, result)) });
  },

  retire: () => {
    const ladder = get().ladder;
    if (!ladder) return;
    set({ ladder: persist({ ...ladder, awaitingResult: false, status: 'ended' }) });
  },

  reset: () => {
    set({ ladder: persist(null) });
  },

  startGauntlet: (config) => {
    const gauntlet = createGauntlet(config);
    set({ gauntlet: persistGauntlet(gauntlet) });
    return gauntlet;
  },

  beginGauntletGame: () => {
    const gauntlet = get().gauntlet;
    if (!gauntlet || gauntlet.status !== 'active') return;
    set({ gauntlet: persistGauntlet({ ...gauntlet, awaitingResult: true }) });
  },

  recordGauntletResult: (result: GameResult) => {
    const gauntlet = get().gauntlet;
    if (!gauntlet || !gauntlet.awaitingResult) return;
    set({ gauntlet: persistGauntlet(applyGauntletResult(gauntlet, result)) });
  },

  resetGauntlet: () => {
    set({ gauntlet: persistGauntlet(null) });
  },
}));

import { createWithEqualityFn as create } from 'zustand/traditional';
import type { GameNode } from '../types';
import { ensurePinGameId } from '../utils/pinnedVariations';
import {
  applyResult,
  createLadder,
  isResultForRun,
  loadLadder,
  saveLadder,
  type GameResult,
  type LadderConfig,
  type LadderState,
  type RunGameRef,
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
  /**
   * Mark the current rung's game as underway (awaiting a result). `gameRoot`
   * is the root of the game just started: it is stamped with a stable id that
   * the run keeps, so only that game's result is ever counted automatically.
   */
  beginGame: (gameRoot?: GameNode) => void;
  /**
   * Record the outcome of the current rung's game. `from` names the run and
   * game an automatic reading came from; it is ignored unless it matches the
   * awaited game. A manual report passes nothing.
   */
  recordResult: (result: GameResult, from?: RunGameRef) => void;
  /** End the run (keeps the summary visible). */
  retire: () => void;
  /** Clear the ladder entirely. */
  reset: () => void;
  /** Start a fresh gauntlet run. Returns the created state for game setup. */
  startGauntlet: (config: GauntletConfig) => GauntletState;
  /** Mark the current gauntlet game as underway (awaiting a result). See `beginGame`. */
  beginGauntletGame: (gameRoot?: GameNode) => void;
  /** Record the outcome of the current gauntlet game. See `recordResult`. */
  recordGauntletResult: (result: GameResult, from?: RunGameRef) => void;
  /** End the run without finishing it (keeps the summary visible). */
  retireGauntlet: () => void;
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

  beginGame: (gameRoot) => {
    const ladder = get().ladder;
    if (!ladder || ladder.status !== 'active') return;
    const gameId = gameRoot ? ensurePinGameId(gameRoot) : null;
    // One game is on the board at a time: a gauntlet left awaiting its result
    // is abandoned rather than left waiting on a game nobody will finish.
    const gauntlet = get().gauntlet;
    set({
      ladder: persist({ ...ladder, awaitingResult: true, gameId }),
      ...(gauntlet?.awaitingResult ? { gauntlet: persistGauntlet({ ...gauntlet, awaitingResult: false, gameId: null }) } : {}),
    });
  },

  recordResult: (result, from) => {
    const ladder = get().ladder;
    if (!ladder || !isResultForRun(ladder, from)) return;
    set({ ladder: persist(applyResult(ladder, result)) });
  },

  retire: () => {
    const ladder = get().ladder;
    if (!ladder) return;
    set({ ladder: persist({ ...ladder, awaitingResult: false, gameId: null, status: 'ended' }) });
  },

  reset: () => {
    set({ ladder: persist(null) });
  },

  startGauntlet: (config) => {
    const gauntlet = createGauntlet(config);
    set({ gauntlet: persistGauntlet(gauntlet) });
    return gauntlet;
  },

  beginGauntletGame: (gameRoot) => {
    const gauntlet = get().gauntlet;
    if (!gauntlet || gauntlet.status !== 'active') return;
    const gameId = gameRoot ? ensurePinGameId(gameRoot) : null;
    // The same for a ladder left waiting: see beginGame.
    const ladder = get().ladder;
    set({
      gauntlet: persistGauntlet({ ...gauntlet, awaitingResult: true, gameId }),
      ...(ladder?.awaitingResult ? { ladder: persist({ ...ladder, awaitingResult: false, gameId: null }) } : {}),
    });
  },

  recordGauntletResult: (result, from) => {
    const gauntlet = get().gauntlet;
    if (!gauntlet || !isResultForRun(gauntlet, from)) return;
    set({ gauntlet: persistGauntlet(applyGauntletResult(gauntlet, result)) });
  },

  retireGauntlet: () => {
    const gauntlet = get().gauntlet;
    if (!gauntlet) return;
    set({ gauntlet: persistGauntlet({ ...gauntlet, awaitingResult: false, gameId: null, status: 'lost' }) });
  },

  resetGauntlet: () => {
    set({ gauntlet: persistGauntlet(null) });
  },
}));

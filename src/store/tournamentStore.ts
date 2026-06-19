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

interface TournamentStore {
  ladder: LadderState | null;
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
}

const persist = (ladder: LadderState | null): LadderState | null => {
  saveLadder(ladder);
  return ladder;
};

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  ladder: loadLadder(),

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
}));

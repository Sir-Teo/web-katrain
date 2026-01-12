import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { computeGameReport } from '../src/utils/gameReport';
import type { AnalysisResult, CandidateMove } from '../src/types';

const EMPTY_TERRITORY: number[][] = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));

function analysis(args: { rootScoreLead: number; rootWinRate: number; moves?: CandidateMove[] }): AnalysisResult {
  return {
    rootWinRate: args.rootWinRate,
    rootScoreLead: args.rootScoreLead,
    moves: args.moves ?? [],
    territory: EMPTY_TERRITORY,
    policy: undefined,
    ownershipStdev: undefined,
  };
}

describe('computeGameReport', () => {
  afterEach(() => {
    useGameStore.getState().resetGame();
  });

  it('computes KaTrain-style stats and histogram from analyzed moves', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0); // B
    store.playMove(1, 0); // W

    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;
    const n2 = n1.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      rootWinRate: 0.5,
      moves: [
        { x: 0, y: 0, winRate: 0.55, scoreLead: 0.0, visits: 100, pointsLost: 0, order: 0, prior: 0.6 },
        { x: 2, y: 2, winRate: 0.54, scoreLead: -1.0, visits: 50, pointsLost: 1.0, order: 1, prior: 0.4 },
      ],
    });
    n1.analysis = analysis({
      rootScoreLead: -5,
      rootWinRate: 0.5,
      moves: [
        { x: 1, y: 0, winRate: 0.52, scoreLead: -5.0, visits: 80, pointsLost: 0, order: 0, prior: 0.7 },
        { x: -1, y: -1, winRate: 0.51, scoreLead: -4.8, visits: 20, pointsLost: 0.2, order: 1, prior: 0.3 },
      ],
    });
    n2.analysis = analysis({
      rootScoreLead: -6,
      rootWinRate: 0.5,
    });

    const thresholds = [12, 6, 3, 1.5, 0.5, 0];
    const report = computeGameReport({ currentNode: root, thresholds });

    expect(report.stats.black.numMoves).toBe(1);
    expect(report.stats.white.numMoves).toBe(1);

    expect(report.stats.black.aiTopMove).toBe(1);
    expect(report.stats.white.aiTopMove).toBe(1);

    // Black points lost: 0 - (-5) = 5 -> bucket for ≥ 3 and < 6.
    // White points lost: -(( -5 ) - ( -6 )) = -1 -> clamped to 0 -> bucket < 0.5.
    const blackTotal = report.histogram.reduce((acc, row) => acc + row.black, 0);
    const whiteTotal = report.histogram.reduce((acc, row) => acc + row.white, 0);
    expect(blackTotal).toBe(1);
    expect(whiteTotal).toBe(1);
  });
});


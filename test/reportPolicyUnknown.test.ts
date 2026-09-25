import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import { computeGameReport } from '../src/utils/gameReport';
import type { AnalysisResult, CandidateMove } from '../src/types';

const analysis = (rootScoreLead: number, moves: CandidateMove[], policy?: number[]): AnalysisResult => ({
  rootWinRate: 0.5,
  rootScoreLead,
  rootVisits: 25,
  moves,
  territory: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0)),
  policy,
  ownershipStdev: undefined,
});

const candidate = (x: number, y: number, prior: number, order: number): CandidateMove => ({
  x, y, winRate: 0.5, scoreLead: 0, visits: 10, pointsLost: 0, order, prior,
});

describe('policy view of a move outside the searched candidates', () => {
  const setup = (policy?: number[]) => {
    useGameStore.getState().loadGame(parseSgf('(;GM[1]SZ[9];B[ee])'));
    const root = useGameStore.getState().rootNode;
    // E5 (4,4) was played; the search only listed C3 and G7.
    root.analysis = analysis(0, [candidate(2, 2, 0.4, 0), candidate(6, 6, 0.3, 1)], policy);
    root.children[0]!.analysis = analysis(-0.5, []);
    return computeGameReport({ currentNode: root, thresholds: [12, 6, 3, 1.5, 0.5, 0] });
  };

  it('is unknown without the raw policy, not a blunder', () => {
    // Fast review keeps no policy array; a zero prior read as "Blunder,
    // unranked, 0% of top" for a fifth of a professional game.
    const report = setup(undefined);
    expect(report.moveEntries[0]!.policy).toBeUndefined();
    expect(report.stats.black.policyDistribution?.blunder ?? 0).toBe(0);
  });

  it('is read from the raw policy when the analysis kept it', () => {
    const policy = new Array(82).fill(0.001);
    policy[4 * 9 + 4] = 0.2;
    const entry = setup(policy).moveEntries[0]!;
    expect(entry.policy?.playedPrior).toBeCloseTo(0.2);
  });
});

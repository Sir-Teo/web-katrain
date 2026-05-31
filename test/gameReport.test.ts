import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import {
  classifyMoveByRankAndPolicy,
  computeGameReport,
  getMovePhase,
  getPhaseThresholds,
  getPointLossBucket,
  getReportRecoveries,
  getReportTurningPoints,
  sortMoveReportEntries,
  type MoveReportEntry,
  type MovePolicyCategory,
} from '../src/utils/gameReport';
import type { AnalysisResult, CandidateMove } from '../src/types';

const EMPTY_TERRITORY: number[][] = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));

function analysis(args: {
  rootScoreLead: number;
  rootWinRate: number;
  moves?: CandidateMove[];
  rootVisits?: number;
  boardSize?: number;
}): AnalysisResult {
  const boardSize = args.boardSize;
  return {
    rootWinRate: args.rootWinRate,
    rootScoreLead: args.rootScoreLead,
    rootVisits: args.rootVisits,
    moves: args.moves ?? [],
    territory: boardSize
      ? Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => 0))
      : EMPTY_TERRITORY,
    policy: undefined,
    ownershipStdev: undefined,
  };
}

function buildAnalyzedPassGame(boardSize: 9 | 13 | 19, moves: number): void {
  const store = useGameStore.getState();
  store.startNewGame({ komi: 6.5, rules: 'japanese', boardSize, handicap: 0 });

  let scoreLead = 0;
  for (let idx = 0; idx < moves; idx++) {
    const state = useGameStore.getState();
    const parent = state.currentNode;
    const player = state.currentPlayer;
    const loss = idx + 1;
    const nextScoreLead = player === 'black' ? scoreLead - loss : scoreLead + loss;

    parent.analysis = analysis({
      rootScoreLead: scoreLead,
      rootWinRate: 0.5,
      boardSize,
      moves: [{ x: -1, y: -1, winRate: 0.5, scoreLead, visits: 100, pointsLost: 0, order: 0, prior: 1.0 }],
    });
    state.passTurn();
    useGameStore.getState().currentNode.analysis = analysis({
      rootScoreLead: nextScoreLead,
      rootWinRate: 0.5,
      rootVisits: 100,
      boardSize,
    });
    scoreLead = nextScoreLead;
  }
}

function reportEntry(args: {
  moveNumber: number;
  pointsLost: number;
  pointsGained?: number;
  scoreSwing?: number;
  category?: MovePolicyCategory;
  relativePrior?: number;
  rank?: number;
}): MoveReportEntry {
  return {
    node: {} as MoveReportEntry['node'],
    moveNumber: args.moveNumber,
    player: 'black',
    move: 'D4',
    pointsLost: args.pointsLost,
    pointsGained: args.pointsGained ?? 0,
    scoreBefore: 0,
    scoreAfter: args.scoreSwing ?? args.pointsLost,
    scoreDelta: args.scoreSwing ?? args.pointsLost,
    scoreSwing: Math.abs(args.scoreSwing ?? args.pointsLost),
    phase: 'opening',
    policy: args.category
      ? {
          rank: args.rank ?? 1,
          playedPrior: args.relativePrior ?? 1,
          topPrior: 1,
          relativePrior: args.relativePrior ?? 1,
          category: args.category,
        }
      : undefined,
  };
}

describe('computeGameReport', () => {
  afterEach(() => {
    useGameStore.getState().startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });
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
      rootVisits: 100,
    });

    const thresholds = [12, 6, 3, 1.5, 0.5, 0];
    const report = computeGameReport({ currentNode: root, thresholds });

    expect(report.stats.black.numMoves).toBe(1);
    expect(report.stats.white.numMoves).toBe(1);

    expect(report.stats.black.aiTopMove).toBe(1);
    expect(report.stats.white.aiTopMove).toBe(1);
    expect(report.stats.black.aiTop5Move).toBe(1);
    expect(report.stats.white.aiTop5Move).toBe(1);
    expect(report.stats.black.aiApprovedMove).toBe(1);
    expect(report.stats.white.aiApprovedMove).toBe(1);
    expect(report.stats.black.policyAccuracy).toBe(100);
    expect(report.stats.white.policyAccuracy).toBe(100);
    expect(report.stats.black.policyDistribution).toMatchObject({ aiMove: 1, total: 1 });
    expect(report.stats.white.policyDistribution).toMatchObject({ aiMove: 1, total: 1 });

    // Black points lost: 0 - (-5) = 5 -> bucket for ≥ 3 and < 6.
    // White points lost: -(( -5 ) - ( -6 )) = -1 -> clamped to 0 -> bucket < 0.5.
    expect(report.histogram[2]!.black).toBe(1);
    expect(report.histogram[5]!.white).toBe(1);
    expect(report.moveEntries.find((entry) => entry.moveNumber === 1)?.topCandidate).toMatchObject({
      x: 0,
      y: 0,
      order: 0,
    });
    expect(report.moveEntries.find((entry) => entry.moveNumber === 1)?.policy).toMatchObject({
      rank: 1,
      category: 'aiMove',
      playedPrior: 0.6,
      topPrior: 0.6,
      relativePrior: 1,
    });
    expect(report.moveEntries.find((entry) => entry.moveNumber === 1)).toMatchObject({
      pointsGained: 0,
      scoreBefore: 0,
      scoreAfter: -5,
      scoreDelta: -5,
      scoreSwing: 5,
    });
    const blackTotal = report.histogram.reduce((acc, row) => acc + row.black, 0);
    const whiteTotal = report.histogram.reduce((acc, row) => acc + row.white, 0);
    expect(blackTotal).toBe(1);
    expect(whiteTotal).toBe(1);
  });

  it('supports KaTrain-style depth_filter fractions', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0); // B (depth 1)
    store.playMove(1, 0); // W (depth 2)

    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;
    const n2 = n1.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      rootWinRate: 0.5,
      moves: [{ x: 0, y: 0, winRate: 0.55, scoreLead: 0.0, visits: 100, pointsLost: 0, order: 0, prior: 1.0 }],
    });
    n1.analysis = analysis({ rootScoreLead: -5, rootWinRate: 0.5, rootVisits: 100 });
    n2.analysis = analysis({ rootScoreLead: -6, rootWinRate: 0.5, rootVisits: 100 });

    const thresholds = [12, 6, 3, 1.5, 0.5, 0];
    const boardSquares = 19 * 19;
    const depthFilter: [number, number] = [0.1 / boardSquares, 1.1 / boardSquares]; // ceil -> [1,2), includes only depth 1.
    const report = computeGameReport({ currentNode: root, thresholds, depthFilter });

    expect(report.stats.black.numMoves).toBe(1);
    expect(report.stats.white.numMoves).toBe(0);
    expect(report.stats.black.aiTopMove).toBe(1);

    const blackTotal = report.histogram.reduce((acc, row) => acc + row.black, 0);
    const whiteTotal = report.histogram.reduce((acc, row) => acc + row.white, 0);
    expect(blackTotal).toBe(1);
    expect(whiteTotal).toBe(0);
  });

  it('does not count quick value-only evals as report-grade analysis', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0); // B
    store.playMove(1, 0); // W

    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;
    const n2 = n1.children[0]!;

    root.analysis = analysis({ rootScoreLead: 0, rootWinRate: 0.5 });
    n1.analysis = analysis({ rootScoreLead: -5, rootWinRate: 0.5 });
    n2.analysis = analysis({ rootScoreLead: -6, rootWinRate: 0.5 });

    const report = computeGameReport({ currentNode: root, thresholds: [12, 6, 3, 1.5, 0.5, 0] });

    expect(report.movesInFilter).toBe(2);
    expect(report.stats.black.numMoves).toBe(0);
    expect(report.stats.white.numMoves).toBe(0);
    expect(report.moveEntries).toHaveLength(0);
  });

  it('uses active branch preferences for report line totals', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee];B[ff])(;W[cc];B[bb])(;W[gg];B[hh]))'));
    store.navigateEnd();
    store.switchToBranchIndex(3);

    const state = useGameStore.getState();
    const root = state.rootNode;
    const black = root.children[0]!;
    const whiteBranch = black.children[2]!;
    const blackBranch = whiteBranch.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      rootWinRate: 0.5,
      boardSize: 9,
      moves: [{ x: 3, y: 3, winRate: 0.5, scoreLead: 0, visits: 100, pointsLost: 0, order: 0, prior: 1 }],
    });
    black.analysis = analysis({
      rootScoreLead: -1,
      rootWinRate: 0.5,
      boardSize: 9,
      moves: [{ x: 6, y: 6, winRate: 0.5, scoreLead: -1, visits: 100, pointsLost: 0, order: 0, prior: 1 }],
    });
    whiteBranch.analysis = analysis({
      rootScoreLead: -1,
      rootWinRate: 0.5,
      boardSize: 9,
      moves: [{ x: 7, y: 7, winRate: 0.5, scoreLead: -1, visits: 100, pointsLost: 0, order: 0, prior: 1 }],
    });
    blackBranch.analysis = analysis({
      rootScoreLead: -2,
      rootWinRate: 0.5,
      rootVisits: 100,
      boardSize: 9,
    });

    const report = computeGameReport({
      currentNode: root,
      activeBranchChildIds: state.activeBranchChildIds,
      thresholds: [12, 6, 3, 1.5, 0.5, 0],
    });

    expect(report.movesInFilter).toBe(3);
    expect(report.moveEntries.map((entry) => entry.move)).toEqual(['D6', 'G3', 'H2']);
  });

  it('skips mixed parent MCTS and child quick evals', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0); // B

    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      rootWinRate: 0.5,
      moves: [{ x: 0, y: 0, winRate: 0.55, scoreLead: 0.0, visits: 100, pointsLost: 0, order: 0, prior: 1.0 }],
    });
    n1.analysis = analysis({ rootScoreLead: -5, rootWinRate: 0.5 });

    const report = computeGameReport({ currentNode: root, thresholds: [12, 6, 3, 1.5, 0.5, 0] });

    expect(report.movesInFilter).toBe(1);
    expect(report.stats.black.numMoves).toBe(0);
    expect(report.moveEntries).toHaveLength(0);
  });

  it('matches Kaya report phase cutoffs for 9x9, 13x13, and 19x19', () => {
    expect(getPhaseThresholds(9)).toEqual({ openingEnd: 15, middleEnd: 40 });
    expect(getPhaseThresholds(13)).toEqual({ openingEnd: 30, middleEnd: 80 });
    expect(getPhaseThresholds(19)).toEqual({ openingEnd: 50, middleEnd: 150 });

    expect(getMovePhase(15, 9)).toBe('opening');
    expect(getMovePhase(16, 9)).toBe('middleGame');
    expect(getMovePhase(40, 9)).toBe('middleGame');
    expect(getMovePhase(41, 9)).toBe('endgame');

    expect(getMovePhase(50, 19)).toBe('opening');
    expect(getMovePhase(51, 19)).toBe('middleGame');
    expect(getMovePhase(150, 19)).toBe('middleGame');
    expect(getMovePhase(151, 19)).toBe('endgame');
  });

  it('maps point loss values to labeled report buckets', () => {
    const thresholds = [12, 6, 3, 1.5, 0.5, 0];
    expect(getPointLossBucket(13, thresholds)).toBe(0);
    expect(getPointLossBucket(6, thresholds)).toBe(1);
    expect(getPointLossBucket(5.9, thresholds)).toBe(2);
    expect(getPointLossBucket(0.4, thresholds)).toBe(5);
    expect(getPointLossBucket(-2, thresholds)).toBe(5);
  });

  it('classifies policy quality using the better of rank and relative probability', () => {
    expect(classifyMoveByRankAndPolicy(1, 0.2)).toBe('aiMove');
    expect(classifyMoveByRankAndPolicy(5, 0.55)).toBe('good');
    expect(classifyMoveByRankAndPolicy(12, 0.15)).toBe('inaccuracy');
    expect(classifyMoveByRankAndPolicy(21, 0.03)).toBe('mistake');
    expect(classifyMoveByRankAndPolicy(0, 0)).toBe('blunder');
  });

  it('adds policy rank and relative-prior cues to report entries', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(15, 3); // B Q16

    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      rootWinRate: 0.5,
      moves: [
        { x: 3, y: 15, winRate: 0.55, scoreLead: 1, visits: 100, pointsLost: 0, order: 0, prior: 0.4 },
        { x: 10, y: 10, winRate: 0.54, scoreLead: 0.4, visits: 80, pointsLost: 0.2, order: 1, prior: 0.3 },
        { x: 11, y: 10, winRate: 0.53, scoreLead: 0.2, visits: 70, pointsLost: 0.4, order: 2, prior: 0.26 },
        { x: 12, y: 10, winRate: 0.52, scoreLead: 0.1, visits: 60, pointsLost: 0.5, order: 3, prior: 0.24 },
        { x: 15, y: 3, winRate: 0.51, scoreLead: -2.4, visits: 50, pointsLost: 2.4, order: 4, prior: 0.22 },
      ],
    });
    n1.analysis = analysis({
      rootScoreLead: -2.4,
      rootWinRate: 0.5,
      rootVisits: 100,
    });

    const report = computeGameReport({ currentNode: root, thresholds: [12, 6, 3, 1.5, 0.5, 0] });
    expect(report.moveEntries[0]).toMatchObject({
      move: 'Q16',
      topMove: 'D4',
      policy: {
        rank: 5,
        category: 'good',
        playedPrior: 0.22,
        topPrior: 0.4,
      },
    });
    expect(report.moveEntries[0]?.policy?.relativePrior).toBeCloseTo(0.55);
    expect(report.stats.black.policyAccuracy).toBe(80);
    expect(report.stats.black.aiTop5Move).toBe(1);
    expect(report.stats.black.aiApprovedMove).toBe(0);
    expect(report.stats.black.policyDistribution).toMatchObject({
      good: 1,
      total: 1,
    });
  });

  it('can sort report entries by loss or Kaya-style policy severity', () => {
    const entries = [
      reportEntry({ moveNumber: 1, pointsLost: 10, category: 'good', relativePrior: 0.55, rank: 3 }),
      reportEntry({ moveNumber: 2, pointsLost: 2, category: 'blunder', relativePrior: 0, rank: 0 }),
      reportEntry({ moveNumber: 3, pointsLost: 3, category: 'mistake', relativePrior: 0.03, rank: 21 }),
      reportEntry({ moveNumber: 4, pointsLost: 20 }),
      reportEntry({ moveNumber: 5, pointsLost: 1, category: 'mistake', relativePrior: 0.01, rank: 18 }),
    ];

    expect(sortMoveReportEntries(entries, 'loss').map((entry) => entry.moveNumber)).toEqual([4, 1, 3, 2, 5]);
    expect(sortMoveReportEntries(entries, 'policy').map((entry) => entry.moveNumber)).toEqual([2, 5, 3, 1, 4]);
    expect(entries.map((entry) => entry.moveNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('finds critical score swings by magnitude', () => {
    const entries = [
      reportEntry({ moveNumber: 1, pointsLost: 1, scoreSwing: 4.9 }),
      reportEntry({ moveNumber: 2, pointsLost: 2, scoreSwing: 7 }),
      reportEntry({ moveNumber: 3, pointsLost: 3, scoreSwing: -9 }),
      reportEntry({ moveNumber: 4, pointsLost: 4, scoreSwing: 7 }),
    ];

    expect(getReportTurningPoints(entries, 5, 3).map((entry) => entry.moveNumber)).toEqual([3, 2, 4]);
  });

  it('finds point-gaining recovery moves by gain', () => {
    const entries = [
      reportEntry({ moveNumber: 1, pointsLost: 0, pointsGained: 1.4 }),
      reportEntry({ moveNumber: 2, pointsLost: 0, pointsGained: 3 }),
      reportEntry({ moveNumber: 3, pointsLost: 0, pointsGained: 2 }),
      reportEntry({ moveNumber: 4, pointsLost: 0, pointsGained: 3 }),
    ];

    expect(getReportRecoveries(entries, 1.5, 3).map((entry) => entry.moveNumber)).toEqual([2, 4, 3]);
  });

  it('filters report totals and top mistakes by phase', () => {
    buildAnalyzedPassGame(9, 42);

    const root = useGameStore.getState().rootNode;
    const thresholds = [12, 6, 3, 1.5, 0.5, 0];
    const all = computeGameReport({ currentNode: root, thresholds, phaseFilter: 'all' });
    const opening = computeGameReport({ currentNode: root, thresholds, phaseFilter: 'opening' });
    const middle = computeGameReport({ currentNode: root, thresholds, phaseFilter: 'middleGame' });
    const endgame = computeGameReport({ currentNode: root, thresholds, phaseFilter: 'endgame' });

    expect(all.movesInFilter).toBe(42);
    expect(opening.movesInFilter + middle.movesInFilter + endgame.movesInFilter).toBe(all.movesInFilter);
    expect(opening.moveEntries.map((entry) => entry.moveNumber)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(middle.moveEntries[0]?.moveNumber).toBe(16);
    expect(middle.moveEntries.at(-1)?.moveNumber).toBe(40);
    expect(endgame.moveEntries.map((entry) => entry.moveNumber)).toEqual([41, 42]);

    const middleMistakes = [...middle.moveEntries].sort((a, b) => b.pointsLost - a.pointsLost);
    expect(middleMistakes.slice(0, 3).map((entry) => entry.moveNumber)).toEqual([40, 39, 38]);
  });
});

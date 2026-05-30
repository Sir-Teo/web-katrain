import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { computeGameReport, getMovePhase, getPhaseThresholds, getPointLossBucket } from '../src/utils/gameReport';
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

    // Black points lost: 0 - (-5) = 5 -> bucket for ≥ 3 and < 6.
    // White points lost: -(( -5 ) - ( -6 )) = -1 -> clamped to 0 -> bucket < 0.5.
    expect(report.histogram[2]!.black).toBe(1);
    expect(report.histogram[5]!.white).toBe(1);
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

  it('computes phase buckets from board area for 9x9, 13x13, and 19x19', () => {
    expect(getPhaseThresholds(9)).toEqual({ openingEnd: 13, middleEnd: 41 });
    expect(getPhaseThresholds(13)).toEqual({ openingEnd: 27, middleEnd: 85 });
    expect(getPhaseThresholds(19)).toEqual({ openingEnd: 58, middleEnd: 181 });

    expect(getMovePhase(13, 9)).toBe('opening');
    expect(getMovePhase(14, 9)).toBe('middleGame');
    expect(getMovePhase(41, 9)).toBe('middleGame');
    expect(getMovePhase(42, 9)).toBe('endgame');

    expect(getMovePhase(58, 19)).toBe('opening');
    expect(getMovePhase(59, 19)).toBe('middleGame');
    expect(getMovePhase(181, 19)).toBe('middleGame');
    expect(getMovePhase(182, 19)).toBe('endgame');
  });

  it('maps point loss values to labeled report buckets', () => {
    const thresholds = [12, 6, 3, 1.5, 0.5, 0];
    expect(getPointLossBucket(13, thresholds)).toBe(0);
    expect(getPointLossBucket(6, thresholds)).toBe(1);
    expect(getPointLossBucket(5.9, thresholds)).toBe(2);
    expect(getPointLossBucket(0.4, thresholds)).toBe(5);
    expect(getPointLossBucket(-2, thresholds)).toBe(5);
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
    expect(opening.moveEntries.map((entry) => entry.moveNumber)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(middle.moveEntries[0]?.moveNumber).toBe(14);
    expect(middle.moveEntries.at(-1)?.moveNumber).toBe(41);
    expect(endgame.moveEntries.map((entry) => entry.moveNumber)).toEqual([42]);

    const middleMistakes = [...middle.moveEntries].sort((a, b) => b.pointsLost - a.pointsLost);
    expect(middleMistakes.slice(0, 3).map((entry) => entry.moveNumber)).toEqual([41, 40, 39]);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { selectFullGameAnalysisNodes, useGameStore } from '../src/store/gameStore';
import type { AnalysisResult, CandidateMove } from '../src/types';

const EMPTY_TERRITORY: number[][] = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));

function analysis(args: { rootScoreLead: number; moves?: CandidateMove[] }): AnalysisResult {
  return {
    rootWinRate: 0.5,
    rootScoreLead: args.rootScoreLead,
    moves: args.moves ?? [],
    territory: EMPTY_TERRITORY,
    ownershipMode: 'none',
  };
}

describe('selectFullGameAnalysisNodes', () => {
  afterEach(() => {
    useGameStore.getState().resetGame();
  });

  it('includes the parent needed to report the first move in a requested range', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0); // move index 0
    store.playMove(1, 0); // move index 1
    store.playMove(2, 0); // move index 2
    store.playMove(3, 0); // move index 3

    const root = useGameStore.getState().rootNode;
    const nodes = selectFullGameAnalysisNodes({
      rootNode: root,
      moveRange: [2, 2],
      mistakesOnly: false,
      mistakesThreshold: 3,
    });

    expect(nodes.map((node) => node.gameState.moveHistory.length)).toEqual([2, 3]);
  });

  it('includes the root when the range starts at the first move', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0);
    store.playMove(1, 0);

    const root = useGameStore.getState().rootNode;
    const nodes = selectFullGameAnalysisNodes({
      rootNode: root,
      moveRange: [0, 0],
      mistakesOnly: false,
      mistakesThreshold: 3,
    });

    expect(nodes.map((node) => node.gameState.moveHistory.length)).toEqual([0, 1]);
  });

  it('keeps parents of mistakes for mistakes-only analysis', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0); // B
    store.playMove(1, 0); // W

    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;
    const n2 = n1.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      moves: [{ x: 0, y: 0, winRate: 0.5, scoreLead: 0, visits: 100, pointsLost: 0, order: 0 }],
    });
    n1.analysis = analysis({
      rootScoreLead: -5,
      moves: [{ x: 1, y: 0, winRate: 0.5, scoreLead: -5, visits: 100, pointsLost: 0, order: 0 }],
    });
    n2.analysis = analysis({ rootScoreLead: -10 });

    const nodes = selectFullGameAnalysisNodes({
      rootNode: root,
      moveRange: null,
      mistakesOnly: true,
      mistakesThreshold: 3,
    });

    expect(nodes.map((node) => node.gameState.moveHistory.length)).toEqual([0, 1]);
  });
});

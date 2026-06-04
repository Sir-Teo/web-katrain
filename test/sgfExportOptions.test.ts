import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { generateSgfFromTree } from '../src/utils/sgf';
import type { AnalysisResult, CandidateMove, GameNode } from '../src/types';

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

describe('SGF export trainer options', () => {
  afterEach(() => {
    useGameStore.getState().resetGame();
  });

  it('preserves komi precision on export', () => {
    const store = useGameStore.getState();
    store.startNewGame({ komi: 6.25, rules: 'japanese', boardSize: 19, handicap: 0 });

    const sgf = generateSgfFromTree(useGameStore.getState().rootNode);

    expect(sgf).toContain('KM[6.25]');
    expect(sgf).not.toContain('KM[6.3]');
  });

  it('respects KaTrain trainer/save_analysis (KT blobs)', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(3, 3); // B
    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;

    root.analysis = analysis({ rootScoreLead: 0, rootWinRate: 0.5 });
    n1.analysis = analysis({ rootScoreLead: -1, rootWinRate: 0.5 });

    const sgfNo = generateSgfFromTree(root, {
      trainer: {
        saveAnalysis: false,
        saveMarks: false,
        evalThresholds: [12, 6, 3, 1.5, 0.5, 0],
        saveFeedback: [true, true, true, true, false, false],
        saveCommentsPlayer: { black: true, white: true },
      },
    });
    expect(sgfNo).not.toContain('KT[');

    const sgfYes = generateSgfFromTree(root, {
      trainer: {
        saveAnalysis: true,
        saveMarks: false,
        evalThresholds: [12, 6, 3, 1.5, 0.5, 0],
        saveFeedback: [true, true, true, true, false, false],
        saveCommentsPlayer: { black: true, white: true },
      },
    });
    expect(sgfYes).toContain('KT[');
  });

  it('saves portable analysis blobs by default', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(3, 3); // B
    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      rootWinRate: 0.5,
      moves: [
        { x: 15, y: 15, winRate: 0.55, scoreLead: 1.2, visits: 100, pointsLost: 0, order: 0, prior: 0.42 },
      ],
    });
    n1.analysis = analysis({ rootScoreLead: -1, rootWinRate: 0.5 });

    const sgf = generateSgfFromTree(root);

    expect(sgf).toContain('KA[');
    expect(sgf).toContain('KT[');
    expect(sgf).toContain('"m":"Q4"');
  });

  it('flattens empty no-move container nodes instead of exporting empty variations', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0);
    store.playMove(1, 1);
    store.navigateToMove(1);
    store.playMove(2, 2);

    const root = useGameStore.getState().rootNode;
    const firstMove = root.children[0]!;
    const branchChildren = [...firstMove.children];
    const emptyContainer: GameNode = {
      id: 'empty-container',
      parent: firstMove,
      children: branchChildren,
      move: null,
      gameState: {
        ...firstMove.gameState,
        board: firstMove.gameState.board.map((row) => [...row]),
        moveHistory: [...firstMove.gameState.moveHistory],
      },
      analysis: null,
      note: '',
      properties: {},
    };
    for (const child of branchChildren) child.parent = emptyContainer;
    firstMove.children = [emptyContainer];

    const sgf = generateSgfFromTree(root, {
      trainer: {
        saveAnalysis: false,
        saveMarks: false,
      },
    });

    expect(sgf).toContain(';B[aa](;W[bb])(;W[cc])');
    expect(sgf).not.toContain('()');
  });

  it('adds KaTrain-style SGF marks (MA/SQ) when save_marks is enabled', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(0, 0); // B
    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;

    root.analysis = analysis({
      rootScoreLead: 0,
      rootWinRate: 0.5,
      moves: [
        { x: 0, y: 0, winRate: 0.55, scoreLead: 1.2, visits: 100, pointsLost: 0, order: 0 },
        { x: 1, y: 0, winRate: 0.54, scoreLead: 1.1, visits: 60, pointsLost: 0.3, order: 1 },
      ],
    });
    n1.analysis = analysis({ rootScoreLead: -5, rootWinRate: 0.5 });

    const sgf = generateSgfFromTree(root, {
      trainer: {
        saveAnalysis: false,
        saveMarks: true,
        evalThresholds: [12, 6, 3, 1.5, 0.5, 0],
        saveFeedback: [true, true, true, true, false, false],
        saveCommentsPlayer: { black: true, white: true },
      },
    });

    expect(sgf).toContain('MA[aa]');
    expect(sgf).toContain('SQ[ba]');
  });

  it('groups multi-value SGF properties under one property identifier', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.applySetupStones([
      { x: 0, y: 0, player: 'black' },
      { x: 18, y: 18, player: 'black' },
      { x: 8, y: 8, player: 'white' },
    ]);
    store.playMove(3, 3);

    const root = useGameStore.getState().rootNode;
    const firstMove = root.children[0]!;
    firstMove.properties = {
      ...firstMove.properties,
      LB: ['cc:A', 'dc:1'],
      TR: ['aa', 'bb'],
    };

    const sgf = generateSgfFromTree(root);

    expect(sgf).toContain('AB[aa][ss]');
    expect(sgf).toContain('AW[ii]');
    expect(sgf).toContain('LB[cc:A][dc:1]');
    expect(sgf).toContain('TR[aa][bb]');
    expect(sgf.match(/AB\[/g)).toHaveLength(1);
    expect(sgf.match(/AW\[/g)).toHaveLength(1);
    expect(sgf.match(/LB\[/g)).toHaveLength(1);
    expect(sgf.match(/TR\[/g)).toHaveLength(1);
  });

  it('uses save_feedback and notes to decide whether to include auto-comments', () => {
    const store = useGameStore.getState();
    store.resetGame();

    store.playMove(3, 3); // B
    const root = useGameStore.getState().rootNode;
    const n1 = root.children[0]!;

    root.analysis = analysis({ rootScoreLead: 0, rootWinRate: 0.5 });
    n1.analysis = analysis({ rootScoreLead: -5, rootWinRate: 0.5 });

    const sgfNo = generateSgfFromTree(root, {
      trainer: {
        saveAnalysis: false,
        saveMarks: false,
        evalThresholds: [12, 6, 3, 1.5, 0.5, 0],
        saveFeedback: [false, false, false, false, false, false],
        saveCommentsPlayer: { black: true, white: true },
      },
    });
    expect(sgfNo).not.toContain('Move 1:');

    n1.note = 'User note';
    const sgfWithNote = generateSgfFromTree(root, {
      trainer: {
        saveAnalysis: false,
        saveMarks: false,
        evalThresholds: [12, 6, 3, 1.5, 0.5, 0],
        saveFeedback: [false, false, false, false, false, false],
        saveCommentsPlayer: { black: true, white: true },
      },
    });
    expect(sgfWithNote).toContain('User note');
    expect(sgfWithNote).toContain('Move 1:');
  });
});

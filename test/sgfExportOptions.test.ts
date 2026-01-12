import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { generateSgfFromTree } from '../src/utils/sgf';
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

describe('SGF export trainer options', () => {
  afterEach(() => {
    useGameStore.getState().resetGame();
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

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AnalysisResult, GameNode } from '../src/types';

// ScoreWinrateGraph pulls everything from useGameStore. Under SSR, real
// zustand v5 stores always serve their *initial* snapshot, so mock the store
// module with a controllable slice instead.
const storeState: Record<string, unknown> = {};

vi.mock('../src/store/gameStore', () => ({
  useGameStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
}));

const { ScoreWinrateGraph } = await import('../src/components/ScoreWinrateGraph');

const makeAnalysis = (winRate: number, scoreLead: number): AnalysisResult => ({
  rootWinRate: winRate,
  rootScoreLead: scoreLead,
  moves: [],
  territory: [],
});

const baseState = () => ({
  board: Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null)),
  currentPlayer: 'black' as const,
  capturedBlack: 0,
  capturedWhite: 0,
  komi: 6.5,
});

// Line: root -> B(3,3) -> [setup node adding a white stone] -> B(9,9).
// The setup node occupies a graph position but adds no played move, so the
// last node's played-move number is 2 even though its line position is 3.
const buildTree = () => {
  const root: GameNode = {
    id: 'r',
    parent: null,
    children: [],
    move: null,
    gameState: { ...baseState(), moveHistory: [] },
    properties: { AB: ['pd'] },
  };
  const firstMoveState = { ...baseState(), moveHistory: [{ x: 3, y: 3, player: 'black' as const }] };
  const m1: GameNode = {
    id: 'm1',
    parent: root,
    children: [],
    move: { x: 3, y: 3, player: 'black' },
    gameState: firstMoveState,
    analysis: makeAnalysis(0.55, 1.5),
  };
  const setup: GameNode = {
    id: 'setup',
    parent: m1,
    children: [],
    move: null,
    gameState: { ...firstMoveState },
    properties: { AW: ['pp'] },
    analysis: makeAnalysis(0.5, 0),
  };
  const m2: GameNode = {
    id: 'm2',
    parent: setup,
    children: [],
    move: { x: 9, y: 9, player: 'black' },
    gameState: {
      ...baseState(),
      moveHistory: [
        { x: 3, y: 3, player: 'black' },
        { x: 9, y: 9, player: 'black' },
      ],
    },
    analysis: makeAnalysis(0.2, -4.5),
  };
  root.children.push(m1);
  m1.children.push(setup);
  setup.children.push(m2);
  return { root, m2 };
};

describe('ScoreWinrateGraph move labels', () => {
  it('labels positions by played moves instead of raw line position', () => {
    const { root, m2 } = buildTree();
    storeState.currentNode = m2;
    storeState.rootNode = root;
    storeState.activeBranchChildIds = {};
    storeState.treeVersion = 1;
    storeState.gameAnalysisDone = 0;
    storeState.gameAnalysisTotal = 0;
    storeState.isGameAnalysisRunning = false;
    storeState.settings = {
      trainerTheme: undefined,
      uiTheme: undefined,
      trainerEvalThresholds: undefined,
      trainerShowDots: undefined,
    };
    storeState.jumpToNode = () => undefined;
    storeState.startFastGameAnalysis = () => undefined;

    const html = renderToStaticMarkup(<ScoreWinrateGraph showScore showWinrate />);

    // The current node sits at line position 3 but is only the 2nd played move.
    expect(html).toContain('aria-valuetext="Move 2"');
    expect(html).not.toContain('"Move 3');
    // Quality markers carry the same numbering.
    expect(html).toContain('>Move 2: Loss 4.5<');
    expect(html).not.toContain('Move 3:');
  });
});

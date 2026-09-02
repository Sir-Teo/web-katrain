import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';

/**
 * Black at (0,0) has one liberty at (1,0); Black plays it. The two-stone
 * group has no liberties: a multi-stone suicide, legal under New Zealand and
 * Tromp-Taylor rules, and both stones come off as White's prisoners.
 */
const SUICIDE_SGF = '(;GM[1]SZ[9]RU[NZ]AB[aa]AW[ca][ab][bb];B[ba];W[ee])';

describe('legal suicide survives a load and a rebuild', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('keeps the suicide move and the moves after it when loading under New Zealand rules', () => {
    useGameStore.getState().updateSettings({ gameRules: 'new-zealand' });
    useGameStore.getState().loadGame(parseSgf(SUICIDE_SGF));
    const state = useGameStore.getState();
    const root = state.rootNode;
    expect(root.children.length).toBe(1);
    const suicide = root.children[0]!;
    expect(suicide.move).toEqual({ x: 1, y: 0, player: 'black' });
    expect(suicide.gameState.board[0]![0]).toBe(null);
    expect(suicide.gameState.board[0]![1]).toBe(null);
    expect(suicide.gameState.capturedBlack).toBe(2);
    expect(suicide.children.length).toBe(1);
  });

  it('still drops the move under Japanese rules, where suicide is illegal', () => {
    useGameStore.getState().updateSettings({ gameRules: 'japanese' });
    useGameStore.getState().loadGame(parseSgf(SUICIDE_SGF.replace('RU[NZ]', 'RU[Japanese]')));
    expect(useGameStore.getState().rootNode.children.length).toBe(0);
  });
});

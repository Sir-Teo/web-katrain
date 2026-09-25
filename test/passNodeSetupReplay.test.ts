import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';

const s = () => useGameStore.getState();

beforeEach(() => {
  s().resetGame();
});

describe('setup stones on a pass node', () => {
  it('survive a rebuild of the line below an edited ancestor', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[aa];W[]AB[ee];B[cc])'));
    expect(s().rootNode.children[0]!.children[0]!.gameState.board[4]![4]).toBe('black');

    // An unrelated setup edit on the root replays every descendant.
    s().navigateStart();
    s().setEditTool('setup-white');
    s().applyEditTool(8, 8);

    const pass = s().rootNode.children[0]!.children[0]!;
    expect(pass.move).toMatchObject({ x: -1, y: -1 });
    expect(pass.gameState.board[4]![4]).toBe('black');
    expect(pass.children[0]!.gameState.board[4]![4]).toBe('black');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';

const s = () => useGameStore.getState();

beforeEach(() => {
  s().resetGame();
});

describe('changing the handicap of a game with moves', () => {
  it('says how many moves the new stones removed, and undo brings them back', () => {
    s().loadGame(parseSgf('(;GM[1]FF[4]SZ[9];B[gc];W[cc];B[gg];W[cg])'));
    s().navigateEnd();

    s().setHandicap(2);
    expect(s().rootNode.children).toHaveLength(0);
    expect(s().notification).toMatchObject({ undoable: true });
    expect(s().notification?.message).toContain('4 nodes');

    s().undoEdit();
    expect(s().rootNode.children).toHaveLength(1);
  });

  it('says nothing extra when every move still fits', () => {
    s().loadGame(parseSgf('(;GM[1]FF[4]SZ[9];B[ee];W[dd])'));
    const before = s().notification;
    s().setHandicap(2);
    expect(s().rootNode.children).toHaveLength(1);
    expect(s().notification).toBe(before);
  });
});

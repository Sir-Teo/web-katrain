import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';

const s = () => useGameStore.getState();

beforeEach(() => {
  s().resetGame();
  useGameStore.setState({ isAnalysisMode: false, isTeachMode: false });
});

describe('insert mode', () => {
  it('carries the comment and markup of each move it copies', () => {
    s().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee]C[key idea]TR[aa];B[ff])'));
    s().navigateToMove(1);
    const anchor = s().currentNode;
    s().toggleInsertMode();
    s().playMove(0, 8);
    s().playMove(1, 8);
    s().toggleInsertMode();

    const inserted = anchor.children.at(-1)!;
    const copied = inserted.children[0]!.children[0]!;
    expect(copied.move).toMatchObject({ x: 4, y: 4, player: 'white' });
    expect(copied.note).toBe('key idea');
    expect(copied.properties?.TR).toEqual(['aa']);
    expect(copied.children[0]!.move).toMatchObject({ x: 5, y: 5, player: 'black' });
  });
});

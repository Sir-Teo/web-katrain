import { describe, expect, it } from 'vitest';
import { boardToQaString, countBoardStones } from '../src/utils/boardQaSnapshot';
import type { BoardState } from '../src/types';

describe('board QA snapshot helpers', () => {
  it('serializes board state into a compact row-major string', () => {
    const board: BoardState = [
      ['black', null, 'white'],
      [null, 'black', null],
      ['white', null, null],
    ];

    expect(boardToQaString(board)).toBe('B.W.B.W..');
    expect(countBoardStones(board)).toBe(4);
  });
});


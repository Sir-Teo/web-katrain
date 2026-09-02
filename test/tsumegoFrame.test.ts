import { describe, expect, it } from 'vitest';
import { buildTsumegoFrame, canFrameAsTsumego } from '../src/utils/tsumegoFrame';
import type { BoardState, Player } from '../src/types';

const SIZE = 19;

const emptyBoard = (): BoardState =>
  Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null as Player | null));

const withStones = (stones: Array<[number, number, 'b' | 'w']>): BoardState => {
  const board = emptyBoard();
  for (const [row, col, colour] of stones) board[row]![col] = colour === 'b' ? 'black' : 'white';
  return board;
};

/**
 * `.` empty, `b`/`w` the original problem, `X`/`O` stones the frame adds.
 * Expected diagrams below are the output of KaTrain's own
 * `core/tsumego_frame.py` on the same positions.
 */
const render = (board: BoardState, frame: ReturnType<typeof buildTsumegoFrame>): string[] => {
  const grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => '.'));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cell = board[y]![x];
      if (cell) grid[y]![x] = cell === 'black' ? 'b' : 'w';
    }
  }
  for (const point of frame.black) grid[point.y]![point.x] = 'X';
  for (const point of frame.white) grid[point.y]![point.x] = 'O';
  return grid.map((row) => row.join(''));
};

// A 3x3 corner problem: White is trying to live in the top-left.
const CORNER_PROBLEM: Array<[number, number, 'b' | 'w']> = [
  [0, 2, 'b'], [1, 2, 'b'], [2, 0, 'b'], [2, 1, 'b'], [2, 2, 'b'],
  [0, 1, 'w'], [1, 0, 'w'], [1, 1, 'w'],
];

const CORNER_EXPECTED = [
  '.wb...XX.X.X.X.X.O.',
  'wwb...X.X.X.X.X.XOO',
  'bbb...XX.X.X.X.X.OX',
  '......X.X.X.X.X.X.X',
  '......XX.X.X.X.X...',
  '......X.X.X.X.X.X..',
  'XXXXXXXX.X.X.X.X.X.',
  'X.X.X.X.X.X.X.X.X.X',
  '.X.X.X.X.X.X.X.XXXX',
  'XXXXXXXXXXXXXXXXOOO',
  'OOOOOOOOOOOOOOOO.O.',
  'O.O.O.O.O.O.O.O.O.O',
  '.O.O.O.O.O.O.O.O.O.',
  'O.O.O.O.O.O.O.O.O.O',
  '.O.O.O.O.O.O.O.O.O.',
  'O.O.O.O.O.O.O.O.O.O',
  '.O.O.O.O.O.O.O.O.O.',
  'O.O.O.O.O.O.O.O.O.O',
  '.O.O.O.O.O.O.O.O.O.',
];

// A side problem: White is trying to live against the left edge.
const SIDE_PROBLEM: Array<[number, number, 'b' | 'w']> = [
  [9, 0, 'b'], [9, 1, 'b'], [9, 2, 'b'], [10, 2, 'b'], [11, 2, 'b'], [11, 1, 'b'], [11, 0, 'b'],
  [10, 0, 'w'], [10, 1, 'w'],
];

const SIDE_EXPECTED = [
  '.OXX...XXO.O.O.O.O.',
  'OOO...X.XOO.O.O.O.O',
  '.X.X.X.XXO.O.O.O.O.',
  'X.X.X.X.XXO.O.O.O.O',
  '.X.X.X.X.XOO.O.O.O.',
  'X.X.X.X.XXO.O.O.O.O',
  '.X.X.X.X.XOO.O.O.O.',
  'XXXXX.X.XXO.O.O.O.O',
  '....XX.X.XOO.O.O.O.',
  'bbb.X.X.XXO.O.O.O.O',
  'wwb.XX.X.XOO.O.O.O.',
  'bbb.X.X.XXO.O.O.O.O',
  '....XX.X.XOO.O.O.O.',
  'XXXXX.X.XXO.O.O.O.O',
  '.X.X.X.X.XOO.O.O.O.',
  'X.X.X.X.XXO.O.O.O.O',
  '.X.X.X.X.XOO.O.O.O.',
  'X.X.X.X.XXO.O.O.O.O',
  '.X.X.X.X.XOO.O.O.O.',
];

describe('buildTsumegoFrame', () => {
  it('frames a corner problem exactly as KaTrain does', () => {
    const board = withStones(CORNER_PROBLEM);
    const frame = buildTsumegoFrame(board, { komi: 6.5, blackToPlay: true, koAllowed: false, margin: 4 });
    expect(render(board, frame)).toEqual(CORNER_EXPECTED);
    expect(frame.region).toEqual({ xMin: 0, xMax: 6, yMin: 0, yMax: 6 });
  });

  it('frames a side problem exactly as KaTrain does', () => {
    const board = withStones(SIDE_PROBLEM);
    const frame = buildTsumegoFrame(board, { komi: 7.5, blackToPlay: true, koAllowed: false, margin: 2 });
    expect(render(board, frame)).toEqual(SIDE_EXPECTED);
    expect(frame.region).toEqual({ xMin: 0, xMax: 4, yMin: 7, yMax: 13 });
  });

  it('never touches the problem it is framing', () => {
    const board = withStones(CORNER_PROBLEM);
    const frame = buildTsumegoFrame(board, { komi: 6.5, blackToPlay: true, koAllowed: false, margin: 4 });
    const problem = new Set(CORNER_PROBLEM.map(([row, col]) => `${col},${row}`));
    for (const point of [...frame.black, ...frame.white]) {
      expect(problem.has(`${point.x},${point.y}`)).toBe(false);
    }
  });

  it('places a different ko threat when ko is allowed', () => {
    const board = withStones(CORNER_PROBLEM);
    const without = buildTsumegoFrame(board, { komi: 6.5, blackToPlay: true, koAllowed: false, margin: 4 });
    const withKo = buildTsumegoFrame(board, { komi: 6.5, blackToPlay: true, koAllowed: true, margin: 4 });
    expect(render(board, withKo)).not.toEqual(render(board, without));
  });

  it('widens the walled-off area with the wall distance', () => {
    const board = withStones(CORNER_PROBLEM);
    const near = buildTsumegoFrame(board, { komi: 6.5, blackToPlay: true, koAllowed: false, margin: 2 });
    const far = buildTsumegoFrame(board, { komi: 6.5, blackToPlay: true, koAllowed: false, margin: 6 });
    expect(near.region!.xMax).toBeLessThan(far.region!.xMax);
    expect(near.region!.yMax).toBeLessThan(far.region!.yMax);
  });

  it('has nothing to do on an empty board', () => {
    const board = emptyBoard();
    expect(canFrameAsTsumego(board)).toBe(false);
    expect(buildTsumegoFrame(board, { komi: 6.5, blackToPlay: true, koAllowed: false, margin: 4 })).toEqual({
      black: [],
      white: [],
      region: null,
    });
  });

  it('recognises a position worth framing', () => {
    expect(canFrameAsTsumego(withStones(CORNER_PROBLEM))).toBe(true);
  });
});

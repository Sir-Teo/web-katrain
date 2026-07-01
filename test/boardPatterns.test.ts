import { describe, expect, it } from 'vitest';
import {
  CONTACT_MOVE_PATTERNS,
  FUSEKI_PATTERNS,
  NAMED_SHAPE_PATTERNS,
} from '../src/data/boardPatternLibrary';
import { findBoardPattern } from '../src/utils/boardPatterns';
import { getMoveInsight } from '../src/utils/moveInsight';
import type { BoardState, Move, Player } from '../src/types';

const emptyBoard = (size: number): BoardState =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

const place = (board: BoardState, stones: Array<[number, number, Player]>): BoardState => {
  const next = board.map((row) => [...row]);
  for (const [x, y, player] of stones) next[y][x] = player;
  return next;
};

const move = (x: number, y: number, player: Player = 'black'): Move => ({ x, y, player });

describe('findBoardPattern', () => {
  it('recognizes the low Chinese opening as it is completed', () => {
    // Black: 4-4 (3,3) and 3-4 (16,3) corners, completing with the low wedge at (10,2).
    // White: two corner replies far away.
    const board = place(emptyBoard(19), [
      [3, 3, 'black'],
      [16, 3, 'black'],
      [15, 16, 'white'],
      [3, 15, 'white'],
    ]);

    const match = findBoardPattern(move(10, 2), board, FUSEKI_PATTERNS);
    expect(match?.pattern.name).toBe('Low Chinese Opening');
    expect(match?.pattern.url).toContain('senseis.xmp.net');
  });

  it('recognizes fusekis under rotation, mirroring, and color inversion', () => {
    // Same low Chinese, played by White, mirrored to the right edge (x -> 18 - x maps
    // anchors to column-flipped positions).
    const board = place(emptyBoard(19), [
      [15, 3, 'white'],
      [2, 3, 'white'],
      [3, 16, 'black'],
      [15, 15, 'black'],
    ]);

    const match = findBoardPattern(move(8, 2, 'white'), board, FUSEKI_PATTERNS);
    expect(match?.pattern.name).toBe('Low Chinese Opening');
  });

  it('does not match a fuseki when extra stones break the whole-board spec', () => {
    const board = place(emptyBoard(19), [
      [3, 3, 'black'],
      [16, 3, 'black'],
      [15, 16, 'white'],
      [3, 15, 'white'],
      [8, 2, 'white'], // stone inside the region the pattern requires empty
    ]);

    const match = findBoardPattern(move(10, 2), board, FUSEKI_PATTERNS);
    expect(match).toBeNull();
  });

  it('recognizes the 3-3 invasion under a 4-4 stone on any corner', () => {
    const board = place(emptyBoard(19), [
      [3, 3, 'black'],
      [15, 3, 'black'],
      [3, 15, 'black'],
      [15, 15, 'white'],
    ]);

    const match = findBoardPattern(move(16, 16, 'black'), board, FUSEKI_PATTERNS);
    expect(match?.pattern.name).toBe('3-3 Point Invasion');
  });

  it('recognizes the table shape', () => {
    // Table shape relative spec: stones at (0,0), (0,1), (2,0), (2,2) with the
    // inner points empty. Place three stones and complete with the fourth.
    const board = place(emptyBoard(19), [
      [9, 9, 'black'],
      [9, 10, 'black'],
      [11, 9, 'black'],
    ]);

    const match = findBoardPattern(move(11, 11), board, NAMED_SHAPE_PATTERNS);
    expect(match?.pattern.name).toBe('Table Shape');
  });

  it('recognizes a stretch from a friendly stone', () => {
    const board = place(emptyBoard(19), [[9, 9, 'black']]);

    const match = findBoardPattern(move(9, 10), board, CONTACT_MOVE_PATTERNS);
    expect(match?.pattern.name).toBe('Stretch');
  });

  it('returns null for occupied target points', () => {
    const board = place(emptyBoard(19), [[9, 9, 'black']]);
    expect(findBoardPattern(move(9, 9), board, CONTACT_MOVE_PATTERNS)).toBeNull();
  });
});

describe('getMoveInsight pattern integration', () => {
  it('labels a completed low Chinese opening instead of a generic side move', () => {
    const board = place(emptyBoard(19), [
      [3, 3, 'black'],
      [16, 3, 'black'],
      [15, 16, 'white'],
      [3, 15, 'white'],
    ]);

    const insight = getMoveInsight(move(10, 2), 19, board);
    expect(insight?.label).toBe('Low Chinese Opening');
    expect(insight?.learnMoreUrl).toContain('senseis.xmp.net');
  });

  it('labels the 3-3 invasion instead of a shoulder hit', () => {
    const board = place(emptyBoard(19), [
      [3, 3, 'black'],
      [15, 3, 'black'],
      [3, 15, 'black'],
      [15, 15, 'white'],
    ]);

    const insight = getMoveInsight(move(16, 16, 'black'), 19, board);
    expect(insight?.label).toBe('3-3 Point Invasion');
  });

  it('still prefers hard tactical labels over shape names', () => {
    // White stone in atari; the capturing move should be a capture, not a shape.
    const board = place(emptyBoard(9), [
      [1, 0, 'white'],
      [0, 0, 'black'],
      [2, 0, 'black'],
    ]);

    const insight = getMoveInsight(move(1, 1, 'black'), 9, board);
    expect(insight?.label).toBe('Capture');
  });

  it('labels a solid extension as a stretch', () => {
    const board = place(emptyBoard(19), [[9, 9, 'black']]);
    const insight = getMoveInsight(move(9, 10), 19, board);
    expect(insight?.label).toBe('Stretch');
  });

  it('keeps generic classification when no pattern matches', () => {
    const insight = getMoveInsight(move(9, 9), 19, emptyBoard(19));
    expect(insight?.label).toBe('Tengen');
  });
});

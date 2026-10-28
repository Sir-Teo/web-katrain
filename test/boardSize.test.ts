import { describe, expect, it } from 'vitest';
import { BOARD_SIZES, getHandicapPoints, getHoshiPoints, getMaxHandicap, isBoardSize, normalizeBoardSize } from '../src/utils/boardSize';

describe('board size helpers', () => {
  it('supports every odd practice board from 5 through 19', () => {
    expect(BOARD_SIZES).toEqual([5, 7, 9, 11, 13, 15, 17, 19]);
    for (const size of BOARD_SIZES) {
      expect(isBoardSize(size)).toBe(true);
      expect(normalizeBoardSize(size, 19)).toBe(size);
    }
    for (const size of [0, 3, 6, 10, 18, 20, 21, 5.5, NaN, Infinity]) {
      expect(isBoardSize(size)).toBe(false);
      expect(normalizeBoardSize(size, 19)).toBe(19);
    }
  });

  it('keeps star points and every handicap placement distinct and on the board', () => {
    for (const size of BOARD_SIZES) {
      const starPoints = getHoshiPoints(size);
      expect(new Set(starPoints.map(([x, y]) => `${x},${y}`)).size).toBe(starPoints.length);
      for (let handicap = 0; handicap <= getMaxHandicap(size); handicap++) {
        const points = getHandicapPoints(size, handicap);
        expect(points).toHaveLength(handicap);
        expect(new Set(points.map(([x, y]) => `${x},${y}`)).size).toBe(handicap);
        for (const [x, y] of [...points, ...starPoints]) {
          expect(x >= 0 && x < size && y >= 0 && y < size).toBe(true);
        }
      }
    }
    expect(getHoshiPoints(5)).toEqual([[2, 2]]);
    expect(getHoshiPoints(9)).toEqual([[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]]);
    expect(getHoshiPoints(13)).toEqual([[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]]);
  });

  it('uses standard 19x19 handicap stone patterns', () => {
    expect(getHandicapPoints(19, 3)).toEqual([
      [15, 3],
      [3, 15],
      [15, 15],
    ]);
    expect(getHandicapPoints(19, 6)).toEqual([
      [15, 3],
      [3, 15],
      [15, 15],
      [3, 3],
      [3, 9],
      [15, 9],
    ]);
    expect(getHandicapPoints(19, 9)).toEqual([
      [15, 3],
      [3, 15],
      [15, 15],
      [3, 3],
      [3, 9],
      [15, 9],
      [9, 3],
      [9, 15],
      [9, 9],
    ]);
  });

  it('supports full handicap patterns on smaller boards', () => {
    expect(getMaxHandicap(9)).toBe(9);
    expect(getHandicapPoints(9, 6)).toEqual([
      [6, 2],
      [2, 6],
      [6, 6],
      [2, 2],
      [2, 4],
      [6, 4],
    ]);
    expect(getMaxHandicap(13)).toBe(9);
    expect(getHandicapPoints(13, 8)).toEqual([
      [9, 3],
      [3, 9],
      [9, 9],
      [3, 3],
      [3, 6],
      [9, 6],
      [6, 3],
      [6, 9],
    ]);
  });
});

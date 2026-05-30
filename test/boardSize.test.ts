import { describe, expect, it } from 'vitest';
import { getHandicapPoints, getMaxHandicap } from '../src/utils/boardSize';

describe('board size helpers', () => {
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

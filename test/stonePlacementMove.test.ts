import { describe, expect, it } from 'vitest';
import { buildStonePlacementGrid } from '../src/utils/stonePlacementMove';
import type { Move } from '../src/types';

const move = (x: number, y: number, player: 'black' | 'white' = 'black'): Move =>
  ({ x, y, player } as Move);

/**
 * Which move number placed the stone now sitting on each point. Modifier-click
 * to jump reads this, so it has to be right even where the rules make it
 * awkward: a point can be played twice if the first stone was captured.
 */
describe('mapping points to the move that placed them', () => {
  it('numbers moves from one, not from zero', () => {
    const grid = buildStonePlacementGrid([move(3, 3)], 19);
    expect(grid[3]![3]).toBe(1);
  });

  it('leaves empty points empty', () => {
    const grid = buildStonePlacementGrid([move(3, 3)], 19);
    expect(grid[0]![0]).toBeNull();
  });

  it('lets a later move win a point that was captured and replayed', () => {
    const grid = buildStonePlacementGrid([move(3, 3), move(15, 15), move(3, 3, 'white')], 19);
    expect(grid[3]![3], 'the stone standing there now is the third move').toBe(3);
  });

  it('skips a pass rather than placing it somewhere', () => {
    // A pass is recorded with negative coordinates.
    const grid = buildStonePlacementGrid([move(3, 3), move(-1, -1), move(4, 4)], 19);
    expect(grid[3]![3]).toBe(1);
    expect(grid[4]![4]).toBe(3);
    expect(grid.flat().filter(value => value === 2)).toEqual([]);
  });

  it('ignores a move off the edge of the board it was given', () => {
    // A 19x19 record opened on a 9x9 board must not throw or write outside it.
    const grid = buildStonePlacementGrid([move(2, 2), move(15, 15)], 9);
    expect(grid).toHaveLength(9);
    expect(grid[2]![2]).toBe(1);
    expect(grid.flat().filter(value => value === 2)).toEqual([]);
  });

  it('gives an empty board for an empty record', () => {
    const grid = buildStonePlacementGrid([], 9);
    expect(grid.flat().every(value => value === null)).toBe(true);
    expect(grid.flat()).toHaveLength(81);
  });
});

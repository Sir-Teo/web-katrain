import { describe, expect, it } from 'vitest';
import {
  appendStrokePoint,
  countRegionStones,
  formatRegionOwnership,
  formatRegionStoneCount,
  normalizeRegionRect,
  sumRegionOwnership,
} from '../src/utils/boardDrawing';
import type { BoardState } from '../src/types';

const emptyBoard = (size: number): BoardState =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

describe('appendStrokePoint', () => {
  it('skips points closer than the minimum distance', () => {
    const points: Array<{ x: number; y: number }> = [{ x: 1, y: 1 }];
    expect(appendStrokePoint(points, { x: 1.05, y: 1 })).toBe(false);
    expect(points).toHaveLength(1);
    expect(appendStrokePoint(points, { x: 1.5, y: 1 })).toBe(true);
    expect(points).toHaveLength(2);
  });

  it('always appends to an empty stroke', () => {
    const points: Array<{ x: number; y: number }> = [];
    expect(appendStrokePoint(points, { x: 3, y: 4 })).toBe(true);
    expect(points).toEqual([{ x: 3, y: 4 }]);
  });
});

describe('normalizeRegionRect', () => {
  it('orders corners regardless of drag direction', () => {
    expect(normalizeRegionRect({ x: 5, y: 2 }, { x: 1, y: 7 })).toEqual({ xMin: 1, xMax: 5, yMin: 2, yMax: 7 });
  });
});

describe('countRegionStones', () => {
  it('counts stones and empty points inside the rectangle only', () => {
    const board = emptyBoard(9);
    board[0]![0] = 'black';
    board[1]![1] = 'white';
    board[8]![8] = 'black'; // outside
    const count = countRegionStones(board, { xMin: 0, xMax: 2, yMin: 0, yMax: 2 });
    expect(count).toEqual({ black: 1, white: 1, empty: 7, points: 9 });
    expect(formatRegionStoneCount(count)).toBe('Black 1 · White 1 · 7 empty');
  });
});

describe('sumRegionOwnership', () => {
  it('sums ownership inside the rectangle', () => {
    const territory = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
    territory[0]![0] = 1;
    territory[0]![1] = 0.5;
    territory[5]![5] = -1; // outside
    const summary = sumRegionOwnership(territory, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
    expect(summary).toEqual({ net: 1.5, points: 4 });
    expect(formatRegionOwnership(summary)).toBe('AI: Black +1.5 in this region');
  });

  it('reports the leading side and even regions', () => {
    expect(formatRegionOwnership({ net: -2.34, points: 9 })).toBe('AI: White +2.3 in this region');
    expect(formatRegionOwnership({ net: 0.01, points: 4 })).toBe('AI: even in this region');
  });

  it('returns null without ownership data', () => {
    expect(sumRegionOwnership(null, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 })).toBeNull();
    expect(formatRegionOwnership(null)).toBe('No AI ownership data — analyze this position first');
  });
});

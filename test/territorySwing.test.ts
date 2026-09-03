import { describe, expect, it } from 'vitest';
import {
  computeTerritorySwing,
  describeTerritorySwing,
  hasVisibleSwing,
  SWING_PEAK_FLOOR,
  swingAlpha,
} from '../src/utils/territorySwing';

const grid = (rows: number[][]) => rows.map((row) => row.slice());

describe('computeTerritorySwing', () => {
  it('signs the swing toward Black when a point moves to Black', () => {
    const swing = computeTerritorySwing(grid([[-1, 0], [0, 0]]), grid([[1, 0], [0, 0]]));
    expect(swing?.grid[0]?.[0]).toBe(2);
    expect(swing?.towardBlack).toBe(1);
    expect(swing?.towardWhite).toBe(0);
  });

  it('signs the swing toward White when a point moves to White', () => {
    const swing = computeTerritorySwing(grid([[1, 0], [0, 0]]), grid([[-1, 0], [0, 0]]));
    expect(swing?.grid[0]?.[0]).toBe(-2);
    expect(swing?.towardBlack).toBe(0);
    expect(swing?.towardWhite).toBe(1);
  });

  it('reports the largest single-point move as the peak', () => {
    const swing = computeTerritorySwing(grid([[0, 0], [0, 0]]), grid([[0.3, -0.9], [0.1, 0]]));
    expect(swing?.peak).toBeCloseTo(0.9, 6);
  });

  it('counts only points past the threshold, so haze is not a finding', () => {
    const swing = computeTerritorySwing(
      grid([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
      grid([[0.1, -0.1, 0.05], [0.9, 0, 0], [0, -0.8, 0]])
    );
    expect(swing?.towardBlack).toBe(1);
    expect(swing?.towardWhite).toBe(1);
  });

  it('keeps the rest of the board when one reading is missing', () => {
    const swing = computeTerritorySwing(
      grid([[0, 0], [0, 0]]),
      [[Number.NaN, 0.8], [0, 0]]
    );
    expect(swing?.grid[0]?.[0]).toBe(0);
    expect(swing?.grid[0]?.[1]).toBeCloseTo(0.8, 6);
  });

  it('returns null rather than guessing when a side is missing or disagrees', () => {
    expect(computeTerritorySwing(null, grid([[0]]))).toBeNull();
    expect(computeTerritorySwing(grid([[0]]), undefined)).toBeNull();
    expect(computeTerritorySwing([], grid([[0]]))).toBeNull();
    expect(computeTerritorySwing(grid([[0], [0]]), grid([[0]]))).toBeNull();
    expect(computeTerritorySwing(grid([[0, 0]]), grid([[0]]))).toBeNull();
  });

  it('treats an unchanged position as nothing to draw', () => {
    const same = grid([[1, -1], [0.4, -0.4]]);
    const swing = computeTerritorySwing(same, grid([[1, -1], [0.4, -0.4]]));
    expect(swing?.peak).toBe(0);
    expect(hasVisibleSwing(swing)).toBe(false);
    expect(describeTerritorySwing(swing)).toBeNull();
  });
});

describe('swingAlpha', () => {
  it('paints the peak fully and scales the rest against it', () => {
    expect(swingAlpha(0.8, 0.8)).toBe(1);
    expect(swingAlpha(-0.4, 0.8)).toBeCloseTo(0.5, 6);
    expect(swingAlpha(0, 0.8)).toBe(0);
  });

  it('paints nothing when the whole board sits under the floor', () => {
    expect(swingAlpha(SWING_PEAK_FLOOR / 2, SWING_PEAK_FLOOR / 2)).toBe(0);
  });

  it('never exceeds one, even if a reading runs past the peak', () => {
    expect(swingAlpha(3, 0.5)).toBe(1);
  });
});

describe('describeTerritorySwing', () => {
  it('counts intersections on both sides', () => {
    const swing = computeTerritorySwing(
      grid([[0, 0], [0, 0]]),
      grid([[0.9, 0.6], [-0.7, 0]])
    );
    expect(describeTerritorySwing(swing)).toBe('2 toward Black, 1 toward White points');
  });

  it('uses the singular for a single point', () => {
    const swing = computeTerritorySwing(grid([[0, 0]]), grid([[0.9, 0]]));
    expect(describeTerritorySwing(swing)).toBe('1 toward Black point');
  });

  it('says nothing when only haze moved', () => {
    const swing = computeTerritorySwing(grid([[0, 0]]), grid([[0.05, -0.03]]));
    expect(hasVisibleSwing(swing)).toBe(false);
    expect(describeTerritorySwing(swing)).toBeNull();
  });
});

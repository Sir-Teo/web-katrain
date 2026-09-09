import { describe, expect, it } from 'vitest';
import {
  computeTerritorySwing,
  resolveSwingBaseline,
  describeTerritorySwing,
  hasVisibleSwing,
  SWING_MIN_ALPHA,
  SWING_POINT_THRESHOLD,
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

  it('draws nothing when every point moved but none crossed the threshold', () => {
    const swing = computeTerritorySwing(grid([[0, 0], [0, 0]]), grid([[0.2, -0.2], [0.24, -0.1]]));
    expect(swing?.peak).toBeCloseTo(0.24, 6);
    expect(hasVisibleSwing(swing)).toBe(false);
    expect(swingAlpha(swing!.grid[1]![0]!, swing!.peak)).toBe(0);
  });
});

describe('swingAlpha', () => {
  it('paints the peak fully and ramps the rest down to the visible minimum', () => {
    expect(swingAlpha(0.8, 0.8)).toBe(1);
    expect(swingAlpha(-0.4, 0.8)).toBeCloseTo(SWING_MIN_ALPHA + (1 - SWING_MIN_ALPHA) * (0.15 / 0.55), 6);
    expect(swingAlpha(0, 0.8)).toBe(0);
  });

  it('paints nothing below the threshold, so the haze stays off the board', () => {
    expect(swingAlpha(SWING_POINT_THRESHOLD - 0.001, 0.9)).toBe(0);
    expect(swingAlpha(SWING_POINT_THRESHOLD, 0.9)).toBeCloseTo(SWING_MIN_ALPHA, 6);
  });

  it('paints nothing when the whole board sits under the threshold', () => {
    expect(swingAlpha(0.1, 0.1)).toBe(0);
  });

  it('paints a lone qualifying point fully rather than dividing by nothing', () => {
    expect(swingAlpha(SWING_POINT_THRESHOLD, SWING_POINT_THRESHOLD)).toBe(1);
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
    expect(describeTerritorySwing(swing)).toBe('2 intersections toward Black, 1 toward White');
  });

  it('uses the singular for a single intersection', () => {
    const swing = computeTerritorySwing(grid([[0, 0]]), grid([[0.9, 0]]));
    expect(describeTerritorySwing(swing)).toBe('1 intersection toward Black');
  });

  it('never says "points", which would read as a score beside the score readout', () => {
    const swing = computeTerritorySwing(grid([[0, 0], [0, 0]]), grid([[0.9, 0.6], [-0.7, 0]]));
    expect(describeTerritorySwing(swing)).not.toMatch(/points?\b/);
  });

  it('names only the side that moved when one side did not', () => {
    const white = computeTerritorySwing(grid([[0, 0]]), grid([[-0.9, -0.5]]));
    expect(describeTerritorySwing(white)).toBe('2 intersections toward White');
  });

  it('is null when nothing moved, so callers can word the empty state themselves', () => {
    // The dashboard chip distinguishes "not analysed yet" from "nothing moved";
    // returning a sentence for the second would flatten the two together.
    expect(describeTerritorySwing(computeTerritorySwing(grid([[0]]), grid([[0]])))).toBeNull();
    expect(describeTerritorySwing(null)).toBeNull();
  });

  it('says nothing when only haze moved', () => {
    const swing = computeTerritorySwing(grid([[0, 0]]), grid([[0.05, -0.03]]));
    expect(hasVisibleSwing(swing)).toBe(false);
    expect(describeTerritorySwing(swing)).toBeNull();
  });
});

describe('resolveSwingBaseline', () => {
  const grid9 = () => [[0, 0], [0, 0]];
  const label = (x: number, y: number) => `pt${x}${y}`;
  type Fake = {
    move?: { x: number; y: number } | null;
    analysis?: { territory?: number[][]; moves?: Array<{ x: number; y: number; order: number }> } | null;
    parent?: Fake | null;
    children?: Fake[];
  };
  const parentWith = (best: { x: number; y: number } | null, children: Fake[] = []): Fake => ({
    analysis: best
      ? { territory: grid9(), moves: [{ x: best.x, y: best.y, order: 0 }] }
      : { territory: grid9(), moves: [] },
    children,
  });

  it('measures from the move before, when asked for previous', () => {
    const parent = parentWith(null);
    const node = { parent, move: { x: 1, y: 1 }, analysis: { territory: grid9() } };
    expect(resolveSwingBaseline(node, 'previous', label)).toEqual({ kind: 'previous', territory: grid9() });
  });

  it('has nothing to measure from at the root', () => {
    const node = { parent: null, move: null, analysis: { territory: grid9() } };
    expect(resolveSwingBaseline(node, 'previous', label).kind).toBe('unavailable');
    expect(resolveSwingBaseline(node, 'best', label).kind).toBe('unavailable');
  });

  it("names the engine's move and where to find it when the variation is missing", () => {
    const parent = parentWith({ x: 3, y: 3 });
    const node = { parent, move: { x: 1, y: 1 }, analysis: { territory: grid9() } };
    const baseline = resolveSwingBaseline(node, 'best', label);
    expect(baseline.kind).toBe('unavailable');
    expect(baseline.kind === 'unavailable' && baseline.reason).toBe('play pt33 from the previous move to compare against it');
  });

  it('uses the sibling once it exists and is analysed', () => {
    const sibling = { move: { x: 3, y: 3 }, analysis: { territory: [[1, 0], [0, 0]] } };
    const parent = parentWith({ x: 3, y: 3 }, [sibling]);
    const node = { parent, move: { x: 1, y: 1 }, analysis: { territory: grid9() } };
    const baseline = resolveSwingBaseline(node, 'best', label);
    expect(baseline).toEqual({ kind: 'best', territory: [[1, 0], [0, 0]], label: 'pt33' });
  });

  it('waits for the sibling to be analysed rather than comparing against nothing', () => {
    const sibling = { move: { x: 3, y: 3 }, analysis: null };
    const parent = parentWith({ x: 3, y: 3 }, [sibling]);
    const node = { parent, move: { x: 1, y: 1 }, analysis: { territory: grid9() } };
    const baseline = resolveSwingBaseline(node, 'best', label);
    expect(baseline.kind === 'unavailable' && baseline.reason).toBe('pt33 is not analyzed yet');
  });

  it('says so when the move played was the engine\u2019s own', () => {
    const parent = parentWith({ x: 1, y: 1 });
    const node = { parent, move: { x: 1, y: 1 }, analysis: { territory: grid9() } };
    const baseline = resolveSwingBaseline(node, 'best', label);
    expect(baseline.kind === 'unavailable' && baseline.reason).toBe('this is the engine\u2019s move');
  });

  it('picks the sibling, not the played node, out of the same child list', () => {
    // Both are children of the same parent. Matching on coordinates alone would
    // be enough here, but the played node is in that list too, so the search
    // has to exclude it by identity rather than by position.
    const node: Fake = { move: { x: 1, y: 1 }, analysis: { territory: [[9, 9], [9, 9]] } };
    const sibling: Fake = { move: { x: 3, y: 3 }, analysis: { territory: [[2, 0], [0, 0]] } };
    const parent = parentWith({ x: 3, y: 3 }, [node, sibling]);
    node.parent = parent;
    const baseline = resolveSwingBaseline(node, 'best', label);
    expect(baseline).toEqual({ kind: 'best', territory: [[2, 0], [0, 0]], label: 'pt33' });
  });
});

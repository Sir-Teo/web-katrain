import { describe, expect, it } from 'vitest';
import { getAnalysisTooltipHorizontal, getAnalysisTooltipTop } from '../src/utils/analysisTooltipPlacement';

const base = { boundaryWidth: 910, boardLeft: 171, boardWidth: 567, boardHeight: 567, anchorX: 294, anchorY: 294, cellSize: 28 };

describe('analysis tooltip placement', () => {
  it('uses the right margin while reserving the panel handle', () => {
    const p = getAnalysisTooltipHorizontal(base);
    expect(p.outside).toBe(true);
    expect(p.left).toBe(750);
    expect(p.left).toBeGreaterThan(base.boardLeft + base.boardWidth);
    expect(p.left + p.width).toBeLessThanOrEqual(base.boundaryWidth - 36);
  });
  it('uses the left margin for a candidate on the left', () => {
    const p = getAnalysisTooltipHorizontal({ ...base, anchorX: 30 });
    expect(p.outside).toBe(true);
    expect(p.left).toBe(36);
    expect(p.left + p.width).toBeLessThan(base.boardLeft);
  });
  it('uses the other margin when only that one fits', () => {
    const p = getAnalysisTooltipHorizontal({ ...base, boardLeft: 50, anchorX: 30 });
    expect(p.outside).toBe(true);
    expect(p.left).toBeGreaterThan(50 + base.boardWidth);
  });
  it('retains the side margin when a small board has large cells', () => {
    expect(getAnalysisTooltipHorizontal({ ...base, cellSize: 110 }).outside).toBe(true);
  });
  it('falls back inward on a width-limited board and preserves the anchor gap', () => {
    const p = getAnalysisTooltipHorizontal({ ...base, boundaryWidth: 390, boardLeft: 12, boardWidth: 365, boardHeight: 365, anchorX: 182, cellSize: 18 });
    expect(p.outside).toBe(false);
    expect(p.width).toBeGreaterThanOrEqual(120);
    expect(p.left).toBeGreaterThan(12 + 182);
    expect(p.left + p.width).toBeLessThanOrEqual(382);
  });
  it('keeps very small standalone boards within their boundary', () => {
    const p = getAnalysisTooltipHorizontal({ ...base, boundaryWidth: 95, boardLeft: 0, boardWidth: 95, boardHeight: 95, anchorX: 86, cellSize: 10 });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + p.width).toBeLessThanOrEqual(87);
  });
  it('provides a wider bounded layout when enlarged text needs columns', () => {
    const p = getAnalysisTooltipHorizontal({ ...base, boundaryWidth: 378, boardLeft: 88, boardWidth: 203, minimumWidth: 320, maximumWidth: 320 });
    expect(p.width).toBe(320);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + p.width).toBeLessThanOrEqual(370);
  });
  it('clamps tall content above the bottom edge and below the top edge', () => {
    expect(getAnalysisTooltipTop(390, 300, 400)).toBe(92);
    expect(getAnalysisTooltipTop(10, 300, 400)).toBe(8);
    expect(getAnalysisTooltipTop(200, 100, 400)).toBe(150);
  });
  it('keeps the card out of space reserved for bars and notices', () => {
    expect(getAnalysisTooltipTop(10, 200, 400, 24, 80)).toBe(24);
    expect(getAnalysisTooltipTop(390, 200, 400, 24, 80)).toBe(120);
  });
});

import { describe, expect, it } from 'vitest';
import type { CandidateMove } from '../src/types';
import {
  COMPACT_ANALYSIS_HINT_LIMIT,
  POLICY_HEATMAP_LABEL_GAP,
  hasAdjacentHintLabel,
  policyHeatmapFontSize,
  selectAnalysisHintMoves,
  shouldCollapseHintLabel,
  usesCompactAnalysisHints,
} from '../src/utils/analysisHints';

const move = (order: number, visits = 100): CandidateMove => ({
  x: order,
  y: 0,
  winRate: 0.5,
  scoreLead: 0,
  visits,
  pointsLost: order,
  order,
});

describe('analysis hint density', () => {
  it('uses compact hints only when board intersections are visually tight', () => {
    expect(usesCompactAnalysisHints(18)).toBe(true);
    expect(usesCompactAnalysisHints(23.99)).toBe(true);
    expect(usesCompactAnalysisHints(24)).toBe(false);
    expect(usesCompactAnalysisHints(36)).toBe(false);
  });

  it('keeps only the strongest five legal candidates in compact mode', () => {
    const pass = { ...move(0), x: -1, y: -1 };
    const moves = [move(7), move(2), pass, move(5), move(0), move(1), move(4), move(3), move(6)];

    expect(selectAnalysisHintMoves(moves, true).map((candidate) => candidate.order)).toEqual([0, 1, 2, 3, 4]);
    expect(selectAnalysisHintMoves(moves, true)).toHaveLength(COMPACT_ANALYSIS_HINT_LIMIT);
  });

  it('preserves the engine order and full legal set on spacious boards', () => {
    const moves = [move(2), move(0), { ...move(1), x: -1, y: -1 }, move(3)];

    expect(selectAnalysisHintMoves(moves, false)).toEqual([moves[0], moves[1], moves[3]]);
  });
});

describe('policy heatmap number sizing', () => {
  // "0.05%" measures 3.01px wide at font size 1 in the heatmap's monospace face.
  const perPx = 3.01;

  it('drops the number when the cell cannot show a legible one', () => {
    // A 19x19 board on a phone: ~18px cells, where the old cellSize/4 drew 4.5px.
    expect(policyHeatmapFontSize(18, perPx)).toBeNull();
  });

  it('grows the number beyond cellSize / 4 when the cell has the room', () => {
    // ~29px desktop cell: 7.3px under the old rule.
    const size = policyHeatmapFontSize(29.2, perPx);
    expect(size).not.toBeNull();
    expect(size!).toBeGreaterThan(29.2 / 4);
  });

  it('never lets the longest label reach the neighbouring cell', () => {
    for (const cellSize of [26, 29.2, 40, 64]) {
      const size = policyHeatmapFontSize(cellSize, perPx);
      if (size === null) continue;
      expect(size * perPx).toBeLessThanOrEqual(cellSize - POLICY_HEATMAP_LABEL_GAP);
    }
  });

  it('stops growing at a comfortable size on a roomy board', () => {
    // A 9x9 board has cells wide enough to fit far larger text than is useful.
    expect(policyHeatmapFontSize(64, perPx)).toBe(16);
  });

  it('treats an unmeasurable label as nothing to draw', () => {
    expect(policyHeatmapFontSize(40, 0)).toBeNull();
  });
});

describe('two-line hint label collapsing', () => {
  it('finds labels on any of the eight neighbours', () => {
    const labelled = new Set(['3,4']);

    expect(hasAdjacentHintLabel(labelled, 3, 3)).toBe(true);
    expect(hasAdjacentHintLabel(labelled, 2, 3)).toBe(true);
    expect(hasAdjacentHintLabel(labelled, 3, 6)).toBe(false);
  });

  it('does not count a point as its own neighbour', () => {
    expect(hasAdjacentHintLabel(new Set(['3,4']), 3, 4)).toBe(false);
  });

  // Measured in the app at 700 weight in the hint font: a four-character label
  // ("+0.2") is 24.1px at 10px and a five-character one ("-12.3", or "+0.05"
  // with extra precision) is 30.1px. A 19x19 board on a 1280px desktop gives
  // roughly a 27px cell.
  it('keeps both lines when a four-character label still fits its cell', () => {
    expect(shouldCollapseHintLabel(24.1, 19, 27, true)).toBe(false);
  });

  it('collapses a five-character label that would reach into its neighbour', () => {
    expect(shouldCollapseHintLabel(30.1, 19, 27, true)).toBe(true);
  });

  it('collapses on stacked height alone when the cell is short', () => {
    expect(shouldCollapseHintLabel(10, 19, 20, true)).toBe(true);
  });

  it('lets an isolated label overflow onto empty wood', () => {
    expect(shouldCollapseHintLabel(30.1, 19, 27, false)).toBe(false);
  });
});

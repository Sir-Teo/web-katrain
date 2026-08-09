import { describe, expect, it } from 'vitest';
import type { CandidateMove } from '../src/types';
import {
  COMPACT_ANALYSIS_HINT_LIMIT,
  selectAnalysisHintMoves,
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

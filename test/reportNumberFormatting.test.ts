import { describe, expect, it } from 'vitest';
import { formatResultScoreLead, roundToHalf } from '../src/utils/manualScore';
import { formatCandidateVisits } from '../src/utils/candidateMoveFormat';

describe('report number formatting', () => {
  it('rounds a half-point guess the same way for either colour', () => {
    expect(roundToHalf(0.75)).toBe(1);
    expect(roundToHalf(-0.75)).toBe(-1);
    expect(formatResultScoreLead(roundToHalf(0.25))).toBe(formatResultScoreLead(roundToHalf(0.25)));
    expect(formatResultScoreLead(roundToHalf(-0.25)).replace('W', 'B')).toBe(formatResultScoreLead(roundToHalf(0.25)));
    expect(Object.is(roundToHalf(-0.1), 0)).toBe(true);
  });

  it('keeps visit counts to the column width at the thousand boundary', () => {
    expect(formatCandidateVisits(99_949)).toBe('99.9k');
    expect(formatCandidateVisits(99_950)).toBe('100k');
  });
});

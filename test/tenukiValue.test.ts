import { describe, expect, it } from 'vitest';
import {
  computeTenukiValue,
  describeTenukiValue,
  opponentFollowUp,
  TENUKI_NEGLIGIBLE_POINTS,
} from '../src/utils/tenukiValue';
import type { AnalysisResult, CandidateMove } from '../src/types';

const candidate = (over: Partial<CandidateMove>): CandidateMove =>
  ({ x: 3, y: 3, winRate: 0.5, scoreLead: 0, visits: 100, pointsLost: 0, order: 0, ...over }) as CandidateMove;

const analysis = (moves: CandidateMove[]): AnalysisResult =>
  ({ rootWinRate: 0.5, rootScoreLead: 0, moves, territory: [] }) as unknown as AnalysisResult;

describe('computeTenukiValue', () => {
  it('prices the swing for Black, whose lead falls when they pass', () => {
    // Black leads by 4 with the move; passing hands the point over and the
    // lead drops to -6. The point is worth 10.
    const value = computeTenukiValue({ sideToMove: 'black', scoreLeadNow: 4, scoreLeadAfterPass: -6 });
    expect(value?.points).toBeCloseTo(10, 6);
    expect(value?.negligible).toBe(false);
  });

  it('prices the swing for White, whose Black-positive lead rises when they pass', () => {
    // Both readings are Black-positive, so White passing moves the number the
    // other way. Getting this sign wrong would report every White move as zero.
    const value = computeTenukiValue({ sideToMove: 'white', scoreLeadNow: -4, scoreLeadAfterPass: 6 });
    expect(value?.points).toBeCloseTo(10, 6);
  });

  it('clamps a negative swing to zero but keeps the raw reading', () => {
    // Go has no zugzwang: passing cannot gain, so this is search noise. It is
    // still worth being able to see how much noise.
    const value = computeTenukiValue({ sideToMove: 'black', scoreLeadNow: 1, scoreLeadAfterPass: 2.5 });
    expect(value?.points).toBe(0);
    expect(value?.rawPoints).toBeCloseTo(-1.5, 6);
  });

  it('marks a sub-threshold swing negligible', () => {
    const value = computeTenukiValue({ sideToMove: 'black', scoreLeadNow: 3, scoreLeadAfterPass: 2.7 });
    expect(value?.points).toBeCloseTo(0.3, 6);
    expect(value?.negligible).toBe(true);
  });

  it('treats exactly the threshold as worth reporting', () => {
    const value = computeTenukiValue({
      sideToMove: 'black',
      scoreLeadNow: TENUKI_NEGLIGIBLE_POINTS,
      scoreLeadAfterPass: 0,
    });
    expect(value?.negligible).toBe(false);
  });

  it('returns null when either evaluation is missing', () => {
    expect(computeTenukiValue({ sideToMove: 'black', scoreLeadNow: Number.NaN, scoreLeadAfterPass: 0 })).toBeNull();
    expect(computeTenukiValue({ sideToMove: 'black', scoreLeadNow: 0, scoreLeadAfterPass: Number.NaN })).toBeNull();
  });
});

describe('opponentFollowUp', () => {
  it('picks the move the engine ranked first, not the first in the array', () => {
    const result = opponentFollowUp(
      analysis([candidate({ x: 9, y: 9, order: 2 }), candidate({ x: 15, y: 3, order: 0 })])
    );
    expect(result).toMatchObject({ x: 15, y: 3 });
  });

  it('falls back to the first entry when nothing is marked order 0', () => {
    const result = opponentFollowUp(analysis([candidate({ x: 4, y: 4, order: 7 })]));
    expect(result).toMatchObject({ x: 4, y: 4 });
  });

  it('handles an absent or empty analysis', () => {
    expect(opponentFollowUp(null)).toBeNull();
    expect(opponentFollowUp(undefined)).toBeNull();
    expect(opponentFollowUp(analysis([]))).toBeNull();
  });
});

describe('describeTenukiValue', () => {
  it('states the size when there is one', () => {
    const value = computeTenukiValue({ sideToMove: 'black', scoreLeadNow: 4, scoreLeadAfterPass: -6 });
    expect(describeTenukiValue(value)).toBe('Playing here first is worth about 10.0 points.');
  });

  it('says so plainly when the point is tiny', () => {
    const value = computeTenukiValue({ sideToMove: 'black', scoreLeadNow: 3, scoreLeadAfterPass: 2.9 });
    expect(describeTenukiValue(value)).toBe('Playing here first is worth less than a point.');
  });

  it('handles the unavailable case', () => {
    expect(describeTenukiValue(null)).toBe('Play elsewhere value is unavailable.');
  });
});

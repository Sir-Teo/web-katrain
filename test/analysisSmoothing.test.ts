import { describe, expect, it } from 'vitest';
import { smoothAnalysisGraphValues } from '../src/utils/analysisSmoothing';

describe('smoothAnalysisGraphValues', () => {
  it('averages each finite value with the previous raw value', () => {
    expect(smoothAnalysisGraphValues([10, -8, 4])).toEqual([10, 1, -2]);
  });

  it('does not bridge missing analysis gaps', () => {
    const smoothed = smoothAnalysisGraphValues([10, Number.NaN, -8]);

    expect(smoothed[0]).toBe(10);
    expect(smoothed[1]).toBeNaN();
    expect(smoothed[2]).toBe(-8);
  });
});

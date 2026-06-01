import { describe, expect, it } from 'vitest';
import { hasFiniteGraphData, hasVisibleGraphData } from '../src/utils/graphDataAvailability';

describe('graph data availability', () => {
  it('detects finite values', () => {
    expect(hasFiniteGraphData([Number.NaN, Infinity])).toBe(false);
    expect(hasFiniteGraphData([Number.NaN, 0])).toBe(true);
  });

  it('respects hidden graph metrics', () => {
    expect(hasVisibleGraphData({
      showScore: false,
      showWinrate: true,
      scoreValues: [1],
      winrateValues: [Number.NaN],
    })).toBe(false);
    expect(hasVisibleGraphData({
      showScore: true,
      showWinrate: false,
      scoreValues: [1],
      winrateValues: [Number.NaN],
    })).toBe(true);
  });
});

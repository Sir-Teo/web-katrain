import { describe, expect, it } from 'vitest';
import { getTopMoveMetricLabel, nextTopMoveMetric, TOP_MOVE_METRIC_OPTIONS } from '../src/utils/topMoveMetric';

describe('top move metric helpers', () => {
  it('cycles through every supported hint metric', () => {
    const visited = new Set<string>();
    let current = TOP_MOVE_METRIC_OPTIONS[0]!.value;

    for (let i = 0; i < TOP_MOVE_METRIC_OPTIONS.length; i += 1) {
      visited.add(current);
      current = nextTopMoveMetric(current);
    }

    expect([...visited]).toEqual(TOP_MOVE_METRIC_OPTIONS.map((option) => option.value));
    expect(current).toBe(TOP_MOVE_METRIC_OPTIONS[0]!.value);
  });

  it('provides compact labels for the analysis command bar', () => {
    expect(getTopMoveMetricLabel('top_move_delta_score', 'short')).toBe('Delta');
    expect(getTopMoveMetricLabel('top_move_delta_winrate', 'short')).toBe('Delta win');
    expect(getTopMoveMetricLabel('top_move_nothing', 'short')).toBe('Off');
  });
});

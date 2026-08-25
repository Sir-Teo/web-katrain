import { describe, expect, it } from 'vitest';
import {
  getPolicyHeatmapMetricLabel,
  getTopMoveMetricLabel,
  nextPolicyHeatmapMetric,
  nextTopMoveMetric,
  POLICY_HEATMAP_METRIC_OPTIONS,
  TOP_MOVE_METRIC_OPTIONS,
} from '../src/utils/topMoveMetric';

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

  it('cycles through every supported policy heatmap metric', () => {
    const visited = new Set<string>();
    let current = POLICY_HEATMAP_METRIC_OPTIONS[0]!.value;

    for (let i = 0; i < POLICY_HEATMAP_METRIC_OPTIONS.length; i += 1) {
      visited.add(current);
      current = nextPolicyHeatmapMetric(current);
    }

    expect([...visited]).toEqual(POLICY_HEATMAP_METRIC_OPTIONS.map((option) => option.value));
    expect(current).toBe(POLICY_HEATMAP_METRIC_OPTIONS[0]!.value);
  });

  it('advances off the label an unset heatmap metric is already showing', () => {
    // Settings that predate the metric leave it unset; the control still reads
    // "Move probability", so cycling has to land on the next option, not on
    // the one already displayed.
    expect(getPolicyHeatmapMetricLabel(undefined)).toBe(getPolicyHeatmapMetricLabel('policy'));
    expect(nextPolicyHeatmapMetric(undefined)).toBe(nextPolicyHeatmapMetric('policy'));
    expect(nextPolicyHeatmapMetric(undefined)).not.toBe('policy');
  });

  it('provides compact labels for the policy heatmap metric control', () => {
    expect(getPolicyHeatmapMetricLabel('policy', 'short')).toBe('Prob.');
    expect(getPolicyHeatmapMetricLabel('delta_score', 'short')).toBe('Score');
    expect(getPolicyHeatmapMetricLabel('delta_winrate', 'short')).toBe('Win rate');
  });
});

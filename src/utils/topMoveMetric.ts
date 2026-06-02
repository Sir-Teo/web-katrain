import type { GameSettings } from '../types';

export type TopMoveMetric = GameSettings['trainerTopMovesShow'];
export type PolicyHeatmapMetric = GameSettings['analysisPolicyMetric'];

export const TOP_MOVE_METRIC_OPTIONS: Array<{ value: TopMoveMetric; label: string; shortLabel: string }> = [
  { value: 'top_move_delta_score', label: 'Delta score', shortLabel: 'Delta' },
  { value: 'top_move_visits', label: 'Visits', shortLabel: 'Visits' },
  { value: 'top_move_score', label: 'Score', shortLabel: 'Score' },
  { value: 'top_move_winrate', label: 'Winrate', shortLabel: 'Win' },
  { value: 'top_move_delta_winrate', label: 'Delta winrate', shortLabel: 'Delta win' },
  { value: 'top_move_nothing', label: 'Nothing', shortLabel: 'Off' },
];

export const TOP_MOVE_METRIC_SELECT_OPTIONS: Array<{ value: TopMoveMetric; label: string }> = [
  { value: 'top_move_delta_score', label: 'Delta Score (points lost)' },
  { value: 'top_move_visits', label: 'Visits' },
  { value: 'top_move_score', label: 'Score' },
  { value: 'top_move_winrate', label: 'Winrate' },
  { value: 'top_move_delta_winrate', label: 'Delta Winrate' },
  { value: 'top_move_nothing', label: 'Nothing' },
];

export const POLICY_HEATMAP_METRIC_OPTIONS: Array<{ value: PolicyHeatmapMetric; label: string; shortLabel: string }> = [
  { value: 'policy', label: 'Move probability', shortLabel: 'Prob.' },
  { value: 'delta_score', label: 'Score change', shortLabel: 'Score' },
  { value: 'delta_winrate', label: 'Win-rate change', shortLabel: 'Win rate' },
];

export const POLICY_HEATMAP_METRIC_SELECT_OPTIONS: Array<{ value: PolicyHeatmapMetric; label: string }> = [
  { value: 'policy', label: 'Move Probability' },
  { value: 'delta_score', label: 'Score Change' },
  { value: 'delta_winrate', label: 'Win-rate Change' },
];

export function getTopMoveMetricLabel(metric: TopMoveMetric, variant: 'long' | 'short' = 'long'): string {
  const option = TOP_MOVE_METRIC_OPTIONS.find((item) => item.value === metric) ?? TOP_MOVE_METRIC_OPTIONS[0]!;
  return variant === 'short' ? option.shortLabel : option.label;
}

export function nextTopMoveMetric(metric: TopMoveMetric): TopMoveMetric {
  const index = TOP_MOVE_METRIC_OPTIONS.findIndex((item) => item.value === metric);
  return TOP_MOVE_METRIC_OPTIONS[(index + 1) % TOP_MOVE_METRIC_OPTIONS.length]!.value;
}

export function getPolicyHeatmapMetricLabel(
  metric: PolicyHeatmapMetric | undefined,
  variant: 'long' | 'short' = 'long'
): string {
  const option = POLICY_HEATMAP_METRIC_OPTIONS.find((item) => item.value === metric) ?? POLICY_HEATMAP_METRIC_OPTIONS[0]!;
  return variant === 'short' ? option.shortLabel : option.label;
}

export function nextPolicyHeatmapMetric(metric: PolicyHeatmapMetric | undefined): PolicyHeatmapMetric {
  const index = POLICY_HEATMAP_METRIC_OPTIONS.findIndex((item) => item.value === metric);
  return POLICY_HEATMAP_METRIC_OPTIONS[(index + 1) % POLICY_HEATMAP_METRIC_OPTIONS.length]!.value;
}

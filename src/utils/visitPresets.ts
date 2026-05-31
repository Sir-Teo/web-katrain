import { ENGINE_MAX_VISITS } from '../engine/katago/limits';

export const ANALYSIS_VISIT_PRESETS = [16, 250, 1000, 5000] as const;
export const ANALYSIS_MIN_VISITS = 16;

export function clampAnalysisVisits(visits: number): number {
  if (!Number.isFinite(visits)) return ANALYSIS_MIN_VISITS;
  return Math.max(ANALYSIS_MIN_VISITS, Math.min(ENGINE_MAX_VISITS, Math.floor(visits)));
}

export function mergeVisitPresets(...values: Array<readonly number[] | number>): number[] {
  const normalized = values.flatMap((value) => (Array.isArray(value) ? value : [value]));
  return Array.from(new Set(normalized.map(clampAnalysisVisits))).sort((a, b) => a - b);
}

export function visitPresetLabel(visits: number, defaultVisits?: number): string {
  if (defaultVisits !== undefined && visits === clampAnalysisVisits(defaultVisits)) return 'Default';
  if (visits <= 16) return 'Fast';
  if (visits <= 250) return 'Balanced';
  if (visits <= 1000) return 'Deep';
  return 'Thorough';
}

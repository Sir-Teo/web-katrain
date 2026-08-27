import { formatResultScoreLead } from './manualScore';

/**
 * The one glyph the app shows where a value has not been computed yet. Three
 * spellings were in use — an em dash, a hyphen and a double hyphen — and the
 * phone's readout row managed to show two of them side by side.
 */
export const NO_VALUE = '\u2014';

export function formatAnalysisWinRate(winRate: number | null | undefined): string {
  return typeof winRate === 'number' && Number.isFinite(winRate)
    ? `${(winRate * 100).toFixed(1)}%`
    : NO_VALUE;
}

export function formatWinRateFavorLabel(winRate: number | null | undefined): string {
  if (typeof winRate !== 'number' || !Number.isFinite(winRate)) return '';
  if (winRate >= 0.48 && winRate <= 0.52) return 'Even';
  return `${winRate > 0.5 ? 'Black' : 'White'} favored`;
}

export function formatAnalysisScoreLead(scoreLead: number | null | undefined): string {
  return typeof scoreLead === 'number' && Number.isFinite(scoreLead)
    ? formatResultScoreLead(scoreLead)
    : NO_VALUE;
}

export function formatReadableScoreLead(scoreLead: number | null | undefined): string {
  if (typeof scoreLead !== 'number' || !Number.isFinite(scoreLead)) return NO_VALUE;
  if (Math.abs(scoreLead) < 0.05) return 'Even';
  return `${scoreLead > 0 ? 'Black' : 'White'} +${Math.abs(scoreLead).toFixed(1)}`;
}

export type PointsLostSummary = {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
};

export function summarizePointsLost(pointsLost: number | null | undefined): PointsLostSummary {
  if (typeof pointsLost !== 'number' || !Number.isFinite(pointsLost)) {
    return { label: NO_VALUE, tone: 'muted' };
  }

  const absolute = Math.abs(pointsLost);
  if (absolute < 0.05) return { label: 'Best', tone: 'success' };
  if (pointsLost < 0) return { label: `Gain ${absolute.toFixed(1)}`, tone: 'success' };
  if (pointsLost < 1) return { label: `Lost ${absolute.toFixed(1)}`, tone: 'warning' };
  return { label: `Lost ${absolute.toFixed(1)}`, tone: 'danger' };
}

import { formatResultScoreLead } from './manualScore';

export function formatAnalysisWinRate(winRate: number | null | undefined): string {
  return typeof winRate === 'number' && Number.isFinite(winRate)
    ? `${(winRate * 100).toFixed(1)}%`
    : '-';
}

export function formatAnalysisScoreLead(scoreLead: number | null | undefined): string {
  return typeof scoreLead === 'number' && Number.isFinite(scoreLead)
    ? formatResultScoreLead(scoreLead)
    : '-';
}

export type PointsLostSummary = {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
};

export function summarizePointsLost(pointsLost: number | null | undefined): PointsLostSummary {
  if (typeof pointsLost !== 'number' || !Number.isFinite(pointsLost)) {
    return { label: '-', tone: 'muted' };
  }

  const absolute = Math.abs(pointsLost);
  if (absolute < 0.05) return { label: 'Best', tone: 'success' };
  if (pointsLost < 0) return { label: `Gain ${absolute.toFixed(1)}`, tone: 'success' };
  if (pointsLost < 1) return { label: `Lost ${absolute.toFixed(1)}`, tone: 'warning' };
  return { label: `Lost ${absolute.toFixed(1)}`, tone: 'danger' };
}

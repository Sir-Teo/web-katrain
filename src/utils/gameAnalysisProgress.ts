export interface GameAnalysisProgressSummary {
  countLabel: string;
  percentLabel: string;
  buttonLabel: string;
  captionLabel: string;
  title: string;
  etaLabel: string | null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${seconds}s`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function summarizeGameAnalysisProgress(args: {
  done: number;
  total: number;
  startedAtMs: number | null;
  nowMs: number;
}): GameAnalysisProgressSummary | null {
  const total = finiteNonNegative(args.total);
  if (total <= 0) return null;

  const done = Math.min(finiteNonNegative(args.done), total);
  const percentage = Math.round((done / total) * 100);
  const countLabel = `${done}/${total}`;
  const percentLabel = `${percentage}%`;

  let etaLabel: string | null = null;
  if (done > 0 && done < total && typeof args.startedAtMs === 'number' && Number.isFinite(args.startedAtMs)) {
    const elapsed = Math.max(0, args.nowMs - args.startedAtMs);
    const remaining = (elapsed / done) * (total - done);
    etaLabel = formatDuration(remaining);
  }

  const captionParts = [countLabel, percentLabel, etaLabel ? `ETA ${etaLabel}` : null].filter(Boolean);
  return {
    countLabel,
    percentLabel,
    etaLabel,
    buttonLabel: countLabel,
    captionLabel: captionParts.join(' · '),
    title: `Game review progress: ${captionParts.join(', ')}`,
  };
}

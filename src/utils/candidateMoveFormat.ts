/**
 * The numbers a candidate move is read by, formatted for a narrow column.
 *
 * Separate from the list that shows them because the rules here are the kind
 * that go wrong quietly: a minus sign that is a hyphen, a "loss" printed as a
 * gain, a visit count that runs to six digits in a 44px column.
 */

/** Visits, short enough for a column: `812`, `1.9k`, `120k`. */
export function formatCandidateVisits(visits: number | undefined): string {
  if (typeof visits !== 'number' || !Number.isFinite(visits)) return '—';
  const rounded = Math.max(0, Math.round(visits));
  if (rounded < 1000) return String(rounded);
  if (rounded < 100_000) return `${(rounded / 1000).toFixed(1)}k`;
  return `${Math.round(rounded / 1000)}k`;
}

/**
 * Score lead, always signed so the side it favours is never in doubt. The minus
 * is U+2212, which lines up with a digit in a monospace column where a hyphen
 * does not.
 */
export function formatCandidateScore(score: number | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
  const rounded = Number(score.toFixed(1));
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  if (rounded < 0) return `−${Math.abs(rounded).toFixed(1)}`;
  return '0.0';
}

export function formatCandidateWinRate(winRate: number | undefined): string {
  return typeof winRate === 'number' && Number.isFinite(winRate) ? `${(winRate * 100).toFixed(1)}%` : '—';
}

/**
 * Points lost, shown as the loss it is.
 *
 * A candidate can score fractionally above the engine's own pick, which is
 * search noise rather than a move that gains points; printing `+0.1` there
 * would invite reading it as better than best.
 */
export function formatCandidatePointsLost(pointsLost: number | undefined): string {
  if (typeof pointsLost !== 'number' || !Number.isFinite(pointsLost)) return '—';
  const loss = Math.max(0, pointsLost);
  return loss < 0.05 ? '0.0' : `−${loss.toFixed(1)}`;
}

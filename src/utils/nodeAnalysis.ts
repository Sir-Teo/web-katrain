import type { GameNode } from '../types';

export const DEFAULT_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0] as const;

export function computeNodePointsLost(node: GameNode): number | null {
  const move = node.move;
  const parent = node.parent;
  if (!move || !parent) return null;

  const parentScore = parent.analysis?.rootScoreLead;
  const childScore = node.analysis?.rootScoreLead;
  if (typeof parentScore === 'number' && Number.isFinite(parentScore) && typeof childScore === 'number' && Number.isFinite(childScore)) {
    const sign = move.player === 'black' ? 1 : -1;
    return sign * (parentScore - childScore);
  }

  const candidate = parent.analysis?.moves.find((m) => m.x === move.x && m.y === move.y);
  return typeof candidate?.pointsLost === 'number' && Number.isFinite(candidate.pointsLost) ? candidate.pointsLost : null;
}

export function getEvaluationClass(
  pointsLost: number,
  thresholds: readonly number[] = DEFAULT_EVAL_THRESHOLDS,
  colorsLen = DEFAULT_EVAL_THRESHOLDS.length
): number {
  const safeThresholds = thresholds.length ? thresholds : DEFAULT_EVAL_THRESHOLDS;
  const loss = Number.isFinite(pointsLost) ? pointsLost : 0;
  let i = 0;
  while (i < safeThresholds.length - 1 && loss < safeThresholds[i]!) i++;
  return Math.max(0, Math.min(i, colorsLen - 1));
}

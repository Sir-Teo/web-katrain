import type { Player } from '../types';
import type { MoveTime } from './moveTimes';

/**
 * What the clock cost. The time graph shows *where* it went; this asks the
 * follow-up question, which is the one worth acting on: a mistake played in two
 * seconds is a habit, and a mistake played after eight minutes is a reading
 * problem. They call for opposite advice, and the point loss alone cannot tell
 * them apart.
 */

/**
 * A mistake counts as rushed below this fraction of the player's own median
 * thinking time. Measuring against their own median rather than a fixed number
 * of seconds is what makes it mean the same thing in a blitz game and in a
 * three-hour one.
 */
export const RUSHED_FRACTION = 0.5;

export type TimedMistake = {
  moveNumber: number;
  seconds: number;
  pointsLost: number;
};

export type PlayerTimeInsight = {
  player: Player;
  /** Moves with a thinking time the SGF actually determines. */
  measuredMoves: number;
  totalSeconds: number;
  /**
   * Median, not mean. One long think dominates a mean of a dozen quick moves
   * and makes the "typical move" figure describe nobody's actual play.
   */
  medianSeconds: number;
  slowest: TimedMistake | null;
  /** Median time over this player's mistakes, or null if they made none. */
  medianOnMistakes: number | null;
  /** Mistakes played well below this player's own median, worst first. */
  rushedMistakes: TimedMistake[];
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Combines per-move clock data with per-move point loss.
 *
 * `pointsLostByNodeId` is keyed by node rather than by move number because the
 * two are not the same thing once a line contains a setup node, and lining them
 * up wrongly would attach a mistake to a neighbouring move's clock.
 */
export function summarizePlayerTime(args: {
  player: Player;
  times: readonly MoveTime[];
  pointsLostByNodeId: ReadonlyMap<string, number>;
  /** Points lost at or above which a move counts as a mistake. */
  mistakeThreshold: number;
}): PlayerTimeInsight {
  const { player, times, pointsLostByNodeId, mistakeThreshold } = args;

  const measured = times.filter(
    (entry) => entry.player === player && entry.secondsSpent !== null
  ) as Array<MoveTime & { secondsSpent: number }>;

  const seconds = measured.map((entry) => entry.secondsSpent);
  const medianSeconds = median(seconds);

  let slowest: TimedMistake | null = null;
  const mistakes: TimedMistake[] = [];
  for (const entry of measured) {
    const pointsLost = pointsLostByNodeId.get(entry.nodeId) ?? 0;
    const record: TimedMistake = { moveNumber: entry.moveNumber, seconds: entry.secondsSpent, pointsLost };
    if (!slowest || record.seconds > slowest.seconds) slowest = record;
    if (pointsLost >= mistakeThreshold) mistakes.push(record);
  }

  const rushedCutoff = medianSeconds * RUSHED_FRACTION;
  const rushedMistakes = mistakes
    .filter((entry) => entry.seconds < rushedCutoff)
    .sort((a, b) => b.pointsLost - a.pointsLost);

  return {
    player,
    measuredMoves: measured.length,
    totalSeconds: seconds.reduce((sum, value) => sum + value, 0),
    medianSeconds,
    slowest,
    medianOnMistakes: mistakes.length > 0 ? median(mistakes.map((entry) => entry.seconds)) : null,
    rushedMistakes,
  };
}

/**
 * The one sentence worth putting in front of the reader, or null when the data
 * does not support one. Saying nothing beats saying something shapeless about
 * three measured moves.
 */
export function describeTimePressure(insight: PlayerTimeInsight): string | null {
  if (insight.measuredMoves < 10) return null;
  const rushed = insight.rushedMistakes.length;
  if (rushed === 0) return null;
  const worst = insight.rushedMistakes[0]!;
  const plural = rushed === 1 ? 'mistake was' : 'mistakes were';
  return (
    `${rushed} ${plural} played in under ${Math.round(insight.medianSeconds * RUSHED_FRACTION)}s, ` +
    `well below this player's ${Math.round(insight.medianSeconds)}s typical move. ` +
    `The costliest was move ${worst.moveNumber}, ${worst.pointsLost.toFixed(1)} points in ${Math.round(worst.seconds)}s.`
  );
}

import type { AnalysisResult, CandidateMove, Player } from '../types';

/**
 * How much the move here is worth -- the swing between the side to move taking
 * it and letting the opponent have it.
 *
 * This is the question a player actually asks over the board ("is this urgent,
 * or can I play elsewhere?"), and the engine can answer it directly: compare
 * the position as it stands against the same position after the side to move
 * passes. The first evaluation assumes they take the best point; the second
 * hands that point to the opponent. The gap between them is the classic value
 * of the move, the number strong players estimate by counting.
 *
 * Chess tooling has had the same idea for years -- Lichess's `x` shows the
 * opponent's threat by handing them the move. Go has no equivalent in the
 * common tools, even though passing makes it cleaner to express here than it is
 * in chess, where passing is not legal.
 */

/**
 * Below this the swing is not worth reporting. Matches the threshold the rest
 * of the app already treats as "too small to mention": `MIN_QUALITY_MARKER_LOSS`
 * in the graph, and the "loses less than 0.5 points" wording in exported SGF.
 */
export const TENUKI_NEGLIGIBLE_POINTS = 0.5;

export type TenukiValue = {
  /**
   * Points the move is worth to the side to move. Never negative: Go has no
   * zugzwang, so passing cannot gain, and a negative reading is search noise
   * rather than a position where passing is good.
   */
  points: number;
  /**
   * The unclamped difference. Kept so a large negative can be recognised as
   * noise -- one that is quietly rounded to zero looks like a settled position.
   */
  rawPoints: number;
  /** True when the swing is inside the threshold above. */
  negligible: boolean;
};

export function computeTenukiValue(args: {
  sideToMove: Player;
  /** Black-positive score lead with the side to move playing best. */
  scoreLeadNow: number;
  /** Black-positive score lead after the side to move passes. */
  scoreLeadAfterPass: number;
}): TenukiValue | null {
  const { sideToMove, scoreLeadNow, scoreLeadAfterPass } = args;
  if (!Number.isFinite(scoreLeadNow) || !Number.isFinite(scoreLeadAfterPass)) return null;

  // Both leads are Black-positive (the engine reports `blackScoreLead`
  // regardless of whose turn it is), so the side to move decides the sign.
  const rawPoints =
    sideToMove === 'black' ? scoreLeadNow - scoreLeadAfterPass : scoreLeadAfterPass - scoreLeadNow;
  const points = Math.max(0, rawPoints);

  return {
    points,
    rawPoints,
    negligible: points < TENUKI_NEGLIGIBLE_POINTS,
  };
}

/** The opponent's best reply once the side to move has passed. */
export function opponentFollowUp(afterPass: AnalysisResult | null | undefined): CandidateMove | null {
  const moves = afterPass?.moves;
  if (!moves || moves.length === 0) return null;
  return moves.find((move) => move.order === 0) ?? moves[0] ?? null;
}

/**
 * Plain-language summary. Deliberately says "worth" rather than "sente" or
 * "gote": the swing measures size, and whether a move keeps the initiative is a
 * separate question this number does not answer.
 */
export function describeTenukiValue(value: TenukiValue | null): string {
  if (!value) return 'Play elsewhere value is unavailable.';
  if (value.negligible) return 'Playing here first is worth less than a point.';
  return `Playing here first is worth about ${value.points.toFixed(1)} points.`;
}

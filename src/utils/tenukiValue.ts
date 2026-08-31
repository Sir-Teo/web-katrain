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

/**
 * The stored result of a play-elsewhere search. It lives here rather than in
 * the store so the presentation helper below can use it without importing the
 * store, and so the two shells cannot drift on its shape.
 */
export type TenukiAnalysisState = {
  /** The node this describes. Navigation does not clear it; consumers compare. */
  nodeId: string;
  status: 'running' | 'ready' | 'error';
  /** Whose move it would have been. */
  sideToMove: Player;
  value: TenukiValue | null;
  /** The opponent's best reply once the side to move has passed. */
  followUp: CandidateMove | null;
  /** The full post-pass evaluation, so a board overlay can lay out its line. */
  afterPass: AnalysisResult | null;
  error?: string;
};

export type TenukiRowState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  buttonLabel: string;
  summary: string;
  disabled: boolean;
  /** Why the control is unavailable, for a tooltip and the command palette. */
  disabledReason?: string;
};

/**
 * Everything the control needs to render, in one place so the desktop dashboard
 * and the mobile panel cannot disagree about what it says. The two shells keep
 * separate markup by design; the wording should not be separate too.
 */
export function summarizeTenukiRow(args: {
  /** The stored result, already checked to belong to the current node. */
  tenuki: TenukiAnalysisState | null;
  /** Whether the current node has an evaluation to compare a pass against. */
  hasAnalysis: boolean;
  /** Renders a board point as the app labels it, e.g. `Q16`. */
  formatPoint: (x: number, y: number) => string;
}): TenukiRowState {
  const { tenuki, hasAnalysis, formatPoint } = args;
  const unavailable = 'Analyze the position first, so there is something to compare a pass against.';

  if (!tenuki) {
    return {
      status: 'idle',
      buttonLabel: 'Play elsewhere?',
      summary: hasAnalysis ? 'Price the point at this position.' : 'Analyze the position first.',
      disabled: !hasAnalysis,
      disabledReason: hasAnalysis ? undefined : unavailable,
    };
  }

  if (tenuki.status === 'running') {
    return {
      status: 'running',
      buttonLabel: 'Checking\u2026',
      summary: 'Evaluating the position after a pass\u2026',
      disabled: true,
    };
  }

  if (tenuki.status === 'error') {
    return {
      status: 'error',
      buttonLabel: 'Play elsewhere?',
      summary: tenuki.error ?? 'Could not evaluate.',
      disabled: !hasAnalysis,
      disabledReason: hasAnalysis ? undefined : unavailable,
    };
  }

  const follow = tenuki.followUp;
  const followLabel =
    follow && follow.x >= 0 && follow.y >= 0 ? ` Opponent takes ${formatPoint(follow.x, follow.y)}.` : '';
  return {
    status: 'ready',
    buttonLabel: 'Play elsewhere?',
    summary: `${describeTenukiValue(tenuki.value)}${followLabel}`,
    disabled: false,
  };
}

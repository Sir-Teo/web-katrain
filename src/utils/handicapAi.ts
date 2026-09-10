import type { GameNode } from '../types';

/**
 * KataHandicap — KaTrain's handicap bot, ported from `HandicapStrategy` in
 * `core/ai.py`.
 *
 * In a handicap game a full-strength bot often plays as though the game were
 * already decided. KataGo's `playoutDoublingAdvantage` lets the engine read the
 * position as if one side had several doublings of search, which keeps the
 * stronger side fighting for complications rather than settling.
 *
 * The advantage always belongs to Black (the side receiving the handicap), so a
 * negative value means "treat Black as the weaker player" — that is what makes
 * White press.
 */

/** KaTrain's estimate of a move's value in points, used to convert komi to stones. */
const MOVE_VALUE = 14;

export const HANDICAP_PDA_LIMIT = 3;

export const clampHandicapPda = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-HANDICAP_PDA_LIMIT, Math.min(HANDICAP_PDA_LIMIT, value));
};

/**
 * How many handicap stones the root position gives Black.
 *
 * `HA` is the file's own answer and wins whenever it has one. Without it the
 * count has to be read off the setup stones, and `AB` alone is not enough: a
 * tsumego, a pasted diagram and a framed problem all arrive as `AB` plus `AW`.
 * Counting those as a handicap put an "H8" on life-and-death problems and, on
 * the handicap AI strategy, handed White a search bias for a game in which
 * nobody was giving stones. White setup stones mean the position was arranged,
 * not handicapped -- a real handicap places black stones and nothing else. A
 * handicap also starts at two: one black stone on an empty board is a stone.
 */
export const countRootHandicapStones = (root: GameNode): number => {
  const declared = Number.parseInt(root.properties?.HA?.[0] ?? '', 10);
  if (Number.isFinite(declared)) return Math.max(0, declared);
  const black = root.properties?.AB?.length ?? 0;
  const white = root.properties?.AW?.length ?? 0;
  return white === 0 && black >= 2 ? black : 0;
};

/**
 * How much of a search advantage to hand Black, from the handicap stones and
 * komi. Maxes out at 8 stones of advantage; a normal 9-stone game is ~8.46.
 */
export const automaticHandicapPda = (args: { handicapStones: number; komi: number }): number => {
  const blackStoneAdvantage =
    Math.max(args.handicapStones - 1, 0) - (args.komi - MOVE_VALUE / 2) / MOVE_VALUE;
  return clampHandicapPda(-blackStoneAdvantage * (HANDICAP_PDA_LIMIT / 8));
};

export const handicapPlayoutDoublingAdvantage = (args: {
  automatic: boolean;
  manualPda: number;
  handicapStones: number;
  komi: number;
}): number =>
  args.automatic
    ? automaticHandicapPda({ handicapStones: args.handicapStones, komi: args.komi })
    : clampHandicapPda(args.manualPda);

/** One-line explanation of what the current setting will do. */
export const describeHandicapPda = (pda: number): string => {
  if (Math.abs(pda) < 0.05) return 'Even reading — the bot plays its normal game.';
  const side = pda > 0 ? 'Black' : 'White';
  return `Reads the position as if ${side} had ${Math.abs(pda).toFixed(2)} doublings more search.`;
};

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

/** Handicap stones set up at the root (SGF `AB`), which is what KaTrain counts. */
export const countRootHandicapStones = (root: GameNode): number => {
  const ab = root.properties?.AB;
  return Array.isArray(ab) ? ab.length : 0;
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

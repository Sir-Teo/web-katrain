import type { BoardState, Player } from '../types';
import type { KoRule } from './goRules';

/**
 * Superko.
 *
 * Simple ko only forbids retaking immediately. Rulesets that score by area
 * usually need more than that, or a game can cycle forever: AGA and New Zealand
 * forbid repeating a whole position *with the same player to move*
 * (situational), and Tromp-Taylor forbids repeating the position at all
 * (positional).
 *
 * Both are supersets of simple ko, so this only ever adds restrictions.
 */

export type SuperkoPosition = {
  board: BoardState;
  /** Whose turn it is in that position. */
  playerToMove: Player;
};

const stoneChar = (stone: Player | null): string => (stone === 'black' ? 'b' : stone === 'white' ? 'w' : '.');

/** Compact key for a board layout, ignoring whose turn it is. */
export const positionalKey = (board: BoardState): string =>
  board.map((row) => row.map(stoneChar).join('')).join('/');

/** Compact key for a board layout together with the side to move. */
export const situationalKey = (board: BoardState, playerToMove: Player): string =>
  `${playerToMove[0]}|${positionalKey(board)}`;

export const superkoKey = (ko: KoRule, position: SuperkoPosition): string =>
  ko === 'situational'
    ? situationalKey(position.board, position.playerToMove)
    : positionalKey(position.board);

/**
 * Would playing to `next` repeat an earlier position?
 *
 * `history` is every position that has already occurred in this line, oldest or
 * newest first — order does not matter.
 */
export const violatesSuperko = (args: {
  ko: KoRule;
  next: SuperkoPosition;
  history: Iterable<SuperkoPosition>;
}): boolean => {
  if (args.ko === 'simple') return false;
  const key = superkoKey(args.ko, args.next);
  for (const position of args.history) {
    if (superkoKey(args.ko, position) === key) return true;
  }
  return false;
};

/** Wording for the notification when a move is refused for repeating a position. */
export const superkoRejectionMessage = (ko: KoRule): string =>
  ko === 'situational'
    ? 'Situational superko: that move repeats an earlier position with the same player to move.'
    : 'Positional superko: that move repeats an earlier position.';

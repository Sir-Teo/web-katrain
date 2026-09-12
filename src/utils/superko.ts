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

/**
 * Exact board encoding, ignoring whose turn it is. Three intersections fit in
 * one printable character (three base-3 digits); the size distinguishes boards
 * whose final character contains padding. No probabilistic hash collisions.
 * This function deliberately reads fresh data: move simulations mutate boards.
 */
export const positionalKey = (board: BoardState): string => {
  let key = `${board.length}:`;
  let packed = 0;
  let count = 0;
  for (const row of board) {
    for (const stone of row) {
      packed = packed * 3 + (stone === 'black' ? 1 : stone === 'white' ? 2 : 0);
      if (++count === 3) {
        key += String.fromCharCode(65 + packed);
        packed = 0;
        count = 0;
      }
    }
  }
  if (count > 0) key += String.fromCharCode(65 + packed * 3 ** (3 - count));
  return key;
};

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

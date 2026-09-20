import type { BoardSize } from '../types';

/**
 * What the control is about to do, in the words of what it will produce.
 *
 * It named the board size and stopped there, so a saved handicap default put
 * stones on the board that nothing had mentioned -- "uses your saved defaults"
 * is true and tells the reader nothing about what those are.
 */
export function getQuickNewGameWarning(boardSize: BoardSize, handicap = 0): string {
  const stones = Number.isFinite(handicap) ? Math.max(0, Math.floor(handicap)) : 0;
  const setup = stones > 0
    ? `${boardSize}×${boardSize}, ${stones} handicap stone${stones === 1 ? '' : 's'}`
    : `${boardSize}×${boardSize}`;
  return `Quick new game (${setup}): uses your saved defaults and replaces the current game after the unsaved-changes check.`;
}

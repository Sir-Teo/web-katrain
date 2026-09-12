import type { BoardState, GameNode, Player } from '../types';
import type { KoRule } from './goRules';
import { positionalKey } from './superko';

// Stored positions are immutable: setup edits, replay and undo replace boards.
// Cache only those boards, never the caller's mutable move simulation. A weak
// key lets discarded games and edit snapshots be collected normally. Caching
// boards rather than whole ancestor sets also avoids quadratic history storage.
const storedBoardKeys = new WeakMap<BoardState, string>();

const storedBoardKey = (board: BoardState): string => {
  let key = storedBoardKeys.get(board);
  if (key === undefined) {
    key = positionalKey(board);
    storedBoardKeys.set(board, key);
  }
  return key;
};

/** Check this variation's ancestors, including the current position. */
export const lineViolatesSuperko = (
  from: GameNode,
  newBoard: BoardState,
  nextPlayerToMove: Player,
  koRule: KoRule,
): boolean => {
  if (koRule === 'simple') return false;
  const nextKey = positionalKey(newBoard);
  for (let node: GameNode | null = from; node; node = node.parent) {
    const position = node.gameState;
    if (koRule === 'situational' && position.currentPlayer !== nextPlayerToMove) continue;
    if (storedBoardKey(position.board) === nextKey) return true;
  }
  return false;
};

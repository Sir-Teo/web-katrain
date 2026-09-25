import type { BoardState, GameNode } from '../types';
import { boardsEqual } from './gameLogic';

/** The node whose position `node` shows: comment and markup nodes step back. */
const positionNode = (node: GameNode | null | undefined): GameNode | null | undefined => {
  let current = node;
  while (current && !current.move && current.parent && boardsEqual(current.gameState.board, current.parent.gameState.board)) {
    current = current.parent;
  }
  return current;
};

/**
 * The board a move played from `node` may not recreate under simple ko: the
 * position before the last move. That was always taken as the grandparent,
 * which is right only when `node` is itself a move. A comment or markup node
 * between them made the recapture legal -- the grandparent was then the move
 * that took the ko -- and a setup node that changed the board refused a move
 * that merely matched an older position. Comment-only nodes are stepped over;
 * a setup node that changed the board starts afresh, with no ko to keep.
 */
export const koReferenceBoard = (node: GameNode | null | undefined): BoardState | undefined => {
  const current = positionNode(node);
  return current?.move && current.parent ? current.parent.gameState.board : undefined;
};

/**
 * The two earlier positions the engine is given with `node`: before the last
 * move, and before the one before it. The engine replays the last move on the
 * first to find the ko point, so after a comment node -- whose parent already
 * holds the capture -- it found none and could rank the illegal recapture.
 */
export const engineHistoryBoards = (
  node: GameNode
): { previousBoard: BoardState | undefined; previousPreviousBoard: BoardState | undefined } => {
  const current = positionNode(node);
  const previousBoard = koReferenceBoard(current);
  const previousPreviousBoard = current?.move ? koReferenceBoard(current.parent) : undefined;
  return { previousBoard, previousPreviousBoard };
};

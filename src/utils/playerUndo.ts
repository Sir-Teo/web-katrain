import type { GameNode, Player } from '../types';

/**
 * How many moves Undo steps back so that it takes back the player's own move.
 *
 * Against the AI, Undo on the player's turn goes back past the AI's reply as
 * well. When that reply was the game's first move there is no move of the
 * player's before it: the first step reached the root with the AI to move and
 * the second did nothing, so nothing woke the AI and the game stalled. Undo
 * now declines (0) rather than rewinding to a position only the AI can move
 * in.
 */
export const getPlayerUndoSteps = (state: {
  currentNode: GameNode;
  currentPlayer: Player;
  isAiPlaying: boolean;
  aiColor: Player | null;
}): 0 | 1 | 2 => {
  const { currentNode, currentPlayer, isAiPlaying, aiColor } = state;
  if (!currentNode.parent) return 0;
  const lastMover = currentNode.move?.player ?? null;
  if (!isAiPlaying || !aiColor || lastMover !== aiColor || currentPlayer === aiColor) return 1;
  const human: Player = aiColor === 'black' ? 'white' : 'black';
  return currentNode.parent.move?.player === human ? 2 : 0;
};

export const NOTHING_TO_TAKE_BACK_MESSAGE = 'Nothing of yours to take back yet: the AI played the first move.';

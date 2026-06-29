import type { BoardState, GameNode, Move, Player } from '../types';

export type GuessPlayerFilter = 'both' | 'black' | 'white';

export interface GuessPosition {
  /** 1-based move number of the move to guess. */
  moveNumber: number;
  /** Board position *before* the move to guess. */
  board: BoardState;
  /** The actual game move the player is trying to predict. */
  expected: Move;
  /** The previous move (for the last-move marker on the board), if any. */
  lastMove: { x: number; y: number } | null;
}

const isRealMove = (move: Move | null): move is Move =>
  !!move && move.x >= 0 && move.y >= 0;

/**
 * Walks the main line of a game tree and returns one quiz position per real
 * (non-pass) move, optionally restricted to a single player's moves.
 */
export const buildGuessPositions = (
  root: GameNode,
  filter: GuessPlayerFilter = 'both',
): GuessPosition[] => {
  const positions: GuessPosition[] = [];
  let node: GameNode | null = root;
  while (node && node.children.length > 0) {
    const child: GameNode = node.children[0]!;
    const move = child.move;
    if (isRealMove(move) && (filter === 'both' || move.player === filter)) {
      positions.push({
        moveNumber: child.gameState.moveHistory.length,
        board: node.gameState.board,
        expected: move,
        lastMove: isRealMove(node.move) ? { x: node.move.x, y: node.move.y } : null,
      });
    }
    node = child;
  }
  return positions;
};

export interface GuessOutcome {
  correct: boolean;
  /** Manhattan distance between the guess and the actual move. */
  distance: number;
}

export const scoreGuess = (expected: Move, x: number, y: number): GuessOutcome => {
  const distance = Math.abs(expected.x - x) + Math.abs(expected.y - y);
  return { correct: distance === 0, distance };
};

/** A short, friendly verdict for a guess based on how far off it was. */
export const guessVerdict = (outcome: GuessOutcome): { label: string; tone: 'success' | 'warning' | 'danger' } => {
  if (outcome.correct) return { label: 'Exact match!', tone: 'success' };
  if (outcome.distance <= 2) return { label: 'Very close', tone: 'warning' };
  if (outcome.distance <= 5) return { label: 'In the area', tone: 'warning' };
  return { label: 'Off the mark', tone: 'danger' };
};

export const playerLabel = (player: Player): string => (player === 'black' ? 'Black' : 'White');

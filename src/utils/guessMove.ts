import type { BoardState, GameNode, Move, Player } from '../types';
import { moveCountOf } from './moveHistory';

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
        moveNumber: moveCountOf(child.gameState),
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

const pointsAway = (distance: number): string => `${distance} point${distance === 1 ? '' : 's'} away`;

/**
 * A short verdict for a guess: whether it matched the move played, and if not,
 * how far from it the guess landed.
 *
 * Distance is all it measures. "Very close" and "Off the mark" read as grades
 * of the guess, but a point two lines from the game move can be a blunder and
 * one across the board an equally good move, so the wording says where the
 * guess is relative to the game move and nothing about its quality. Misses
 * share one tone for the same reason: red for "far" said "bad".
 */
export const guessVerdict = (outcome: GuessOutcome): { label: string; tone: 'success' | 'warning' | 'danger' } => {
  if (outcome.correct) return { label: 'Matches the game move', tone: 'success' };
  const away = pointsAway(outcome.distance);
  if (outcome.distance <= 2) return { label: `Near the game move (${away})`, tone: 'warning' };
  if (outcome.distance <= 5) return { label: `Same area as the game move (${away})`, tone: 'warning' };
  return { label: `Far from the game move (${away})`, tone: 'warning' };
};

export const playerLabel = (player: Player): string => (player === 'black' ? 'Black' : 'White');

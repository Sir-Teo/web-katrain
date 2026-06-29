import { describe, expect, it } from 'vitest';
import { buildGuessPositions, guessVerdict, scoreGuess } from '../src/utils/guessMove';
import type { BoardState, GameNode, Move } from '../src/types';

const emptyBoard = (size = 9): BoardState =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

/** Builds a linear main-line tree from a list of moves (null = pass). */
const makeChain = (moves: Array<Move | null>): GameNode => {
  const makeNode = (id: string, move: Move | null, count: number): GameNode =>
    ({
      id,
      parent: null,
      children: [],
      move,
      gameState: {
        board: emptyBoard(),
        currentPlayer: 'black',
        moveHistory: Array.from({ length: count }) as Move[],
        capturedBlack: 0,
        capturedWhite: 0,
        komi: 6.5,
      },
    }) as unknown as GameNode;

  const root = makeNode('root', null, 0);
  let cursor = root;
  moves.forEach((move, idx) => {
    const child = makeNode(`n${idx + 1}`, move, idx + 1);
    cursor.children.push(child);
    cursor = child;
  });
  return root;
};

describe('buildGuessPositions', () => {
  it('produces one position per real move and skips passes', () => {
    const root = makeChain([
      { x: 3, y: 3, player: 'black' },
      { x: 15, y: 15, player: 'white' },
      { x: -1, y: -1, player: 'black' }, // pass — skipped
      { x: 15, y: 3, player: 'white' },
    ]);
    const positions = buildGuessPositions(root);
    expect(positions.map((p) => p.moveNumber)).toEqual([1, 2, 4]);
    expect(positions[0]!.expected).toEqual({ x: 3, y: 3, player: 'black' });
    // The second position's last-move marker is the first move.
    expect(positions[1]!.lastMove).toEqual({ x: 3, y: 3 });
  });

  it('filters to a single player', () => {
    const root = makeChain([
      { x: 3, y: 3, player: 'black' },
      { x: 15, y: 15, player: 'white' },
      { x: 15, y: 3, player: 'black' },
    ]);
    expect(buildGuessPositions(root, 'black').map((p) => p.expected.player)).toEqual(['black', 'black']);
    expect(buildGuessPositions(root, 'white')).toHaveLength(1);
  });

  it('returns nothing for a tree with no moves', () => {
    expect(buildGuessPositions(makeChain([]))).toEqual([]);
  });
});

describe('scoreGuess / guessVerdict', () => {
  const expected: Move = { x: 10, y: 10, player: 'black' };

  it('marks an exact hit', () => {
    const outcome = scoreGuess(expected, 10, 10);
    expect(outcome).toEqual({ correct: true, distance: 0 });
    expect(guessVerdict(outcome).tone).toBe('success');
  });

  it('reports manhattan distance and a tone for misses', () => {
    expect(scoreGuess(expected, 11, 10).distance).toBe(1);
    expect(guessVerdict(scoreGuess(expected, 11, 11)).tone).toBe('warning');
    expect(guessVerdict(scoreGuess(expected, 2, 2)).tone).toBe('danger');
  });
});

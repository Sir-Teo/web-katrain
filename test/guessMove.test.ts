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


/**
 * The quiz shows the position and asks for the move played from it, so the
 * board it hands the person must be the one *before* that move. The parent node
 * holds it; the child holds the answer. Reaching for `child.gameState.board`
 * instead -- a plausible tidy-up, since the child is the node being iterated --
 * puts the answer stone on the board the person is staring at.
 *
 * `makeChain` above gives every node the same empty board, so it cannot see this
 * either way; these nodes carry the stones actually played.
 */
const makeRealisedChain = (moves: Move[], size = 9): GameNode => {
  const board = emptyBoard(size);
  const snapshot = (): BoardState => board.map((row) => [...row]);

  const makeNode = (id: string, move: Move | null, count: number, boardAt: BoardState): GameNode =>
    ({
      id,
      parent: null,
      children: [],
      move,
      gameState: {
        board: boardAt,
        currentPlayer: 'black',
        moveHistory: Array.from({ length: count }) as Move[],
        capturedBlack: 0,
        capturedWhite: 0,
        komi: 6.5,
      },
    }) as unknown as GameNode;

  const root = makeNode('root', null, 0, snapshot());
  let cursor = root;
  moves.forEach((move, idx) => {
    board[move.y]![move.x] = move.player;
    const child = makeNode(`n${idx + 1}`, move, idx + 1, snapshot());
    cursor.children.push(child);
    cursor = child;
  });
  return root;
};

describe('the quiz board does not already contain the answer', () => {
  const moves: Move[] = [
    { x: 2, y: 2, player: 'black' },
    { x: 6, y: 6, player: 'white' },
    { x: 4, y: 4, player: 'black' },
    { x: 1, y: 7, player: 'white' },
  ];

  it('hands over the position before the move it is asking for', () => {
    const positions = buildGuessPositions(makeRealisedChain(moves));
    expect(positions).toHaveLength(moves.length);

    for (const position of positions) {
      const { x, y } = position.expected;
      expect(
        position.board[y]![x],
        `move ${position.moveNumber} is already on the board the quiz shows`
      ).toBeNull();
    }
  });

  it('still shows every stone played before it', () => {
    const positions = buildGuessPositions(makeRealisedChain(moves));
    // The third question follows two moves, so both are on its board.
    const third = positions[2]!;
    expect(third.board[2]![2]).toBe('black');
    expect(third.board[6]![6]).toBe('white');
    // And the answer to that question is not.
    expect(third.board[4]![4]).toBeNull();
  });
});

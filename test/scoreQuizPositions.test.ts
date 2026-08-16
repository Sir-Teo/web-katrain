import { describe, expect, it } from 'vitest';
import type { GameNode, Move } from '../src/types';
import {
  collectQuizPositions,
  selectQuizJumpCandidates,
  selectQuizPositionPool,
} from '../src/utils/scoreQuizPositions';

const emptyBoard = (size = 19) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

/** Builds a root plus `moves` main-line children, mirroring a played-out game. */
function mainLine(moves: number): { root: GameNode; nodes: GameNode[] } {
  const make = (id: string, parent: GameNode | null, history: Move[]): GameNode => ({
    id,
    parent,
    children: [],
    move: history.length > 0 ? history[history.length - 1]! : null,
    gameState: {
      board: emptyBoard(),
      currentPlayer: history.length % 2 === 0 ? 'black' : 'white',
      moveHistory: history,
      capturedBlack: 0,
      capturedWhite: 0,
      komi: 6.5,
    },
    analysis: null,
    analysisVisitsRequested: 0,
  });

  const root = make('root', null, []);
  const nodes = [root];
  let parent = root;
  const history: Move[] = [];
  for (let i = 1; i <= moves; i++) {
    history.push({ x: i % 19, y: Math.floor(i / 19), player: i % 2 === 1 ? 'black' : 'white' });
    const child = make(`n${i}`, parent, [...history]);
    parent.children.push(child);
    nodes.push(child);
    parent = child;
  }
  return { root, nodes };
}

describe('score quiz position pool', () => {
  it('skips the empty root, which has nothing to read', () => {
    const { root } = mainLine(4);
    const positions = collectQuizPositions(root);

    expect(positions).toHaveLength(4);
    expect(positions.every((n) => n.gameState.moveHistory.length > 0)).toBe(true);
  });

  it('has no positions at all for a game with no moves', () => {
    const { root } = mainLine(0);

    expect(collectQuizPositions(root)).toEqual([]);
    expect(selectQuizPositionPool([])).toEqual([]);
    expect(selectQuizJumpCandidates([], 'root')).toEqual([]);
  });

  it('keeps a varied pool on short games instead of pinning the final position', () => {
    const { root } = mainLine(7);
    const pool = selectQuizPositionPool(collectQuizPositions(root));

    // Cutoff is half of 7 -> moves 3..7, not "only the last move".
    expect(pool.map((n) => n.gameState.moveHistory.length)).toEqual([3, 4, 5, 6, 7]);
  });

  it('caps the cutoff at move 20 for long games', () => {
    const { root } = mainLine(120);
    const pool = selectQuizPositionPool(collectQuizPositions(root));

    expect(pool[0]!.gameState.moveHistory.length).toBe(20);
    expect(pool).toHaveLength(101);
  });

  it('never offers the position already on screen when another exists', () => {
    const { root } = mainLine(7);
    const positions = collectQuizPositions(root);
    const current = positions[positions.length - 1]!;

    const candidates = selectQuizJumpCandidates(positions, current.id);

    expect(candidates).not.toHaveLength(0);
    expect(candidates.some((n) => n.id === current.id)).toBe(false);
  });

  it('falls back to the only position when the game has just one', () => {
    const { root } = mainLine(1);
    const positions = collectQuizPositions(root);

    expect(selectQuizJumpCandidates(positions, positions[0]!.id)).toEqual(positions);
  });
});

import { describe, expect, it } from 'vitest';
import { heuristicLegalMoves, useGameStore } from '../src/store/gameStore';
import type { BoardState, GameNode, Move, Player } from '../src/types';

// 3x3, Tromp-Taylor. Rows top to bottom; x is the column.
const grid = (rows: string[]): BoardState =>
  rows.map((row) => [...row].map((c) => (c === 'X' ? 'black' : c === 'O' ? 'white' : null)));

const chain = (steps: Array<{ board: string[]; move: Move | null; toMove: Player }>): GameNode => {
  let parent: GameNode | null = null;
  let node: GameNode | null = null;
  steps.forEach((step, index) => {
    node = {
      id: `n${index}`,
      parent,
      children: [],
      move: step.move,
      gameState: { board: grid(step.board), currentPlayer: step.toMove, moveHistory: [], capturedBlack: 0, capturedWhite: 0, komi: 0 },
    } as GameNode;
    if (parent) parent.children.push(node);
    parent = node;
  });
  return node!;
};

describe('the fallback bot under superko', () => {
  it('does not offer a suicide whose result repeats an earlier position', () => {
    const pass = (player: Player): Move => ({ x: -1, y: -1, player });
    const current = chain([
      { board: ['...', '...', '...'], move: null, toMove: 'black' },
      { board: ['...', '...', '...'], move: pass('black'), toMove: 'white' },
      { board: ['...', 'O..', '...'], move: { x: 0, y: 1, player: 'white' }, toMove: 'black' },
      { board: ['...', 'O..', '...'], move: pass('black'), toMove: 'white' },
      { board: ['...', 'OO.', '...'], move: { x: 1, y: 1, player: 'white' }, toMove: 'black' },
      { board: ['...', 'OO.', '...'], move: pass('black'), toMove: 'white' },
      { board: ['...', 'OO.', '..O'], move: { x: 2, y: 2, player: 'white' }, toMove: 'black' },
      { board: ['...', 'OO.', 'X.O'], move: { x: 0, y: 2, player: 'black' }, toMove: 'white' },
      { board: ['...', 'OO.', 'X.O'], move: pass('white'), toMove: 'black' },
    ]);
    const settings = { ...useGameStore.getState().settings, gameRules: 'tromp-taylor' as const };

    // Black B1 takes A1 and B1 off the board, back to the position after W C1.
    const moves = heuristicLegalMoves({ board: current.gameState.board, currentPlayer: 'black', currentNode: current, settings });
    expect(moves.some((m) => m.x === 1 && m.y === 2)).toBe(false);
    expect(moves.length).toBeGreaterThan(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { lineViolatesSuperko, useGameStore } from '../src/store/gameStore';
import type { BoardState, GameNode, Player } from '../src/types';

const empty = (n: number): BoardState => Array.from({ length: n }, () => new Array(n).fill(null));

const node = (board: BoardState, playerToMove: Player, parent: GameNode | null): GameNode =>
  ({
    id: `n${Math.random()}`,
    parent,
    children: [],
    move: null,
    properties: {},
    analysis: null,
    gameState: { board, currentPlayer: playerToMove, moveHistory: [], capturedBlack: 0, capturedWhite: 0, komi: 7.5 },
  }) as unknown as GameNode;

describe('lineViolatesSuperko', () => {
  it('flags a board already seen on this line under positional superko, and not under simple ko', () => {
    const a = empty(5);
    const b = empty(5); b[0]![0] = 'black';
    const root = node(a, 'black', null);
    const child = node(b, 'white', root);
    // Returning to the empty board (a) with Black to move repeats the root.
    expect(lineViolatesSuperko(child, a, 'black', 'positional')).toBe(true);
    expect(lineViolatesSuperko(child, a, 'white', 'positional')).toBe(true);
    expect(lineViolatesSuperko(child, a, 'white', 'situational')).toBe(false);
    expect(lineViolatesSuperko(child, a, 'black', 'situational')).toBe(true);
    expect(lineViolatesSuperko(child, a, 'black', 'simple')).toBe(false);
  });
});

describe('insert mode goes through the same ko rule as playMove', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it('still lets a fresh position be inserted', () => {
    useGameStore.getState().updateSettings({ gameRules: 'tromp-taylor' });
    useGameStore.getState().playMove(2, 2);
    useGameStore.getState().playMove(6, 6);
    useGameStore.getState().navigateBack();
    useGameStore.getState().toggleInsertMode();
    useGameStore.getState().playMove(3, 3);
    expect(useGameStore.getState().currentNode.move).toEqual({ x: 3, y: 3, player: 'white' });
  });
});

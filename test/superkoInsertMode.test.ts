import { beforeEach, describe, expect, it } from 'vitest';
import { lineViolatesSuperko, useGameStore } from '../src/store/gameStore';
import type { BoardState, GameNode, Player } from '../src/types';
import { applyCapturesInPlace } from '../src/utils/gameLogic';
import { parseSgf } from '../src/utils/sgf';
import { tripleKoFixture } from './helpers/superkoFixture';

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

  it.each([false, true])('rejects the sixth capture of a three-ko cycle, swapped=%s', swap => {
    const { history, repeatMove } = tripleKoFixture(swap);
    let last: GameNode | null = null;
    for (const position of history) last = node(position.board, position.playerToMove, last);
    const current = last!;
    const next = current.gameState.board.map(row => [...row]);
    next[repeatMove.y]![repeatMove.x] = current.gameState.currentPlayer;
    applyCapturesInPlace(next, repeatMove.x, repeatMove.y, current.gameState.currentPlayer);
    expect(next).toEqual(history[0]!.board);
    for (const ko of ['positional', 'situational', 'simple'] as const) {
      expect(lineViolatesSuperko(current, next, history[0]!.playerToMove, ko)).toBe(ko !== 'simple');
    }
  });

  it('checks only ancestors and follows changed parent links without stale line caches', () => {
    const a = empty(9);
    const b = empty(9); b[0]![0] = 'black';
    const root = node(a, 'black', null);
    const sibling = node(b, 'white', root);
    const current = node(a, 'black', root);
    root.children.push(sibling, current);
    expect(lineViolatesSuperko(current, b, 'white', 'positional')).toBe(false);
    current.parent = sibling;
    expect(lineViolatesSuperko(current, b, 'white', 'positional')).toBe(true);
    current.parent = root;
    expect(lineViolatesSuperko(current, b, 'white', 'positional')).toBe(false);
  });

  it('reads replaced positions and the current side to move on a cached board', () => {
    const a = empty(9);
    const b = empty(9); b[0]![0] = 'black';
    const root = node(a, 'black', null);
    expect(lineViolatesSuperko(root, a, 'black', 'situational')).toBe(true);
    root.gameState = { ...root.gameState, currentPlayer: 'white' };
    expect(lineViolatesSuperko(root, a, 'black', 'situational')).toBe(false);
    expect(lineViolatesSuperko(root, a, 'white', 'situational')).toBe(true);
    root.gameState = { ...root.gameState, board: b };
    expect(lineViolatesSuperko(root, a, 'white', 'situational')).toBe(false);
    expect(lineViolatesSuperko(root, b, 'white', 'situational')).toBe(true);
  });

  it('reuses immutable history encodings while reading each mutable candidate freshly', () => {
    let reads = 0;
    const stored = empty(19).map(row => {
      Object.freeze(row);
      return new Proxy(row, {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) reads++;
          return Reflect.get(target, property, receiver);
        },
      });
    });
    Object.freeze(stored);
    let current = node(stored, 'black', null);
    for (let i = 0; i < 12000; i++) current = node(stored, i % 2 ? 'black' : 'white', current);
    const candidate = empty(19);
    candidate[18]![18] = 'white';
    expect(lineViolatesSuperko(current, candidate, 'black', 'situational')).toBe(false);
    expect(reads).toBe(361);
    const initialReads = reads;
    expect(lineViolatesSuperko(current, candidate, 'white', 'situational')).toBe(false);
    candidate[18]![18] = null;
    expect(lineViolatesSuperko(current, candidate, 'black', 'situational')).toBe(true);
    expect(reads).toBe(initialReads);
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

  it('keeps history checks correct after setup replay, undo and redo', () => {
    const state = () => useGameStore.getState();
    state().updateSettings({ gameRules: 'aga', soundEnabled: false, loadSgfFastAnalysis: false });
    state().loadGame(parseSgf('(;SZ[9]RU[AGA];B[dd];W[ee])'));
    state().navigateEnd();
    const originalRootBoard = state().rootNode.gameState.board;
    expect(lineViolatesSuperko(state().currentNode, originalRootBoard, 'black', 'situational')).toBe(true);
    state().navigateStart();
    state().setEditTool('setup-black');
    state().applyEditTool(0, 0);
    state().navigateEnd();
    expect(lineViolatesSuperko(state().currentNode, originalRootBoard, 'black', 'situational')).toBe(false);
    const editedRootBoard = state().rootNode.gameState.board;
    expect(lineViolatesSuperko(state().currentNode, editedRootBoard, 'black', 'situational')).toBe(true);
    state().undoEdit();
    state().navigateEnd();
    expect(lineViolatesSuperko(state().currentNode, originalRootBoard, 'black', 'situational')).toBe(true);
    expect(lineViolatesSuperko(state().currentNode, editedRootBoard, 'black', 'situational')).toBe(false);
    state().redoEdit();
    state().navigateEnd();
    expect(lineViolatesSuperko(state().currentNode, originalRootBoard, 'black', 'situational')).toBe(false);
    expect(lineViolatesSuperko(state().currentNode, editedRootBoard, 'black', 'situational')).toBe(true);
  });
});

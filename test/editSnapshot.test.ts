import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import type { GameNode } from '../src/types';

const state = () => useGameStore.getState();

describe('edit snapshots', () => {
  beforeEach(() => {
    state().resetGame();
    useGameStore.setState({ isAnalysisMode: false, isTeachMode: false });
  });

  it('keeps an unchanged branch collapsed through marker undo and redo', () => {
    state().loadGame(parseSgf('(;GM[1]SZ[9];B[dd](;W[ee];B[ff])(;W[cc]))'));
    state().navigateStart();
    state().rootNode.children[0]!.children[0]!.collapsed = true;
    state().setEditTool('marker-triangle');
    state().applyEditTool(0, 0);
    state().undoEdit();
    expect(state().rootNode.children[0]!.children[0]!.collapsed).toBe(true);
    state().redoEdit();
    expect(state().rootNode.children[0]!.children[0]!.collapsed).toBe(true);
  });

  it('preserves prior board positions through setup edits and branch replay', () => {
    state().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee];B[ff])'));
    state().navigateStart();
    const original = state().rootNode;
    const saved = JSON.stringify(original.children[0]!.children[0]!.gameState);
    const stack = [original];
    while (stack.length) {
      const node = stack.pop()!;
      node.gameState.board.forEach(Object.freeze);
      Object.freeze(node.gameState.board);
      node.gameState.moveHistory.forEach(Object.freeze);
      Object.freeze(node.gameState.moveHistory);
      Object.freeze(node.gameState);
      stack.push(...node.children);
    }
    state().setEditTool('setup-black');
    state().applyEditTool(0, 0);
    expect(state().board[0]![0]).toBe('black');
    state().undoEdit();
    expect(state().board[0]![0]).toBeNull();
    expect(JSON.stringify(state().rootNode.children[0]!.children[0]!.gameState)).toBe(saved);
    state().redoEdit();
    expect(state().board[0]![0]).toBe('black');
    expect(state().rootNode.children[0]!.children[0]!.gameState.board[0]![0]).toBe('black');
  });

  it('can annotate and undo a deeply nested study record without a call-stack overflow', () => {
    // SGF setup/comment nodes need no move history. A valid study tree can
    // therefore be much deeper than a played game without a large file.
    const root = state().rootNode;
    let cursor = root;
    for (let i = 0; i < 12_000; i++) {
      const child: GameNode = {
        id: `study-${i}`, parent: cursor, children: [], move: null,
        gameState: root.gameState, note: `Position ${i}`,
      };
      cursor.children.push(child);
      cursor = child;
    }
    state().setEditTool('marker-square');
    state().applyEditTool(0, 0);
    state().undoEdit();
    expect(state().rootNode.properties?.SQ).toBeUndefined();
    state().redoEdit();
    expect(state().rootNode.properties?.SQ).toEqual(['aa']);
    cursor = state().rootNode;
    for (let i = 0; i < 12_000; i++) {
      const child = cursor.children[0]!;
      expect(child.parent).toBe(cursor);
      cursor = child;
    }
    expect(cursor.note).toBe('Position 11999');
  });
});

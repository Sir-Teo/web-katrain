import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import type { GameNode } from '../src/types';

const state = () => useGameStore.getState();
const DEPTH = 12_000;
const comments = () => Array.from({ length: DEPTH }, (_, i) => `;C[Study ${i}]`).join('');

const walkComments = (first: GameNode): GameNode => {
  let node = first;
  for (let i = 0; i < DEPTH; i++) {
    const child = node.children[0]!;
    expect(child.parent).toBe(node);
    node = child;
  }
  expect(node.note).toBe(`Study ${DEPTH - 1}`);
  return node;
};

describe('deep study branch editing', () => {
  beforeEach(() => {
    state().resetGame();
    state().updateSettings({ soundEnabled: false, loadSgfFastAnalysis: false });
    useGameStore.setState({ isAnalysisMode: false, isTeachMode: false });
  });

  it('copies every node in a long annotated move branch', () => {
    state().loadGame(parseSgf(`(;GM[1]SZ[9];B[dd]${comments()})`));
    state().navigateStart();
    state().navigateForward();
    state().copyCurrentBranch();
    expect(state().notification?.message).toBe(`Copied branch (${DEPTH + 1} nodes).`);
    let node = state().copiedBranch!;
    expect(node.move).toEqual({ x: 3, y: 3, player: 'black' });
    for (let i = 0; i < DEPTH; i++) node = node.children[0]!;
    expect(node.note).toBe(`Study ${DEPTH - 1}`);
    expect(node.children).toEqual([]);
  });

  it('pastes a deep clipboard branch and preserves it through undo and redo', () => {
    // Construct the clipboard independently so a broken copy cannot hide a
    // separate stack overflow while replaying or counting the pasted nodes.
    type ClipboardNode = NonNullable<ReturnType<typeof state>['copiedBranch']>;
    const root: ClipboardNode = {
      move: { x: 3, y: 3, player: 'black' }, properties: {}, children: [],
      note: '', aiThoughts: '', endState: null, timeUsedSeconds: 0,
    };
    let cursor = root;
    for (let i = 0; i < DEPTH; i++) {
      const child: ClipboardNode = { ...root, move: null, properties: {}, children: [], note: `Study ${i}` };
      cursor.children.push(child);
      cursor = child;
    }
    state().loadGame(parseSgf('(;GM[1]SZ[9])'));
    useGameStore.setState({ copiedBranch: root });
    state().pasteCopiedBranch();
    expect(state().notification?.message).toBe(`Pasted branch (${DEPTH + 1} nodes).`);
    const pasted = state().currentNode;
    expect(pasted.parent).toBe(state().rootNode);
    expect(walkComments(pasted).gameState.board[3]![3]).toBe('black');
    state().undoEdit();
    expect(state().rootNode.children).toEqual([]);
    state().redoEdit();
    expect(walkComments(state().rootNode.children[0]!).gameState.board[3]![3]).toBe('black');
  });

  it('rebuilds a deep edited study, prunes illegal descendants, and keeps sibling order', () => {
    state().loadGame(parseSgf(`(;GM[1]SZ[9];B[dd]${comments()}(;W[aa];B[ab])(;W[ee]C[First kept])(;W[ff]C[Second kept]))`));
    state().navigateStart();
    state().setEditTool('setup-black');
    state().applyEditTool(0, 0);
    expect(state().board[0]![0]).toBe('black');
    const leaf = walkComments(state().rootNode.children[0]!);
    expect(leaf.gameState.board[0]![0]).toBe('black');
    expect(leaf.children.map((child) => child.note)).toEqual(['First kept', 'Second kept']);
    expect(leaf.children.every((child) => child.parent === leaf)).toBe(true);
    expect(state().notification?.message).toContain('2 descendant nodes were pruned');
    state().undoEdit();
    const originalLeaf = walkComments(state().rootNode.children[0]!);
    expect(originalLeaf.gameState.board[0]![0]).toBeNull();
    expect(originalLeaf.children).toHaveLength(3);
  });
});

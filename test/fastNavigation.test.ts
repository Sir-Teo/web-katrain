import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import type { GameNode } from '../src/types';

const state = () => useGameStore.getState();
const line = '(;GM[1]SZ[9]' + Array.from({ length: 20 }, (_, index) =>
  `;${index % 2 ? 'W' : 'B'}[${String.fromCharCode(97 + index % 9)}${String.fromCharCode(97 + Math.floor(index / 9))}]`
).join('') + ')';

beforeEach(() => {
  state().resetGame();
  state().updateSettings({ loadSgfRewind: true, loadSgfFastAnalysis: false });
  useGameStore.setState({ isAnalysisMode: false, isTeachMode: false, isAiPlaying: false });
});

const expectPosition = (node: GameNode) => {
  expect(state().currentNode).toBe(node);
  expect(state().board).toBe(node.gameState.board);
  expect(state().currentPlayer).toBe(node.gameState.currentPlayer);
  expect(state().moveHistory).toBe(node.gameState.moveHistory);
  expect(state().capturedBlack).toBe(node.gameState.capturedBlack);
  expect(state().capturedWhite).toBe(node.gameState.capturedWhite);
  expect(state().analysisData).toBe(node.analysis ?? null);
};

describe('fast navigation', () => {
  it('publishes only the final position of a ten-node take-back', () => {
    state().loadGame(parseSgf(line));
    state().navigateEnd();
    let target = state().currentNode;
    for (let count = 0; count < 10; count++) target = target.parent!;
    const visited: GameNode[] = [];
    const unsubscribe = useGameStore.subscribe((next, previous) => {
      if (next.currentNode !== previous.currentNode) visited.push(next.currentNode);
    });
    try {
      state().navigateByNodes(-10);
      expectPosition(target);
      expect(visited).toEqual([target]);
    } finally { unsubscribe(); }
  });

  it('counts comment and setup nodes and follows the selected variation', () => {
    state().loadGame(parseSgf('(;GM[1]SZ[9];B[aa](;W[bb];B[cc])(;C[explanation];AW[dd];W[ee];B[ff]))'));
    const fork = state().rootNode.children[0]!;
    const comment = fork.children[1]!;
    const setup = comment.children[0]!;
    const tip = setup.children[0]!.children[0]!;
    state().jumpToNode(tip);
    state().navigateStart();
    state().navigateByNodes(3);
    expectPosition(setup);
    state().navigateByNodes(-2);
    expectPosition(fork);
    state().navigateByNodes(10);
    expectPosition(tip);
    expect(state().activeBranchChildIds[fork.id]).toBe(comment.id);
    expect(fork.children[0]!.move).toMatchObject({ x: 1, y: 1 });
  });

  it('publishes a forward jump once and stops at the end of the line', () => {
    state().loadGame(parseSgf(line));
    const visited: GameNode[] = [];
    const unsubscribe = useGameStore.subscribe((next, previous) => {
      if (next.currentNode !== previous.currentNode) visited.push(next.currentNode);
    });
    try {
      state().navigateByNodes(100);
      expect(state().moveHistory).toHaveLength(20);
      expect(visited).toEqual([state().currentNode]);
      const final = state();
      state().navigateByNodes(10);
      expect(state()).toBe(final);
    } finally { unsubscribe(); }
  });

  it('stops at the root without publishing an unchanged position', () => {
    state().loadGame(parseSgf(line));
    state().navigateEnd();
    const root = state().rootNode;
    state().navigateByNodes(-100);
    expectPosition(root);
    const before = state();
    state().navigateByNodes(-10);
    expect(state()).toBe(before);
  });

  it('ignores empty and non-finite jump requests', () => {
    state().loadGame(parseSgf(line));
    const before = state();
    for (const steps of [0, -0, NaN, Infinity, -Infinity]) {
      state().navigateByNodes(steps);
      expect(state()).toBe(before);
    }
  });

  it('still deletes temporary moves when taking back in insert mode', () => {
    state().loadGame(parseSgf('(;GM[1]SZ[9];B[dd];W[ee]C[Keep continuation];B[ff])'));
    state().navigateToMove(1);
    const anchor = state().currentNode;
    const continuation = anchor.children[0]!;
    state().toggleInsertMode();
    state().playMove(0, 8);
    state().playMove(1, 8);
    const version = state().treeVersion;
    state().navigateByNodes(-2);
    expectPosition(anchor);
    expect(state().isInsertMode).toBe(true);
    expect(state().treeVersion).toBe(version + 2);
    expect(anchor.children).toEqual([continuation]);
    expect(continuation.note).toBe('Keep continuation');
  });
});

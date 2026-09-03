import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';
import type { GameNode } from '../src/types';

/**
 * The move tree, under randomized use.
 *
 * The store is 6,000 lines and sixteen of its actions rewrite the tree:
 * navigation, branch switching, promoting a variation to the main line,
 * deleting a node, pruning a branch, shifting a variation sideways. Each is
 * covered on its own elsewhere. What is not covered is what they do to each
 * other -- deleting the node a collapsed branch was hiding, promoting a branch
 * you have already navigated off, pruning back past the node the board is
 * drawing. A previous audit of this file found twelve bugs by reading it; this
 * looks for the thirteenth by driving it.
 *
 * Deliberately engine-free: `makeAiMove` and `runAnalysis` need a worker, and
 * the point here is the tree, not the search.
 */

const SIZE = 9;
const SEEDS = 40;
const STEPS = 400;

/** Seeded so a failure names a sequence that can be replayed exactly. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function walk(root: GameNode): GameNode[] {
  const out: GameNode[] = [];
  const stack = [root];
  let guard = 0;
  while (stack.length && guard++ < 20_000) {
    const node = stack.pop()!;
    out.push(node);
    for (const child of node.children) stack.push(child);
  }
  return out;
}

function checkInvariants(label: string): string[] {
  const state = useGameStore.getState();
  const problems: string[] = [];
  const nodes = walk(state.rootNode);

  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) problems.push(`${label}: duplicate node id ${node.id}`);
    ids.add(node.id);
    for (const child of node.children) {
      if (child.parent !== node) problems.push(`${label}: child ${child.id} has a broken parent link`);
    }
  }

  // The board draws `currentNode`, so it has to still be in the tree and still
  // be reachable by walking parents -- a delete that orphans it shows up here.
  let cursor: GameNode | null = state.currentNode;
  let depth = 0;
  const seen = new Set<string>();
  while (cursor && depth < 20_000) {
    if (seen.has(cursor.id)) {
      problems.push(`${label}: parent cycle at ${cursor.id}`);
      break;
    }
    seen.add(cursor.id);
    if (cursor === state.rootNode) break;
    cursor = cursor.parent;
    depth++;
  }
  if (cursor !== state.rootNode) problems.push(`${label}: currentNode is not reachable from the root`);
  if (!ids.has(state.currentNode.id)) problems.push(`${label}: currentNode is not in the tree`);

  // The three views of "where we are" must agree; they are separate fields, and
  // an action that updates one and forgets another is the failure this catches.
  if (state.board !== state.currentNode.gameState.board
    && JSON.stringify(state.board) !== JSON.stringify(state.currentNode.gameState.board)) {
    problems.push(`${label}: state.board differs from the current node's board`);
  }
  if (state.currentPlayer !== state.currentNode.gameState.currentPlayer) {
    problems.push(`${label}: currentPlayer ${state.currentPlayer} but node says ${state.currentNode.gameState.currentPlayer}`);
  }
  if (state.moveHistory.length !== depth) {
    problems.push(`${label}: moveHistory has ${state.moveHistory.length} entries at depth ${depth}`);
  }
  return problems;
}

describe('game store move-tree invariants', () => {
  beforeEach(() => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
  });

  afterAll(() => {
    useGameStore.getState().resetGame();
  });

  it('reports a corrupted tree, so a clean sweep means something', () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().startNewGame({ boardSize: SIZE, komi: 7, rules: 'chinese', handicap: 0 });
    useGameStore.getState().playMove(2, 2);
    useGameStore.getState().playMove(4, 4);
    expect(checkInvariants('healthy')).toEqual([]);

    const child = useGameStore.getState().rootNode.children[0]!;
    const saved = child.parent;
    (child as { parent: GameNode | null }).parent = null;
    expect(checkInvariants('corrupted').join(' ')).toMatch(/broken parent link|not reachable/);

    (child as { parent: GameNode | null }).parent = saved;
    expect(checkInvariants('restored')).toEqual([]);
  });

  it('holds through randomized navigation and editing', () => {
    const failures: string[] = [];
    /**
     * Weighted so the tree grows rather than being pruned flat: an even spread
     * over these sixteen left it at twenty nodes, because two of them delete.
     * As weighted it reaches ~138 nodes, depth 19 and 26 branch points, which
     * is where interactions between branch switching and deletion live.
     */
    const weights = [26, 4, 8, 8, 4, 6, 8, 3, 3, 3, 3, 3, 1, 1, 3, 3];
    const total = weights.reduce((a, b) => a + b, 0);

    for (let seed = 1; seed <= SEEDS && failures.length === 0; seed++) {
      const rand = rng(seed);
      useGameStore.getState().resetGame();
      useGameStore.getState().startNewGame({ boardSize: SIZE, komi: 7, rules: 'chinese', handicap: 0 });

      const actions: Array<() => void> = [
        () => {
          const state = useGameStore.getState();
          const x = Math.floor(rand() * SIZE);
          const y = Math.floor(rand() * SIZE);
          if (state.board[y]?.[x] === null) state.playMove(x, y);
        },
        () => useGameStore.getState().passTurn(),
        () => useGameStore.getState().navigateBack(),
        () => useGameStore.getState().navigateForward(),
        () => useGameStore.getState().undoMove(),
        () => useGameStore.getState().navigateToMove(Math.floor(rand() * 12)),
        () => useGameStore.getState().switchBranch(rand() < 0.5 ? 1 : -1),
        () => useGameStore.getState().navigateStart(),
        () => useGameStore.getState().navigateEnd(),
        () => useGameStore.getState().undoToBranchPoint(),
        () => useGameStore.getState().undoToMainBranch(),
        () => useGameStore.getState().makeCurrentNodeMainBranch(),
        () => useGameStore.getState().deleteCurrentNode(),
        () => useGameStore.getState().pruneCurrentBranch(),
        () => useGameStore.getState().toggleBranchCollapse(),
        () => useGameStore.getState().shiftCurrentVariation(rand() < 0.5 ? 'left' : 'right'),
      ];

      const pick = () => {
        let r = rand() * total;
        for (let i = 0; i < weights.length; i++) {
          r -= weights[i]!;
          if (r <= 0) return i;
        }
        return 0;
      };

      for (let step = 0; step < STEPS; step++) {
        const which = pick();
        try {
          actions[which]!();
        } catch (error) {
          failures.push(`seed ${seed} step ${step} action ${which} threw: ${(error as Error).message}`);
          break;
        }
        const problems = checkInvariants(`seed ${seed} step ${step} action ${which}`);
        if (problems.length > 0) {
          failures.push(...problems.slice(0, 3));
          break;
        }
      }
    }

    expect(failures, failures.slice(0, 6).join('\n')).toEqual([]);
  }, 300_000);
});

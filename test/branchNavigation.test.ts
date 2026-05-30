import { describe, expect, it } from 'vitest';
import type { GameNode, GameState, Move } from '../src/types';
import {
  findBranchRoot,
  findBranchTargetByIndex,
  findCurrentLineMoveTarget,
  findSiblingBranchTarget,
  getBranchInfo,
  getCurrentLineMoveCount,
} from '../src/utils/branchNavigation';

const makeState = (): GameState => ({
  board: [[null]],
  currentPlayer: 'black',
  moveHistory: [],
  capturedBlack: 0,
  capturedWhite: 0,
  komi: 6.5,
});

const makeNode = (id: string, parent: GameNode | null, move: Move | null = null): GameNode => {
  const node: GameNode = {
    id,
    parent,
    children: [],
    move,
    gameState: makeState(),
  };
  parent?.children.push(node);
  return node;
};

describe('branch navigation', () => {
  it('finds the nearest branch root and relative depth', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    const a1 = makeNode('a1', a, { x: 0, y: 0, player: 'white' });
    const a2 = makeNode('a2', a1, { x: 0, y: 0, player: 'black' });
    makeNode('b', root, { x: 0, y: 0, player: 'black' });

    expect(findBranchRoot(a)).toMatchObject({ forkNode: root, branchRootNode: a, depthFromBranchRoot: 0 });
    expect(findBranchRoot(a2)).toMatchObject({ forkNode: root, branchRootNode: a, depthFromBranchRoot: 2 });
  });

  it('switches sibling branches while preserving depth where possible', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    const a1 = makeNode('a1', a, { x: 0, y: 0, player: 'white' });
    const a2 = makeNode('a2', a1, { x: 0, y: 0, player: 'black' });
    const b = makeNode('b', root, { x: 0, y: 0, player: 'black' });
    makeNode('b1', b, { x: 0, y: 0, player: 'white' });

    expect(findSiblingBranchTarget(a, 1)?.id).toBe('b');
    expect(findSiblingBranchTarget(a1, 1)?.id).toBe('b1');
    expect(findSiblingBranchTarget(a2, 1)?.id).toBe('b1');
  });

  it('reports branch index and depth from the nearest fork', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    const a1 = makeNode('a1', a, { x: 0, y: 0, player: 'white' });
    const b = makeNode('b', root, { x: 0, y: 0, player: 'black' });

    expect(getBranchInfo(a)).toMatchObject({
      hasBranches: true,
      currentIndex: 1,
      totalBranches: 2,
      depthFromBranchRoot: 0,
      isAtFork: true,
    });
    expect(getBranchInfo(a1)).toMatchObject({
      hasBranches: true,
      currentIndex: 1,
      totalBranches: 2,
      depthFromBranchRoot: 1,
      isAtFork: false,
    });
    expect(getBranchInfo(b)).toMatchObject({
      hasBranches: true,
      currentIndex: 2,
      totalBranches: 2,
      depthFromBranchRoot: 0,
      isAtFork: true,
    });
  });

  it('wraps around sibling branches', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    const b = makeNode('b', root, { x: 0, y: 0, player: 'black' });

    expect(findSiblingBranchTarget(a, -1)?.id).toBe('b');
    expect(findSiblingBranchTarget(b, 1)?.id).toBe('a');
  });

  it('jumps to a numbered branch while preserving depth where possible', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    const a1 = makeNode('a1', a, { x: 0, y: 0, player: 'white' });
    const a2 = makeNode('a2', a1, { x: 0, y: 0, player: 'black' });
    const b = makeNode('b', root, { x: 0, y: 0, player: 'black' });
    makeNode('b1', b, { x: 0, y: 0, player: 'white' });
    makeNode('c', root, { x: 0, y: 0, player: 'black' });

    expect(findBranchTargetByIndex(a2, 2)?.id).toBe('b1');
    expect(findBranchTargetByIndex(a2, 3)?.id).toBe('c');
    expect(findBranchTargetByIndex(a2, 4)).toBeNull();
  });

  it('finds move targets on the current branch line', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    const a1 = makeNode('a1', a, { x: 0, y: 0, player: 'white' });
    const b = makeNode('b', root, { x: 0, y: 0, player: 'black' });
    const b1 = makeNode('b1', b, { x: 0, y: 0, player: 'white' });
    makeNode('b2', b1, { x: 0, y: 0, player: 'black' });

    expect(getCurrentLineMoveCount(b1)).toBe(3);
    expect(findCurrentLineMoveTarget(b1, 0)?.id).toBe('root');
    expect(findCurrentLineMoveTarget(b1, 1)?.id).toBe('b');
    expect(findCurrentLineMoveTarget(b1, 3)?.id).toBe('b2');
    expect(findCurrentLineMoveTarget(b1, 99)?.id).toBe('b2');
    expect(findCurrentLineMoveTarget(a1, 2)?.id).toBe('a1');
  });

  it('returns null when the current path has no sibling branch', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });

    expect(findSiblingBranchTarget(a, 1)).toBeNull();
  });
});

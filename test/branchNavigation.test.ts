import { describe, expect, it } from 'vitest';
import type { GameNode, GameState, Move } from '../src/types';
import {
  findBranchRoot,
  findBranchTargetByIndex,
  findCurrentLineMoveTarget,
  findCurrentLineNodeByPlayedMoves,
  findSiblingBranchTarget,
  getBranchInfo,
  getCurrentLineNodes,
  getCurrentLineMoveCount,
  getCurrentLineMoveNumber,
  isGameNodeStep,
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

const withPlayedMoves = (node: GameNode, playedMoves: number): GameNode => {
  node.gameState.moveHistory = Array.from({ length: playedMoves }, () => ({ x: 0, y: 0, player: 'black' }));
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
    expect(findBranchTargetByIndex(a2, 4)?.id).toBe('c');
    expect(findBranchTargetByIndex(a2, 0)?.id).toBe('a2');
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

  it('uses active branch preferences for current-line targets', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    makeNode('a1', a, { x: 0, y: 0, player: 'white' });
    const b = makeNode('b', root, { x: 0, y: 0, player: 'black' });
    const b1 = makeNode('b1', b, { x: 0, y: 0, player: 'white' });

    const active = { [root.id]: b.id, [b.id]: b1.id };
    expect(getCurrentLineMoveCount(root, active)).toBe(2);
    expect(findCurrentLineMoveTarget(root, 1, active)?.id).toBe('b');
    expect(findCurrentLineMoveTarget(root, 2, active)?.id).toBe('b1');
  });

  it('counts non-root setup nodes as current-line navigation steps', () => {
    const root = makeNode('root', null);
    const move = makeNode('move', root, { x: 0, y: 0, player: 'black' });
    const setup = makeNode('setup', move);
    setup.properties = { AB: ['aa'], PL: ['W'] };
    const reply = makeNode('reply', setup, { x: 0, y: 0, player: 'white' });

    expect(isGameNodeStep(root)).toBe(false);
    expect(isGameNodeStep(setup)).toBe(true);
    expect(getCurrentLineMoveCount(move)).toBe(3);
    expect(getCurrentLineMoveNumber(setup)).toBe(2);
    expect(getCurrentLineMoveNumber(reply)).toBe(3);
    expect(findCurrentLineMoveTarget(root, 2)?.id).toBe('setup');
  });

  it('builds a navigable current line from root through the active continuation', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });
    makeNode('a1', a, { x: 0, y: 0, player: 'white' });
    const b = makeNode('b', root, { x: 0, y: 0, player: 'black' });
    const b1 = makeNode('b1', b, { x: 0, y: 0, player: 'white' });
    makeNode('b2', b1, { x: 0, y: 0, player: 'black' });

    expect(getCurrentLineNodes(root).map((node) => node.id)).toEqual(['root', 'a', 'a1']);
    expect(getCurrentLineNodes(root, { [root.id]: b.id, [b.id]: b1.id }).map((node) => node.id)).toEqual(['root', 'b', 'b1', 'b2']);
  });

  it('resolves nodes by played-move count, treating setup nodes as transparent', () => {
    // Typical handicap SGF shape: setup stones precede the first move, so
    // step-based numbering (which counts them) diverges from move-history
    // indices. Click-to-jump must resolve against played moves.
    const root = withPlayedMoves(makeNode('root', null), 0);
    const setup = makeNode('setup', root);
    setup.properties = { AB: ['aa'], PL: ['W'] };
    withPlayedMoves(setup, 0);
    const move = withPlayedMoves(makeNode('move', setup, { x: 0, y: 0, player: 'black' }), 1);
    const reply = withPlayedMoves(makeNode('reply', move, { x: 1, y: 1, player: 'white' }), 2);

    expect(findCurrentLineNodeByPlayedMoves(reply, 1)?.id).toBe('move');
    expect(findCurrentLineNodeByPlayedMoves(reply, 2)?.id).toBe('reply');
    expect(findCurrentLineNodeByPlayedMoves(reply, 0)?.id).toBe('root');
    expect(findCurrentLineNodeByPlayedMoves(reply, 99)?.id).toBe('reply');
    expect(findCurrentLineNodeByPlayedMoves(reply, -1)).toBeNull();
    expect(findCurrentLineNodeByPlayedMoves(reply, 1.5)).toBeNull();
  });

  it('returns null when the current path has no sibling branch', () => {
    const root = makeNode('root', null);
    const a = makeNode('a', root, { x: 0, y: 0, player: 'black' });

    expect(findSiblingBranchTarget(a, 1)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import type { GameNode, GameState } from '../src/types';
import {
  countMoveTreeDescendants,
  expandAllMoveTreeBranches,
  expandCollapsedAncestors,
  getCollapsedAncestor,
  getMoveTreeBranchHead,
  getMoveTreeCollapseStatus,
  getMoveTreeCollapseTarget,
  hasCollapsedMoveTreeBranches,
  isCollapsedMoveTreeHead,
  isHiddenByCollapse,
  isNodeDescendantOf,
} from '../src/utils/moveTreeCollapse';
import { flattenMoveTree } from '../src/utils/moveTreeLayout';

const makeState = (): GameState => ({
  board: [[null]],
  currentPlayer: 'black',
  moveHistory: [],
  capturedBlack: 0,
  capturedWhite: 0,
  komi: 6.5,
});

let nextId = 0;
const node = (parent: GameNode | null): GameNode => {
  const created: GameNode = {
    id: `n${nextId++}`,
    parent,
    children: [],
    move: null,
    gameState: makeState(),
  };
  parent?.children.push(created);
  return created;
};

/**
 * root - a - b - c        (main line)
 *         \- d - e        (variation)
 */
const buildTree = () => {
  nextId = 0;
  const root = node(null);
  const a = node(root);
  const b = node(a);
  const c = node(b);
  const d = node(a);
  const e = node(d);
  return { root, a, b, c, d, e };
};

describe('countMoveTreeDescendants', () => {
  it('counts every node below, across branches', () => {
    const { root, a, d } = buildTree();
    expect(countMoveTreeDescendants(root)).toBe(5);
    expect(countMoveTreeDescendants(a)).toBe(4);
    expect(countMoveTreeDescendants(d)).toBe(1);
  });

  it('is zero at a leaf', () => {
    const { c } = buildTree();
    expect(countMoveTreeDescendants(c)).toBe(0);
  });
});

describe('getMoveTreeBranchHead', () => {
  it('walks up to the child of the branching point', () => {
    const { b, c, d, e } = buildTree();
    expect(getMoveTreeBranchHead(c)).toBe(b);
    expect(getMoveTreeBranchHead(b)).toBe(b);
    expect(getMoveTreeBranchHead(e)).toBe(d);
  });

  it('stops below the root rather than collapsing the whole game', () => {
    nextId = 0;
    const root = node(null);
    const first = node(root);
    const second = node(first);
    expect(getMoveTreeBranchHead(second)).toBe(first);
    expect(getMoveTreeBranchHead(root)).toBeNull();
  });
});

describe('getMoveTreeCollapseTarget', () => {
  it('targets the branch head from inside a variation', () => {
    const { b, c, d, e } = buildTree();
    expect(getMoveTreeCollapseTarget(c)).toBe(b);
    expect(getMoveTreeCollapseTarget(e)).toBe(d);
  });

  it('toggles an already-collapsed head back off', () => {
    const { b } = buildTree();
    b.collapsed = true;
    expect(getMoveTreeCollapseTarget(b)).toBe(b);
  });

  it('declines when there is nothing below to hide', () => {
    nextId = 0;
    const root = node(null);
    const only = node(root);
    expect(getMoveTreeCollapseTarget(only)).toBeNull();
    expect(getMoveTreeCollapseTarget(root)).toBeNull();
  });
});

describe('collapse ancestry helpers', () => {
  it('reports descendants and hidden nodes', () => {
    const { a, b, c, d } = buildTree();
    expect(isNodeDescendantOf(c, a)).toBe(true);
    expect(isNodeDescendantOf(c, d)).toBe(false);
    b.collapsed = true;
    expect(isCollapsedMoveTreeHead(b)).toBe(true);
    expect(isHiddenByCollapse(c)).toBe(true);
    expect(isHiddenByCollapse(b)).toBe(false);
    expect(getCollapsedAncestor(c)).toBe(b);
  });

  it('does not treat a childless collapsed node as a collapsed head', () => {
    const { c } = buildTree();
    c.collapsed = true;
    expect(isCollapsedMoveTreeHead(c)).toBe(false);
  });

  it('expands ancestors and the whole tree', () => {
    const { root, a, b, c } = buildTree();
    a.collapsed = true;
    b.collapsed = true;
    expect(expandCollapsedAncestors(c)).toBe(true);
    expect(a.collapsed).toBe(false);
    expect(b.collapsed).toBe(false);
    expect(expandCollapsedAncestors(c)).toBe(false);

    b.collapsed = true;
    expect(hasCollapsedMoveTreeBranches(root)).toBe(true);
    expect(expandAllMoveTreeBranches(root)).toBe(true);
    expect(hasCollapsedMoveTreeBranches(root)).toBe(false);
    expect(expandAllMoveTreeBranches(root)).toBe(false);
  });
});

describe('getMoveTreeCollapseStatus', () => {
  it('describes collapsing and expanding with the move count', () => {
    const { b, c } = buildTree();
    expect(getMoveTreeCollapseStatus(c)).toMatchObject({
      target: b,
      willCollapse: true,
      hiddenCount: 1,
      label: 'Collapse branch (1 move)',
    });
    b.collapsed = true;
    expect(getMoveTreeCollapseStatus(b)).toMatchObject({
      willCollapse: false,
      label: 'Expand branch (1 move)',
    });
  });

  it('falls back to a plain label when nothing can collapse', () => {
    const { root } = buildTree();
    expect(getMoveTreeCollapseStatus(root)).toMatchObject({ target: null, label: 'Collapse branch' });
  });
});

describe('flattenMoveTree with collapsed branches', () => {
  it('hides descendants and reports the hidden count on the head', () => {
    const { root, a } = buildTree();
    a.collapsed = true;
    const items = flattenMoveTree(root);
    expect(items.map((item) => item.id)).toEqual([root.id, a.id]);
    expect(items.find((item) => item.id === a.id)?.collapsedCount).toBe(4);
  });

  it('reopens a collapsed branch while the current move is inside it', () => {
    const { root, a, c } = buildTree();
    a.collapsed = true;
    const ancestors = new Set<string>();
    let cursor = c.parent;
    while (cursor) {
      ancestors.add(cursor.id);
      cursor = cursor.parent ?? null;
    }
    const items = flattenMoveTree(root, ancestors);
    expect(items).toHaveLength(6);
    expect(items.find((item) => item.id === a.id)?.collapsedCount).toBe(0);
  });

  it('keeps a collapsed head folded when the current move is the head itself', () => {
    const { root, a } = buildTree();
    a.collapsed = true;
    const items = flattenMoveTree(root, new Set([root.id]));
    expect(items).toHaveLength(2);
  });
});

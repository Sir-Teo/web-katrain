import type { GameNode } from '../types';

/**
 * Collapsing a branch in the move tree.
 *
 * KaTrain collapses the run of moves between the current node and the previous
 * branching point so long variations stop dominating the tree. We hang the flag
 * on the *head* of that run — the child of the branching point — and hide its
 * descendants, which is the familiar tree-view affordance and keeps the head
 * (and its move number) on screen as the handle to expand again.
 *
 * The flag is view state: it lives on the node, is never written to SGF, and
 * navigation that lands inside a collapsed run expands it again.
 */

/** Number of nodes below `node`, i.e. how many moves collapsing it would hide. */
export const countMoveTreeDescendants = (node: GameNode): number => {
  let count = 0;
  const stack: GameNode[] = [...node.children];
  while (stack.length > 0) {
    const next = stack.pop()!;
    count += 1;
    for (const child of next.children) stack.push(child);
  }
  return count;
};

/** True when this node is collapsed and actually hiding something. */
export const isCollapsedMoveTreeHead = (node: GameNode): boolean =>
  node.collapsed === true && node.children.length > 0;

/**
 * The head of the run containing `node`: walk up while each parent has exactly
 * one child, stopping at the first branching point (or the root).
 */
export const getMoveTreeBranchHead = (node: GameNode): GameNode | null => {
  if (!node.parent) return null;
  let head = node;
  while (head.parent && head.parent.parent && head.parent.children.length === 1) {
    head = head.parent;
  }
  return head;
};

/**
 * The node whose collapse flag a "collapse this branch" action should flip.
 *
 * Already-collapsed nodes toggle themselves so pressing the key twice is a
 * clean round trip. Otherwise it is the head of the current run, and only when
 * there is something below it worth hiding.
 */
export const getMoveTreeCollapseTarget = (node: GameNode): GameNode | null => {
  if (isCollapsedMoveTreeHead(node)) return node;
  const head = getMoveTreeBranchHead(node);
  if (!head) return null;
  if (head.collapsed === true) return head;
  return countMoveTreeDescendants(head) > 0 ? head : null;
};

/** True when `node` sits somewhere below `ancestor`. */
export const isNodeDescendantOf = (node: GameNode, ancestor: GameNode): boolean => {
  let current: GameNode | null = node.parent ?? null;
  while (current) {
    if (current.id === ancestor.id) return true;
    current = current.parent ?? null;
  }
  return false;
};

/** The nearest collapsed ancestor hiding `node`, if any. */
export const getCollapsedAncestor = (node: GameNode): GameNode | null => {
  let current: GameNode | null = node.parent ?? null;
  let hidden: GameNode | null = null;
  while (current) {
    if (current.collapsed === true) hidden = current;
    current = current.parent ?? null;
  }
  return hidden;
};

/** True when a collapsed ancestor is keeping `node` out of the tree view. */
export const isHiddenByCollapse = (node: GameNode): boolean => getCollapsedAncestor(node) !== null;

/**
 * Clear collapse flags on every ancestor of `node` so it becomes visible.
 * Returns true when something actually changed.
 */
export const expandCollapsedAncestors = (node: GameNode): boolean => {
  let changed = false;
  let current: GameNode | null = node.parent ?? null;
  while (current) {
    if (current.collapsed === true) {
      current.collapsed = false;
      changed = true;
    }
    current = current.parent ?? null;
  }
  return changed;
};

/** Clear every collapse flag in the tree. Returns true when something changed. */
export const expandAllMoveTreeBranches = (root: GameNode): boolean => {
  let changed = false;
  const stack: GameNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.collapsed === true) {
      node.collapsed = false;
      changed = true;
    }
    for (const child of node.children) stack.push(child);
  }
  return changed;
};

/** True when any node in the tree is currently collapsed. */
export const hasCollapsedMoveTreeBranches = (root: GameNode): boolean => {
  const stack: GameNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isCollapsedMoveTreeHead(node)) return true;
    for (const child of node.children) stack.push(child);
  }
  return false;
};

export type MoveTreeCollapseStatus = {
  /** The node the action would flip, or null when there is nothing to collapse. */
  target: GameNode | null;
  /** Whether that flip would collapse (true) or expand (false). */
  willCollapse: boolean;
  /** How many moves are hidden, or would be. */
  hiddenCount: number;
  /** Button/menu wording for the current state. */
  label: string;
};

export const getMoveTreeCollapseStatus = (node: GameNode): MoveTreeCollapseStatus => {
  const target = getMoveTreeCollapseTarget(node);
  if (!target) {
    return { target: null, willCollapse: false, hiddenCount: 0, label: 'Collapse branch' };
  }
  const willCollapse = target.collapsed !== true;
  const hiddenCount = countMoveTreeDescendants(target);
  const moves = `${hiddenCount} move${hiddenCount === 1 ? '' : 's'}`;
  return {
    target,
    willCollapse,
    hiddenCount,
    label: willCollapse ? `Collapse branch (${moves})` : `Expand branch (${moves})`,
  };
};

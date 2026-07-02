import type { GameNode } from '../types';

// A pinned variation records a stable route from the root to a node so it can be
// recalled later. GameNode.id is random per load, so we store the child-index
// path (deterministic for a given tree) plus a cached label/move number.
export interface PinnedVariation {
  id: string;
  label: string;
  path: number[]; // child index at each step from root to the node
  moveNumber: number;
  createdAt: number;
}

/** Child-index path from the root down to `node` (root itself => []). */
export function getNodePath(node: GameNode): number[] {
  const path: number[] = [];
  let current: GameNode | null = node;
  while (current && current.parent) {
    const idx = current.parent.children.indexOf(current);
    path.push(idx < 0 ? 0 : idx);
    current = current.parent;
  }
  return path.reverse();
}

/** Resolve a child-index path back to a node within `root`, or null if it no longer exists. */
export function resolveNodePath(root: GameNode, path: number[]): GameNode | null {
  let current: GameNode = root;
  for (const idx of path) {
    const next = current.children[idx];
    if (!next) return null;
    current = next;
  }
  return current;
}

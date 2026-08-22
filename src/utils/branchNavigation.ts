import type { GameNode } from '../types';

export type ActiveBranchMap = Record<string, string>;

type BranchRoot = {
  forkNode: GameNode;
  branchRootNode: GameNode;
  depthFromBranchRoot: number;
};

export type BranchInfo = {
  hasBranches: boolean;
  currentIndex: number;
  totalBranches: number;
  depthFromBranchRoot: number;
  isAtFork: boolean;
};

const STEP_SETUP_PROPERTIES = ['AB', 'AW', 'AE'] as const;

export function isGameNodeStep(node: GameNode): boolean {
  if (node.move) return true;
  if (!node.parent) return false;
  return STEP_SETUP_PROPERTIES.some((key) => (node.properties?.[key]?.length ?? 0) > 0);
}

export function findBranchRoot(currentNode: GameNode): BranchRoot | null {
  let node: GameNode | null = currentNode;
  let depthFromBranchRoot = 0;

  while (node?.parent) {
    const parent: GameNode = node.parent;
    if (parent.children.length > 1) {
      return { forkNode: parent, branchRootNode: node, depthFromBranchRoot };
    }

    if (isGameNodeStep(node)) depthFromBranchRoot++;
    node = parent;
  }

  return null;
}

export function rememberActiveBranchPath(activeBranches: ActiveBranchMap, node: GameNode): ActiveBranchMap {
  const next = { ...activeBranches };
  let cursor: GameNode | null = node;
  while (cursor?.parent) {
    next[cursor.parent.id] = cursor.id;
    cursor = cursor.parent;
  }
  return next;
}

export function getActiveChild(node: GameNode, activeBranches: ActiveBranchMap = {}): GameNode | null {
  if (node.children.length === 0) return null;
  const preferredId = activeBranches[node.id];
  if (preferredId) {
    const preferred = node.children.find((child) => child.id === preferredId);
    if (preferred) return preferred;
  }
  return node.children[0] ?? null;
}

export function getBranchInfo(currentNode: GameNode): BranchInfo {
  const branch = findBranchRoot(currentNode);
  if (!branch) {
    return {
      hasBranches: false,
      currentIndex: 0,
      totalBranches: 0,
      depthFromBranchRoot: 0,
      isAtFork: false,
    };
  }

  const totalBranches = branch.forkNode.children.length;
  const currentIndex = branch.forkNode.children.findIndex((node) => node.id === branch.branchRootNode.id);
  return {
    hasBranches: totalBranches > 1 && currentIndex >= 0,
    currentIndex: currentIndex >= 0 ? currentIndex + 1 : 0,
    totalBranches,
    depthFromBranchRoot: branch.depthFromBranchRoot,
    isAtFork: branch.depthFromBranchRoot === 0,
  };
}

export function findSiblingBranchTarget(currentNode: GameNode, direction: 1 | -1): GameNode | null {
  const branch = findBranchRoot(currentNode);
  if (!branch) return null;

  const siblings = branch.forkNode.children;
  if (siblings.length <= 1) return null;

  const currentIndex = siblings.findIndex((node) => node.id === branch.branchRootNode.id);
  if (currentIndex < 0) return null;

  const targetIndex = (currentIndex + direction + siblings.length) % siblings.length;
  let target = siblings[targetIndex] ?? null;
  if (!target) return null;

  let depth = 0;
  while (depth < branch.depthFromBranchRoot && target.children.length > 0) {
    const next = target.children[0] ?? null;
    if (!next) break;
    target = next;
    if (isGameNodeStep(target)) depth++;
  }

  return target;
}

export function findBranchTargetByIndex(currentNode: GameNode, branchIndex: number): GameNode | null {
  if (!Number.isFinite(branchIndex)) return null;
  const branch = findBranchRoot(currentNode);
  if (!branch) return null;

  const siblings = branch.forkNode.children;
  if (siblings.length === 0) return null;
  const targetIndex = Math.max(0, Math.min(Math.floor(branchIndex) - 1, siblings.length - 1));
  const targetRoot = siblings[targetIndex] ?? null;
  if (!targetRoot) return null;

  let target = targetRoot;
  let depth = 0;
  while (depth < branch.depthFromBranchRoot && target.children.length > 0) {
    const next = target.children[0] ?? null;
    if (!next) break;
    target = next;
    if (isGameNodeStep(target)) depth++;
  }

  return target;
}

export function getCurrentLineNodes(currentNode: GameNode, activeBranches: ActiveBranchMap = {}): GameNode[] {
  const path: GameNode[] = [];
  let node: GameNode | null = currentNode;
  while (node) {
    path.push(node);
    node = node.parent;
  }
  path.reverse();

  node = getActiveChild(currentNode, activeBranches);
  while (node) {
    path.push(node);
    node = getActiveChild(node, activeBranches);
  }

  return path;
}

export function getCurrentLineMoveCount(currentNode: GameNode, activeBranches: ActiveBranchMap = {}): number {
  return getCurrentLineNodes(currentNode, activeBranches).filter(isGameNodeStep).length;
}

export function getCurrentLineMoveNumber(currentNode: GameNode): number {
  let count = 0;
  const path: GameNode[] = [];
  let node: GameNode | null = currentNode;
  while (node) {
    path.push(node);
    node = node.parent;
  }
  path.reverse();
  for (const pathNode of path) {
    if (isGameNodeStep(pathNode)) count++;
  }
  return count;
}

export function findCurrentLineMoveTarget(
  currentNode: GameNode,
  moveNumber: number,
  activeBranches: ActiveBranchMap = {}
): GameNode | null {
  if (!Number.isFinite(moveNumber)) return null;
  const targetMoveNumber = Math.max(0, Math.floor(moveNumber));
  let seenMoves = 0;
  let lastNode: GameNode | null = null;

  for (const node of getCurrentLineNodes(currentNode, activeBranches)) {
    lastNode = node;
    if (isGameNodeStep(node)) seenMoves++;
    if (seenMoves === targetMoveNumber) return node;
  }

  return lastNode;
}

/**
 * Resolves a node by its count of actually played moves (moveHistory length),
 * ignoring setup nodes. Use this when a move number comes from move history
 * data (e.g. the stone placement grid) rather than from step-based UI labels.
 */
export function findCurrentLineNodeByPlayedMoves(
  currentNode: GameNode,
  playedMoves: number,
  activeBranches: ActiveBranchMap = {}
): GameNode | null {
  if (!Number.isInteger(playedMoves) || playedMoves < 0) return null;
  let best: GameNode | null = null;

  for (const node of getCurrentLineNodes(currentNode, activeBranches)) {
    const count = node.gameState.moveHistory.length;
    if (count === playedMoves) return node;
    if (count > playedMoves) break;
    best = node;
  }

  return best;
}

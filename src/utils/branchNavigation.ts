import type { GameNode } from '../types';

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

export function findBranchRoot(currentNode: GameNode): BranchRoot | null {
  let node: GameNode | null = currentNode;
  let depthFromBranchRoot = 0;

  while (node?.parent) {
    const parent: GameNode = node.parent;
    if (parent.children.length > 1) {
      return { forkNode: parent, branchRootNode: node, depthFromBranchRoot };
    }

    if (node.move) depthFromBranchRoot++;
    node = parent;
  }

  return null;
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
    if (target.move) depth++;
  }

  return target;
}

export function findBranchTargetByIndex(currentNode: GameNode, branchIndex: number): GameNode | null {
  const branch = findBranchRoot(currentNode);
  if (!branch) return null;

  const targetIndex = Math.floor(branchIndex) - 1;
  const targetRoot = branch.forkNode.children[targetIndex] ?? null;
  if (!targetRoot) return null;

  let target = targetRoot;
  let depth = 0;
  while (depth < branch.depthFromBranchRoot && target.children.length > 0) {
    const next = target.children[0] ?? null;
    if (!next) break;
    target = next;
    if (target.move) depth++;
  }

  return target;
}

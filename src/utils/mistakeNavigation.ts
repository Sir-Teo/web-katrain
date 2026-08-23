import type { GameNode } from '../types';
import { getActiveChild, type ActiveBranchMap } from './branchNavigation';

export type MistakeNavigationDirection = 'undo' | 'redo';

export function isMistakeNode(node: GameNode, threshold: number): boolean {
  const move = node.move;
  const parentAnalysis = node.parent?.analysis;
  if (!move || !parentAnalysis || move.x < 0 || move.y < 0) return false;

  const candidate = parentAnalysis.moves.find((item) => item.x === move.x && item.y === move.y);
  return (candidate?.pointsLost ?? 5) >= threshold;
}

export function findMistakeNavigationTarget(args: {
  currentNode: GameNode;
  direction: MistakeNavigationDirection;
  activeBranchChildIds?: ActiveBranchMap;
  threshold: number;
}): GameNode | null {
  const { currentNode, direction, activeBranchChildIds = {}, threshold } = args;
  let node: GameNode | null = currentNode;

  if (direction === 'redo') {
    while (node.children.length > 0) {
      const next = getActiveChild(node, activeBranchChildIds);
      if (!next) break;
      if (isMistakeNode(next, threshold)) return node.id === currentNode.id ? null : node;
      node = next;
    }
    return null;
  }

  while (node.parent) {
    if (isMistakeNode(node, threshold)) return node.parent;
    node = node.parent;
  }
  return null;
}

export function getMistakeNavigationAvailability(args: {
  currentNode: GameNode;
  activeBranchChildIds?: ActiveBranchMap;
  threshold: number;
}): { previous: boolean; next: boolean } {
  return {
    previous: findMistakeNavigationTarget({ ...args, direction: 'undo' }) !== null,
    next: findMistakeNavigationTarget({ ...args, direction: 'redo' }) !== null,
  };
}

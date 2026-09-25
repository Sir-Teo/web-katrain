import type { GameNode } from '../types';
import { getActiveChild, type ActiveBranchMap } from './branchNavigation';
import { computeNodePointsLost } from './nodeAnalysis';

export type MistakeNavigationDirection = 'undo' | 'redo';

/**
 * Points lost as the rest of the app measures them -- the board, graph and
 * drill use `computeNodePointsLost`, which prefers the score change across the
 * move. Reading only the parent's candidate list, and assuming 5 for a move
 * not on it, stopped on moves the graph showed as fine and skipped ones it
 * marked as blunders.
 */
export function isMistakeNode(node: GameNode, threshold: number): boolean {
  const move = node.move;
  if (!move || !node.parent?.analysis || move.x < 0 || move.y < 0) return false;
  const lost = computeNodePointsLost(node);
  return lost !== null && lost >= threshold;
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
    // Like KaTrain's redo, the first step is always taken. Navigation stops on
    // the position before a mistake, so the move just ahead is usually the
    // mistake it stopped for; checking it again returned nothing, and a second
    // press could never reach the next one.
    let first = true;
    while (node.children.length > 0) {
      const next = getActiveChild(node, activeBranchChildIds);
      if (!next) break;
      if (!first && isMistakeNode(next, threshold)) return node;
      first = false;
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

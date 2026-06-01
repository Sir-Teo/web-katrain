import type { GameNode } from '../types';
import { computeNodePointsLost } from './nodeAnalysis';

export type MoveTreeNodeMarker = 'mistake' | 'note' | 'analysis';

export const MOVE_TREE_NODE_MARKER_LABELS: Record<MoveTreeNodeMarker, string> = {
  mistake: 'Mistake',
  note: 'Comment',
  analysis: 'Analysis',
};

export function getMoveTreeNodeMarkers(
  node: GameNode | undefined,
  mistakeThreshold: number
): MoveTreeNodeMarker[] {
  if (!node) return [];
  const markers: MoveTreeNodeMarker[] = [];
  const pointsLost = computeNodePointsLost(node);
  if (typeof pointsLost === 'number' && pointsLost >= mistakeThreshold) {
    markers.push('mistake');
  }
  if (node.note?.trim()) {
    markers.push('note');
  }
  if (node.analysis) {
    markers.push('analysis');
  }
  return markers;
}

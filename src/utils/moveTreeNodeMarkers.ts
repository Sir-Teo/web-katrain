import type { GameNode } from '../types';
import { computeNodePointsLost } from './nodeAnalysis';

export type MoveTreeNodeMarker = 'blunder' | 'mistake' | 'setup' | 'best' | 'note' | 'analysis';

export const MOVE_TREE_NODE_MARKER_LABELS: Record<MoveTreeNodeMarker, string> = {
  blunder: 'Blunder',
  mistake: 'Mistake',
  setup: 'Set-up move',
  best: 'Top move',
  note: 'Comment',
  analysis: 'Analysis',
};

// A follow-up losing this many points marks the prior move as a "set-up" (the
// opponent blundered right after — a trap that paid off).
export const SETUP_MOVE_LOSS = 5;
// Losses at/above this are their own, more severe tier than a plain mistake.
export const BLUNDER_LOSS = 6;

function playedTopMove(node: GameNode): boolean {
  const move = node.move;
  const parentMoves = node.parent?.analysis?.moves;
  if (!move || move.x < 0 || move.y < 0 || !parentMoves || parentMoves.length === 0) return false;
  const best = parentMoves.find((m) => m.order === 0) ?? parentMoves[0];
  return !!best && best.x === move.x && best.y === move.y;
}

export function getMoveTreeNodeMarkers(
  node: GameNode | undefined,
  mistakeThreshold: number
): MoveTreeNodeMarker[] {
  if (!node) return [];
  const markers: MoveTreeNodeMarker[] = [];
  const pointsLost = computeNodePointsLost(node);
  if (typeof pointsLost === 'number' && pointsLost >= Math.max(mistakeThreshold, BLUNDER_LOSS)) {
    markers.push('blunder');
  } else if (typeof pointsLost === 'number' && pointsLost >= mistakeThreshold) {
    markers.push('mistake');
  } else if (playedTopMove(node)) {
    // Only celebrate the top move when it wasn't itself a mistake.
    markers.push('best');
  }

  // Set-up: the move actually played after this one (main line) was a blunder.
  const nextPlayed = node.children[0];
  if (nextPlayed) {
    const nextLoss = computeNodePointsLost(nextPlayed);
    if (typeof nextLoss === 'number' && nextLoss >= SETUP_MOVE_LOSS) {
      markers.push('setup');
    }
  }

  if (node.note?.trim()) {
    markers.push('note');
  }
  if (node.analysis) {
    markers.push('analysis');
  }
  return markers;
}

/**
 * The markers that say something about how good the move was, in the order a
 * reader cares about them. `note` and `analysis` are excluded: they describe
 * what the node carries, not how the move played.
 */
export type MoveQualityMarker = Extract<MoveTreeNodeMarker, 'blunder' | 'mistake' | 'setup' | 'best'>;

const MOVE_QUALITY_PRIORITY: readonly MoveQualityMarker[] = ['blunder', 'mistake', 'setup', 'best'];

/**
 * The single most notable quality marker for a node, for surfaces with room for
 * one mark rather than the tree's row of them -- the move list, most of all,
 * which is the default view on a phone.
 */
export function getPrimaryMoveQualityMarker(
  node: GameNode | undefined,
  mistakeThreshold: number
): MoveQualityMarker | null {
  const markers = getMoveTreeNodeMarkers(node, mistakeThreshold);
  for (const candidate of MOVE_QUALITY_PRIORITY) {
    if (markers.includes(candidate)) return candidate;
  }
  return null;
}

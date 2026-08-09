import type { GameNode } from '../types';
import { computeNodePointsLost } from './nodeAnalysis';
import { BLUNDER_LOSS, SETUP_MOVE_LOSS } from './moveTreeNodeMarkers';

// One-shot board animations played when landing on a notable move:
// a floating score-loss pill on mistakes/blunders, and a short sparkle on
// "set-up" moves (the reply actually played lost big — the trap paid off).
export type MoveAnimationSpec =
  | { kind: 'score-loss'; label: string; severe: boolean }
  | { kind: 'sparkle' };

export function getMoveAnimation(node: GameNode, mistakeThreshold: number): MoveAnimationSpec | null {
  const move = node.move;
  if (!move || move.x < 0 || move.y < 0 || !node.parent) return null;

  const pointsLost = computeNodePointsLost(node);
  if (typeof pointsLost === 'number' && pointsLost >= mistakeThreshold) {
    return {
      kind: 'score-loss',
      label: `−${pointsLost.toFixed(1)}`,
      severe: pointsLost >= Math.max(mistakeThreshold, BLUNDER_LOSS),
    };
  }

  const nextPlayed = node.children[0];
  if (nextPlayed) {
    const nextLoss = computeNodePointsLost(nextPlayed);
    if (typeof nextLoss === 'number' && nextLoss >= SETUP_MOVE_LOSS) {
      return { kind: 'sparkle' };
    }
  }
  return null;
}

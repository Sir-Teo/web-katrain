import type { GameNode } from '../types';

/** Main-line nodes that actually hold a position worth reading. */
export function collectQuizPositions(root: GameNode): GameNode[] {
  const positions: GameNode[] = [];
  let node: GameNode | null = root;
  while (node) {
    if (node.gameState.moveHistory.length > 0) positions.push(node);
    node = node.children[0] ?? null;
  }
  return positions;
}

/**
 * Positions the quiz is willing to jump to.
 *
 * Score judgement only means much once a game has some shape, so mid/late-game
 * positions are preferred — but the cutoff is a fraction of the game's own
 * length, never its full length, or short games collapse to a single candidate
 * and "Random position" stops being random.
 */
export function selectQuizPositionPool(positions: GameNode[]): GameNode[] {
  if (positions.length === 0) return [];
  const cutoff = Math.min(20, Math.floor(positions.length / 2));
  const candidates = positions.filter((n) => n.gameState.moveHistory.length >= cutoff);
  return candidates.length > 0 ? candidates : positions;
}

/** The pool minus the position already on screen, so a jump actually moves. */
export function selectQuizJumpCandidates(positions: GameNode[], currentNodeId: string): GameNode[] {
  const pool = selectQuizPositionPool(positions);
  const fresh = pool.filter((n) => n.id !== currentNodeId);
  return fresh.length > 0 ? fresh : pool;
}

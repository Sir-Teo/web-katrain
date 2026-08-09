import type { CandidateMove } from '../types';

export const COMPACT_ANALYSIS_HINT_LIMIT = 5;
export const COMPACT_ANALYSIS_CELL_SIZE = 24;

export function usesCompactAnalysisHints(cellSize: number): boolean {
  return cellSize < COMPACT_ANALYSIS_CELL_SIZE;
}

export function selectAnalysisHintMoves(
  moves: readonly CandidateMove[],
  compact: boolean,
  limit = COMPACT_ANALYSIS_HINT_LIMIT
): CandidateMove[] {
  const legalMoves = moves.filter((move) => move.x >= 0 && move.y >= 0);
  if (!compact) return legalMoves;

  return [...legalMoves]
    .sort((a, b) => a.order - b.order || b.visits - a.visits)
    .slice(0, Math.max(0, limit));
}

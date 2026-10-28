import type { CandidateMove } from '../types';

/** A hover selects a coordinate; its values and PV belong to the latest search. */
export function resolveCandidatePreview(selection: Pick<CandidateMove, 'x' | 'y'> | null, candidates: readonly CandidateMove[] | null | undefined): CandidateMove | null {
  return selection ? candidates?.find(move => move.x === selection.x && move.y === selection.y) ?? null : null;
}

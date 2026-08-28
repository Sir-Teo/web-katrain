import type { FloatArray } from '../../types';

/** Just the buffer-bearing part of an analysis payload. */
export interface AnalysisTransferSource {
  ownership?: FloatArray;
  ownershipStdev?: FloatArray;
  policy?: FloatArray;
  humanPolicy?: FloatArray;
  moves: ReadonlyArray<{ ownership?: FloatArray }>;
}

/**
 * The buffers behind an analysis payload, each named exactly once.
 *
 * A transfer list may not name the same ArrayBuffer twice: `postMessage`
 * rejects that with `DataCloneError: Duplicate transferable for structured
 * clone`, which fails the whole analysis rather than the one move that
 * aliased. The payload can legitimately alias. When the search will not be
 * reused `getAnalysis` skips cloning and hands back the tree's own arrays, and
 * graph search lets a transposition put two root edges on one child node — so
 * two moves in the same top-K carry the identical ownership array, which is
 * the correct answer for two moves that reach the same position.
 *
 * Deduping keeps the payload whole: structured clone rebuilds every view over
 * the single transferred buffer, so the receiver still sees both moves'
 * ownership, still sharing one buffer the way the worker had it.
 */
export function collectAnalysisTransferables(analysis: AnalysisTransferSource): Transferable[] {
  const seen = new Set<ArrayBufferLike>();
  const transfer: Transferable[] = [];
  const push = (value?: unknown) => {
    if (!value || !ArrayBuffer.isView(value)) return;
    const { buffer } = value;
    if (seen.has(buffer)) return;
    seen.add(buffer);
    transfer.push(buffer as ArrayBuffer);
  };
  push(analysis.ownership);
  push(analysis.ownershipStdev);
  push(analysis.policy);
  push(analysis.humanPolicy);
  for (const move of analysis.moves) push(move.ownership);
  return transfer;
}

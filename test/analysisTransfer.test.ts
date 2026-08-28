import { describe, expect, it } from 'vitest';

import { collectAnalysisTransferables } from '../src/engine/katago/analysisTransfer';

function payload(overrides: Partial<Parameters<typeof collectAnalysisTransferables>[0]> = {}) {
  return {
    ownership: new Float32Array(361),
    ownershipStdev: new Float32Array(361),
    policy: new Float32Array(362),
    moves: [],
    ...overrides,
  };
}

describe('collectAnalysisTransferables', () => {
  it('lists every distinct buffer once', () => {
    const transfer = collectAnalysisTransferables(
      payload({ moves: [{ ownership: new Float32Array(361) }, { ownership: new Float32Array(361) }] })
    );
    expect(transfer).toHaveLength(5);
    expect(new Set(transfer).size).toBe(5);
  });

  it('names a buffer once when a transposition puts two moves on one child node', () => {
    // Graph search reaches the same position from two root edges, so both moves
    // hand back the identical ownership array. postMessage rejects a transfer
    // list that repeats a buffer with "Duplicate transferable for structured
    // clone", which failed the whole analysis rather than the aliased move.
    const shared = new Float32Array(361);
    const transfer = collectAnalysisTransferables(
      payload({ moves: [{ ownership: shared }, { ownership: shared }] })
    );
    expect(transfer.filter((buffer) => buffer === shared.buffer)).toHaveLength(1);
    expect(new Set(transfer).size).toBe(transfer.length);
  });

  it('names a buffer once when the payload reuses the tree ownership for a move', () => {
    const shared = new Float32Array(361);
    const transfer = collectAnalysisTransferables(
      payload({ ownership: shared, moves: [{ ownership: shared }] })
    );
    expect(new Set(transfer).size).toBe(transfer.length);
    expect(transfer).toContain(shared.buffer);
  });

  it('deduplicates views that share one buffer at different offsets', () => {
    const buffer = new ArrayBuffer(361 * 4 * 2);
    const transfer = collectAnalysisTransferables(
      payload({
        ownership: new Float32Array(buffer, 0, 361),
        ownershipStdev: new Float32Array(buffer, 361 * 4, 361),
      })
    );
    expect(transfer.filter((entry) => entry === buffer)).toHaveLength(1);
  });

  it('skips absent buffers and plain-array payloads', () => {
    const transfer = collectAnalysisTransferables({
      ownership: [0, 1, 2],
      policy: new Float32Array(362),
      moves: [{ ownership: undefined }, {}],
    });
    expect(transfer).toHaveLength(1);
  });

  it('survives a payload that transfers nothing', () => {
    expect(collectAnalysisTransferables({ moves: [] })).toEqual([]);
  });
});

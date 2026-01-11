import { describe, it, expect } from 'vitest';
import { parseKataGoModelV8 } from '../src/engine/katago/loadModelV8';

const encoder = new TextEncoder();

function makeMinimalModelBytes(modelVersion: number): Uint8Array {
  // Enough structure to reach past the modelVersion check for v13+ models, then fail due to EOF later.
  const header = `model ${modelVersion} 22 19 20 20 20 20 40 0.25 150 trunk 0 0 0 0 0 0 conv1 1 1 1 1 1 1 @BIN@`;
  const headerBytes = encoder.encode(header);
  const out = new Uint8Array(headerBytes.length + 4); // 1 float weight (4 bytes) after @BIN@
  out.set(headerBytes);
  return out;
}

describe('KataGo model version support', () => {
  it('accepts modelVersion 14', () => {
    const data = makeMinimalModelBytes(14);
    expect(() => parseKataGoModelV8(data)).toThrowError(/Unexpected EOF/);
  });

  it('rejects modelVersion 15', () => {
    const data = makeMinimalModelBytes(15);
    expect(() => parseKataGoModelV8(data)).toThrowError(/Unsupported modelVersion 15/);
  });
});


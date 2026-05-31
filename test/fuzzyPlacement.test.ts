import { describe, expect, it } from 'vitest';
import { fuzzyStoneOffset } from '../src/utils/fuzzyPlacement';

describe('fuzzyStoneOffset', () => {
  it('returns no offset when disabled', () => {
    expect(fuzzyStoneOffset(19, 3, 3, false)).toEqual({ dxFactor: 0, dyFactor: 0 });
  });

  it('is stable for the same board point', () => {
    expect(fuzzyStoneOffset(19, 4, 10, true)).toEqual(fuzzyStoneOffset(19, 4, 10, true));
  });

  it('keeps offsets subtle', () => {
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 19; x++) {
        const offset = fuzzyStoneOffset(19, x, y, true);
        expect(Math.abs(offset.dxFactor)).toBeLessThanOrEqual(0.08);
        expect(Math.abs(offset.dyFactor)).toBeLessThanOrEqual(0.08);
      }
    }
  });
});

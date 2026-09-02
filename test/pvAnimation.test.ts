import { describe, expect, it } from 'vitest';
import { getPvAnimationProgress } from '../src/utils/pvAnimation';

describe('PV animation timing', () => {
  it('shows the first move immediately and sleeps until the next move boundary', () => {
    expect(getPvAnimationProgress(0, 500, 5)).toEqual({ upToMove: 0, nextDelayMs: 500 });
    expect(getPvAnimationProgress(499, 500, 5)).toEqual({ upToMove: 0, nextDelayMs: 1 });
  });

  it('catches up by whole moves when a background tab delays its timer', () => {
    expect(getPvAnimationProgress(1_250, 500, 5)).toEqual({ upToMove: 2, nextDelayMs: 250 });
  });

  it('stops scheduling as soon as the final picture is visible', () => {
    expect(getPvAnimationProgress(2_000, 500, 5)).toEqual({ upToMove: 4, nextDelayMs: null });
    expect(getPvAnimationProgress(0, 500, 1)).toEqual({ upToMove: 0, nextDelayMs: null });
  });

  it('normalizes invalid negative timing inputs', () => {
    expect(getPvAnimationProgress(-10, 0, 3)).toEqual({ upToMove: 0, nextDelayMs: 1 });
  });
});

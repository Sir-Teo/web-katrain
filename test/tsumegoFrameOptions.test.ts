import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TSUMEGO_FRAME_DEFAULT_MARGIN,
  TSUMEGO_FRAME_MAX_MARGIN,
  TSUMEGO_FRAME_MIN_MARGIN,
  clampTsumegoFrameMargin,
} from '../src/utils/tsumegoFrameOptions';

describe('clampTsumegoFrameMargin', () => {
  it('keeps a margin the frame can use', () => {
    expect(clampTsumegoFrameMargin(TSUMEGO_FRAME_MIN_MARGIN)).toBe(TSUMEGO_FRAME_MIN_MARGIN);
    expect(clampTsumegoFrameMargin(TSUMEGO_FRAME_MAX_MARGIN)).toBe(TSUMEGO_FRAME_MAX_MARGIN);
    expect(clampTsumegoFrameMargin(4)).toBe(4);
  });

  it('pulls anything outside the bounds back in', () => {
    expect(clampTsumegoFrameMargin(-5)).toBe(TSUMEGO_FRAME_MIN_MARGIN);
    expect(clampTsumegoFrameMargin(99)).toBe(TSUMEGO_FRAME_MAX_MARGIN);
  });

  it('rounds a slider value that arrives fractional', () => {
    expect(clampTsumegoFrameMargin(3.4)).toBe(3);
    expect(clampTsumegoFrameMargin(3.6)).toBe(4);
  });

  it('falls back rather than passing a non-number through', () => {
    // The frame does `iMin - margin` with no range of its own, so NaN here
    // would produce a frame at NaN and a board of nothing.
    expect(clampTsumegoFrameMargin(Number.NaN)).toBe(TSUMEGO_FRAME_DEFAULT_MARGIN);
    expect(clampTsumegoFrameMargin(Number.POSITIVE_INFINITY)).toBe(TSUMEGO_FRAME_DEFAULT_MARGIN);
  });
});

describe('the bounds are held where the module says they are', () => {
  it('is applied by the store as well as the dialog', () => {
    // The module's own comment calls itself shared by UI and store. It was not:
    // the dialog clamped and the store took whatever it was handed.
    expect(readFileSync('src/components/TsumegoFrameModal.tsx', 'utf8'))
      .toContain('clampTsumegoFrameMargin');
    expect(readFileSync('src/store/gameStore.ts', 'utf8'))
      .toContain('margin: clampTsumegoFrameMargin(margin),');
  });
});

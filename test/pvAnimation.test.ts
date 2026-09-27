import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getPvAnimationProgress, getPvVisibleLength, isPvAnimated } from '../src/utils/pvAnimation';

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

describe('PV Animation Moves', () => {
  // Saved in Settings and never read: a variation always played out in full.
  it('caps the moves laid on the board', () => {
    expect(getPvVisibleLength(12, 5)).toBe(5);
    expect(getPvVisibleLength(3, 5)).toBe(3);
    expect(getPvVisibleLength(12, 100)).toBe(12);
    // The animation then stops at the cap.
    expect(getPvAnimationProgress(60_000, 500, getPvVisibleLength(12, 5))).toEqual({ upToMove: 4, nextDelayMs: null });
  });

  it('shows the whole sequence at once for 0, as its help text says', () => {
    expect(getPvVisibleLength(12, 0)).toBe(12);
    expect(isPvAnimated(0.5, 0)).toBe(false);
    expect(isPvAnimated(0.5, 5)).toBe(true);
    // PV Animation Time 0 still disables animation on its own.
    expect(isPvAnimated(0, 5)).toBe(false);
    // An unset or broken value is no cap.
    expect(getPvVisibleLength(12, Number.NaN)).toBe(12);
    expect(isPvAnimated(0.5, undefined)).toBe(true);
  });

  it('is what the board reads', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    expect(layout).toContain('const pvAnimated = isPvAnimated(pvAnimTimeS, settings.animPvMoves);');
    expect(layout).toContain('const pvLen = getPvVisibleLength(activeHoverMove?.pv?.length ?? 0, settings.animPvMoves);');
    expect(layout).toContain('if (!pvAnimated) return pvLen - 1;');
  });
});

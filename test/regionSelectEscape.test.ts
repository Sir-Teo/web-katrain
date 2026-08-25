import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('region select on touch', () => {
  const bar = () => readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

  it('lets the same tools entry back out of the mode', () => {
    const text = bar();

    // While selecting there is no region yet, so the Clear entry below is not
    // rendered, and cancelSelectRegionOfInterest had exactly one caller: the
    // Escape key. On touch that made region select enterable but not leavable.
    expect(text).toContain('if (isSelectingRegionOfInterest) cancelSelectRegionOfInterest();');
    expect(text).toContain("isSelectingRegionOfInterest ? 'Cancel region select' : 'Select region'");
    expect(text).toContain('aria-pressed={isSelectingRegionOfInterest}');
  });

  it('is handed the state and the action it needs', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(layout).toContain('cancelSelectRegionOfInterest: state.cancelSelectRegionOfInterest');
    expect(layout).toContain('cancelSelectRegionOfInterest={cancelSelectRegionOfInterest}');
    expect(layout).toContain('isSelectingRegionOfInterest={isSelectingRegionOfInterest}');
  });

  it('still clears a finished region separately', () => {
    // The two are different actions: cancel abandons the selection, clear drops
    // a region that already exists.
    expect(bar()).toContain('setRegionOfInterest(null)');
    expect(bar()).toContain('Clear region');
  });
});

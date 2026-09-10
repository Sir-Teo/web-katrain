import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');
// setViewport moved into the shared browser lib when check-responsiveness.mjs
// started needing the same Chrome. The invariant did not move with it: metrics
// and touch still have to be set together, and still from exactly one place --
// which is now a place two scripts share, so it matters more, not less.
const browserLib = readFileSync('scripts/lib/browser.mjs', 'utf8');
const responsiveness = readFileSync('scripts/check-responsiveness.mjs', 'utf8');
const allScripts = [sweep, browserLib, responsiveness].join('\n');
const css = readFileSync('src/index.css', 'utf8');
const ui = readFileSync('src/components/layout/ui.tsx', 'utf8');
const notes = readFileSync('src/components/NotesPanel.tsx', 'utf8');

/**
 * The sweep resized the viewport and stopped there. `mobile: true` on the
 * metrics override does not make Chrome report a finger, so everything this app
 * keys on `(pointer: coarse)` ran under the suite as though a mouse were
 * attached -- including the 44px row height the suite's own touch-target
 * assertions were measuring against.
 */
describe('the viewport sweep reports a finger on the mobile viewports', () => {
  it('sets metrics and touch from one place', () => {
    expect(browserLib).toContain('export async function setViewport(cdp, { width, height, mobile }) {');
    expect(browserLib).toContain("cdp.send('Emulation.setTouchEmulationEnabled', {");
    expect(browserLib).toContain('enabled: !!mobile,');
    expect(browserLib).toContain('maxTouchPoints: mobile ? 5 : 1,');
  });

  it('leaves no way to change one without the other', () => {
    // Exactly one caller of each command across every script, not just this
    // one: a second metrics override anywhere is a viewport with a mouse again,
    // and now that the helper is shared it could be bypassed from either side.
    expect(allScripts.match(/cdp\.send\('Emulation\.setDeviceMetricsOverride'/g) ?? []).toHaveLength(1);
    expect(allScripts.match(/cdp\.send\('Emulation\.setTouchEmulationEnabled'/g) ?? []).toHaveLength(1);
    // ...and every viewport change goes through it.
    expect((sweep.match(/await setViewport\(cdp, /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('has something to exercise on the other side', () => {
    // If these stop keying on the pointer the helper stops earning its keep,
    // and this test should be the thing that says so.
    expect(css).toContain('@media (pointer: coarse) {');
    expect(css).toContain('--candidate-row-height: 2.75rem;');
    expect(ui).toContain("const isCoarsePointer = mediaQueryMatches('(pointer: coarse)');");
    expect(notes).toContain("const TOUCH_ONLY_MEDIA = '(pointer: coarse) and (hover: none)';");
  });
});

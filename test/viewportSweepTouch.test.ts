import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');
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
    expect(sweep).toContain('async function setViewport(cdp, { width, height, mobile }) {');
    expect(sweep).toContain("cdp.send('Emulation.setTouchEmulationEnabled', {");
    expect(sweep).toContain('enabled: !!mobile,');
    expect(sweep).toContain('maxTouchPoints: mobile ? 5 : 1,');
  });

  it('leaves no way to change one without the other', () => {
    // Exactly one caller of each command: the helper. A second metrics
    // override anywhere else is a viewport with a mouse again.
    expect(sweep.match(/cdp\.send\('Emulation\.setDeviceMetricsOverride'/g) ?? []).toHaveLength(1);
    expect(sweep.match(/cdp\.send\('Emulation\.setTouchEmulationEnabled'/g) ?? []).toHaveLength(1);
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

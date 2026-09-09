import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dash = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');

/**
 * The game-info handle is pinned to the board stage's top edge; the board
 * starts one --stage-pad below it. While the board is width-bound it never
 * reaches the top and the two never meet, which is why this held everywhere
 * the sweep looked. At 1024x500 -- the smallest desktop shell that exists,
 * since below either number the app switches to the mobile shell -- the board
 * is height-bound and its top row ran under the handle: four intersections
 * returned the button from elementFromPoint, so a click there placed no stone.
 */
describe('the board stage keeps its top handle off the board', () => {
  it('reserves the handle its own height', () => {
    expect(dash).toContain('--edge-toggle-reserve: 24px;');
    expect(dash).toContain('padding-top: max(var(--stage-pad), var(--edge-toggle-reserve));');
  });

  it('reserves as much as the handle actually takes', () => {
    // Read the height off the rule rather than trusting the two numbers to be
    // changed together: a taller handle with the old reserve is this bug again.
    const rule = /\.wk-dashboard \.edge-toggle\.top,\s*\.wk-dashboard \.edge-toggle\.bottom \{[^}]*height: (\d+)px;/s.exec(dash);
    expect(rule).not.toBeNull();
    const reserve = /--edge-toggle-reserve: (\d+)px;/.exec(dash);
    expect(reserve).not.toBeNull();
    expect(Number(reserve![1])).toBeGreaterThanOrEqual(Number(rule![1]));
  });

  it('takes the reserve after the shorthand that would undo it', () => {
    // `padding: var(--stage-pad)` resets every side, so ordering is the rule.
    expect(dash.indexOf('padding: var(--stage-pad);'))
      .toBeLessThan(dash.indexOf('padding-top: max(var(--stage-pad)'));
  });

  it('costs nothing while the board is width-bound', () => {
    // max() rather than an added reserve: the stage keeps its ordinary padding
    // and only grows to the handle's height, so a board limited by width is
    // unchanged.
    expect(dash).not.toContain('padding-top: calc(var(--stage-pad) + var(--edge-toggle-reserve))');
  });
});

describe('the sweep covers the smallest desktop shell', () => {
  it('sweeps 1024x500', () => {
    expect(sweep).toContain('{ width: 1024, height: 500, mobile: false },');
  });

  it('reads the shell boundary from the app rather than repeating it', () => {
    // 1024x500 is only the corner case while these are the thresholds.
    expect(sweep).toContain('DESKTOP_LAYOUT_MIN_WIDTH\\s*=\\s*(\\d+)');
    expect(sweep).toContain('DESKTOP_LAYOUT_MIN_HEIGHT\\s*=\\s*(\\d+)');
  });

  it('checks for controls sitting on playable intersections', () => {
    expect(sweep).toContain('board intersection(s) covered by');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');

const SHORT_SHELL = '  @media (max-height: 499px) and (max-width: 699px) {';

/** The short-shell block's body. Called inside each test so a missing block
 *  fails that test by name rather than erroring the whole file at collection. */
function shortShell(): string {
  const start = css.indexOf(SHORT_SHELL);
  expect(start, SHORT_SHELL).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n  }\n', start));
}

/**
 * In the short shell the bottom tab bar shares the control row, so the strip
 * gets about 304px less than the viewport. Every rule that sheds a control to
 * make room was keyed on width alone -- 430px, 380px, 340px -- which is the
 * right measure only in portrait, where the tab bar has its own row. A 568x320
 * landscape phone is far above all three and still left the navigation group
 * 42px to hold Back, the move counter and Forward. The group is flex-1
 * min-w-0, so it shrank and its three 44px targets did not: they overlapped
 * each other by up to 24px, and the move counter was pushed off the strip.
 */
describe('the bottom controls in the short shell', () => {
  it('sheds the mode actions into the sheet that already holds them', () => {
    expect(shortShell()).toContain('.mobile-bottom-mode-actions {\n      display: none !important;');
    expect(shortShell()).toContain('.mobile-bottom-overflow-mode-actions {\n      display: grid;');
  });

  it('keeps the shed controls reachable rather than dropping them', () => {
    // Hiding them without the sheet would take Edit and Score off the phone.
    expect(css).toContain('.mobile-bottom-overflow-mode-actions {\n    display: none;\n  }');
    expect(shortShell()).toContain('display: grid;');
  });

  it('tightens the same gaps the narrow-portrait rules tighten', () => {
    // The shed alone left 140px where the group wants about 154.
    expect(shortShell()).toContain('.mobile-bottom-navigation {\n      gap: 2px !important;');
    expect(shortShell()).toContain('.mobile-bottom-controls {\n      gap: 2px !important;');
  });

  it('never shrinks a control below the touch floor to buy the room', () => {
    expect(css).toContain('.mobile-bottom-controls button {\n    min-width: 44px;\n    min-height: 44px;\n  }');
    expect(shortShell()).not.toContain('min-width');
    expect(shortShell()).not.toContain('min-height');
  });

  it('leaves the wide short shell alone', () => {
    // 1280x460 is in the sweep and has room for everything; the cap is what
    // keeps this rule off it.
    expect(css).toContain('@media (max-height: 499px) and (max-width: 699px) {');
  });
});

describe('the sweep covers a landscape phone', () => {
  it('sweeps 568x320', () => {
    // Every viewport in the list was either portrait or at least 844 wide, so
    // the shortest landscape shell the app supports had never been measured.
    expect(sweep).toContain('{ width: 568, height: 320, mobile: true },');
  });

  it('checks the strip for overlapping controls', () => {
    expect(sweep).toContain('overlapping mobile bottom-control pair(s)');
    expect(sweep).toContain('post-move mobile control overlap(s)');
  });
});

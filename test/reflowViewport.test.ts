import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

/**
 * WCAG 2.2 SC 1.4.10 asks content to reflow into 320 CSS px without
 * two-dimensional scrolling. index.css sizes eight separate things for that
 * width -- a 320px file panel, a 320px command bar, a truncated cache button
 * -- but the sweep's narrowest viewport was 360, so every one of those numbers
 * was reasoning nothing had measured.
 */
describe('the sweep covers the width the stylesheet is written for', () => {
  it('sweeps 320px', () => {
    expect(sweep).toContain('{ width: 320, height: 568, mobile: true },');
  });

  it('is narrower than everything else it sweeps', () => {
    // A viewport that is not the narrowest tests nothing this file claims.
    const widths = [...sweep.matchAll(/\{ width: (\d+), height: \d+, mobile: (?:true|false) \},/g)]
      .map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThanOrEqual(9);
    expect(Math.min(...widths)).toBe(320);
  });

  it('measures horizontal overflow, which is what reflow means', () => {
    // Every other check could pass on a page you have to scroll sideways.
    expect(sweep).toContain('if (result.documentOverflow > 1) failures.push(');
    expect(sweep).toContain('document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth');
  });

  it('has 320px rules to hold to account', () => {
    // If these go, the viewport is still worth sweeping, but this file's
    // reason for singling out 320 has changed and should be re-read.
    expect(css).toContain('width: min(320px, calc(100vw - 24px));');
    expect((css.match(/320px/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

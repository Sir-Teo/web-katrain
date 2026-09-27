import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

/** The font-size in the first rule whose selector is exactly `selector`. */
const baseFontSize = (selector: string): number => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  const body = css.slice(at, css.indexOf('}', at));
  const match = body.match(/font-size: (\d+(?:\.\d+)?)px/);
  expect(match, selector).not.toBeNull();
  return Number(match![1]);
};

describe('dashboard secondary text', () => {
  it('is at least 12px at the default density', () => {
    // Status and review details sat at 9-11.5px.
    for (const selector of [
      '.wk-dashboard .engine-pill .meta',
      '.wk-dashboard .gs-player .rk',
      '.wk-dashboard .gs-player .cap',
      '.wk-dashboard .gs-fact',
      '.wk-dashboard .gs-file',
      '.wk-dashboard .gs-save',
      '.wk-dashboard .cb-metric .sub',
      '.wk-dashboard .tl-num',
      '.wk-dashboard .graph-legend',
      '.wk-dashboard .notes-meta',
      '.wk-dashboard .menu-item .mi-kbd',
      '.wk-dashboard .progress-label',
    ]) {
      expect(baseFontSize(selector), selector).toBeGreaterThanOrEqual(12);
    }
  });

  it('keeps compact density tighter, but not below 11px', () => {
    const compact = css.slice(css.indexOf(":root[data-ui-density='compact'] .wk-dashboard"));
    const sizes = [...compact.slice(0, compact.indexOf('/*')).matchAll(/font-size: (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(11);
  });

  it('lets the graph legend wrap rather than overflow at the larger size', () => {
    expect(css).toMatch(/\.wk-dashboard \.graph-legend \{[^}]*flex-wrap: wrap;/);
  });
});

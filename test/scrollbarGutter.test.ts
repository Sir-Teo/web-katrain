import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
const dashboard = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
const rightPanel = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

/**
 * A panel that gains a scrollbar loses its width to it, and gives it back when
 * the content shrinks -- so everything inside moves sideways each time the
 * content crosses the overflow threshold. Measured in headless Chrome: 9px on
 * the desktop sidebar at 1280x800, 8px on the library tree at 844x390, and 0
 * on the other side of the threshold in both.
 */
describe('a panel does not move sideways when it gains a scrollbar', () => {
  it('reserves the gutter on the analysis sidebar', () => {
    // Its content changes size constantly: analysis fills the candidate list,
    // sections open and close, the tree grows.
    const at = dashboard.indexOf('.wk-dashboard .sidebar-scroll {');
    expect(at).toBeGreaterThan(-1);
    expect(dashboard.slice(at, dashboard.indexOf('}', at))).toContain('scrollbar-gutter: stable;');
  });

  it('reserves it on the panel scroll regions and the library tree', () => {
    expect(css).toContain('  .panel-scroll-region,\n  .library-tree {\n    scrollbar-gutter: stable;\n  }');
  });

  it('names the element that actually scrolls', () => {
    // .panel-scroll-region carries the overflow; .panel-section-content never
    // gets one, which is why the scrollbar rules naming it do nothing.
    const at = css.indexOf('  .panel-scroll-region {');
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf('}', at))).toContain('overflow: auto;');
    expect(rightPanel).toContain('panel-section-content');
    expect(rightPanel).not.toMatch(/panel-section-content[^'"`]*overflow-y-auto/);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

describe('desktop PWA banner layout', () => {
  it('moves clear of the open analysis panel using the panel width token', () => {
    expect(css).toContain(":root:has(.wk-dashboard[data-sidebar='open']) .pwa-install-banner");
    expect(css).toContain('right: calc(var(--sidebar-w) + max(12px, env(safe-area-inset-right)))');
  });

  it('yields to the mobile More Controls sheet, which it outranks by accident', () => {
    // The sheet is z-50 inside a zIndex: 20 ancestor, so its 50 is local and
    // this banner's root-level 45 paints over it. Measured before the fix:
    // Rotate board 98% covered, Resign and Play on from here 85%, all three
    // returning the banner from elementFromPoint.
    expect(css).toContain(":root:has([data-bottom-more-sheet='true']) .pwa-install-banner");
    const start = css.indexOf(":root:has([data-bottom-more-sheet='true']) .pwa-install-banner");
    expect(css.slice(start, css.indexOf('}', start))).toContain('display: none');
  });

  it('stacks above the first-run start rail, which shares the board column corner', () => {
    expect(css).toContain('var(--desktop-start-rail-height, 0px)');
    const dashboard = readFileSync(
      new URL('../src/components/dashboard/DesktopDashboard.tsx', import.meta.url),
      'utf8'
    );
    expect(dashboard).toContain("root.style.setProperty(\n        '--desktop-start-rail-height',");
    expect(dashboard).toContain("root.style.removeProperty('--desktop-start-rail-height')");
  });
});

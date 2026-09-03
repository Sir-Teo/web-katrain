import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

describe('desktop PWA banner layout', () => {
  it('moves clear of the open analysis panel using the panel width token', () => {
    expect(css).toContain(":root:has(.wk-dashboard[data-sidebar='open']) .pwa-install-banner");
    expect(css).toContain('right: calc(var(--sidebar-w) + max(12px, env(safe-area-inset-right)))');
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

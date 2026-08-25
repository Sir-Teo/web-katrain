import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bar = () => readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');

describe('mobile analyze toggle', () => {
  it('reports whether analysis is on', () => {
    // It is the only analysis switch on a phone, and its state lived purely in
    // an accent colour and an underline. The dot inside it is engine status.
    const text = bar();
    const start = text.indexOf("title={withShortcut('Toggle analysis mode', 'toggle-analysis')}");
    expect(start).toBeGreaterThan(-1);
    const toggle = text.slice(start, text.indexOf('</button>', start));
    expect(toggle.length).toBeGreaterThan(50);
    // Scoped to this button: the tools sheet also has aria-pressed={isAnalysisMode},
    // so a whole-file check passes even with this one removed.
    expect(toggle).toContain('aria-pressed={isAnalysisMode}');
  });

  it('has no !isMobile blocks left in a component that only renders on mobile', () => {
    const text = bar();

    // TopControlBar is rendered from the {!isDesktop} shell and nowhere else,
    // so !isMobile is never true inside it. A duplicate Analyze button, the
    // language switcher and an Open side panel button all sat behind it.
    expect(text).not.toContain('{!isMobile && (');
    expect(text).not.toContain('LanguageSwitcher');
    expect(text).not.toContain('onOpenSidePanel');
  });

  it('keeps language switching where a phone can reach it', () => {
    // The drawer carries it, so removing the dead switcher loses nothing.
    const drawer = readFileSync('src/components/layout/MenuDrawer.tsx', 'utf8');

    expect(drawer).toContain('menu-app-locale');
  });
});

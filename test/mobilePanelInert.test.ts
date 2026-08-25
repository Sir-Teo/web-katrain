import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile board screen behind a tab panel', () => {
  it('goes inert so its controls leave the tab order and the a11y tree', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const main = source.slice(source.indexOf('<main'), source.indexOf('<h1 className="sr-only"'));

    // The Tree and Review tabs cover this screen with a full-viewport panel and
    // scrim. Without inert, eight controls the user cannot see stayed focusable
    // and were announced by screen readers as if they were on the page.
    expect(main).toContain('inert={rightPanelOpen || (libraryOpen && !focusMode)}');
  });

  it('still lets the panel itself close from its own scrim', () => {
    const panel = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    // The scrim is a sibling of <main>, so it must stay outside the inert subtree.
    expect(panel).toContain('className="fixed inset-0 bg-black/60 z-30 lg:hidden"');
    expect(panel).toContain('onClick={onClose}');
  });

  it('covers the library drawer too, which uses a different panel', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    // Library is not RightPanel, so rightPanelOpen alone left the board screen
    // reachable behind the library's own full-viewport scrim — the same defect
    // this guard was added for, on the one tab it did not cover.
    expect(layout).toContain('open={libraryOpen && !focusMode}');
    expect(layout).toContain('inert={rightPanelOpen || (libraryOpen && !focusMode)}');
  });

  it('does not re-add an isMobile guard inside the mobile-only shell', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const main = layout.slice(layout.indexOf('<main'), layout.indexOf('<h1 className="sr-only"'));

    // <main> renders only under {!isDesktop && ...}. Combining both flags is
    // what made the panel toggles, the resize handles and the status bar
    // unreachable, so the condition here stays free of them.
    expect(main).not.toContain('isMobile &&');
    expect(main).not.toContain('!isDesktop &&');
  });
});

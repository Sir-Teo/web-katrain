import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile board screen behind a tab panel', () => {
  it('goes inert so its controls leave the tab order and the a11y tree', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const main = source.slice(source.indexOf('<main'), source.indexOf('<h1 className="sr-only"'));

    // The Tree and Review tabs cover this screen with a full-viewport panel and
    // scrim. Without inert, eight controls the user cannot see stayed focusable
    // and were announced by screen readers as if they were on the page.
    expect(main).toContain('inert={rightPanelOpen}');
  });

  it('still lets the panel itself close from its own scrim', () => {
    const panel = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    // The scrim is a sibling of <main>, so it must stay outside the inert subtree.
    expect(panel).toContain('className="fixed inset-0 bg-black/60 z-30 lg:hidden"');
    expect(panel).toContain('onClick={onClose}');
  });
});

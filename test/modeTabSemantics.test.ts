import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop sidebar mode switcher', () => {
  const source = () => readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');

  it('says which mode is on, not just which one looks on', () => {
    const text = source();

    // Without aria-pressed the pair is two plain buttons: the active mode was
    // conveyed only by the .active class's underline, so assistive tech had no
    // way to tell Play from Analysis.
    expect(text).toContain("aria-pressed={mode === 'play'}");
    expect(text).toContain("aria-pressed={mode === 'analyze'}");
  });

  it('keeps the pressed state tied to the same value as the styling', () => {
    const text = source();
    const start = text.indexOf('<div className="mode-tabs">');
    const tabs = text.slice(start, text.indexOf('drawer-close', start));
    expect(tabs.length).toBeGreaterThan(100);

    // Styling and state must not drift apart: both read `mode`.
    for (const value of ['play', 'analyze']) {
      expect(tabs).toContain(`mode === '${value}' ? ' active' : ''`);
      expect(tabs).toContain(`aria-pressed={mode === '${value}'}`);
    }
  });

  it('distinguishes the review workspace from the analysis controls inside it', () => {
    const text = source();
    const start = text.indexOf('<div className="mode-tabs">');
    const tabs = text.slice(start, text.indexOf('drawer-close', start));

    expect(tabs).toContain('>Review</button>');
    expect(tabs).not.toContain('>Analysis</button>');
  });
});

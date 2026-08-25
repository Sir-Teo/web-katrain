import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression guard: the clock's only mount used to sit behind a condition that
// could never be true — `mode === 'play' && !isMobile` inside RightPanel, which
// only ever renders on the non-desktop layout where `isMobile` is always true.
// A byo-yomi clock configured in New Game therefore never appeared anywhere,
// and because <Timer> owns the tick loop, the clock never ran at all.
describe('game clock is mounted', () => {
  it('renders in the desktop dashboard', () => {
    const source = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');

    expect(source).toContain("import { Timer } from '../Timer';");
    expect(source).toContain('<Timer variant="status" />');
  });

  it('renders in the narrow-layout right panel, ungated by an impossible check', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    expect(source).toContain('<Timer variant="status" />');
    expect(source).not.toContain("mode === 'play' && !isMobile");
  });

  it('renders on the phone board tab, not only behind a panel that is closed there', () => {
    const source = readFileSync('src/components/layout/TopControlBar.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    // The right panel's header was the clock's only mobile home, and that
    // header is closed while you are on the board playing — so a timed game
    // showed no clock at all until you navigated away from the board.
    expect(source).toContain("import { Timer } from '../Timer';");
    expect(source).toContain('data-mobile-top-timer="true"');
    expect(source).toContain('<Timer variant="status" />');

    // Progressive shedding: the pause target goes first, the reading last.
    expect(css).toMatch(
      /@media \(max-width: 380px\) \{\s*\.mobile-top-timer \.status-bar-button \{\s*display: none;/
    );
    expect(css).toMatch(
      /@media \(max-width: 340px\) \{\s*\.mobile-top-timer \{\s*display: none;/
    );
  });

  it('hides the status chip entirely when no time control is set', () => {
    const source = readFileSync('src/components/Timer.tsx', 'utf8');

    expect(source).toContain('if (isTimerDisabled) return null;');
  });
});

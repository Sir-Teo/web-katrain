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

  it('hides the status chip entirely when no time control is set', () => {
    const source = readFileSync('src/components/Timer.tsx', 'utf8');

    expect(source).toContain('if (isTimerDisabled) return null;');
  });
});

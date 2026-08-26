import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('collapsible section toggles', () => {
  it('says whether the section is open in both shells', () => {
    const shared = readFileSync('src/components/layout/ui.tsx', 'utf8');
    const dashboard = readFileSync('src/components/dashboard/DesktopDashboard.tsx', 'utf8');

    // The mobile shell's toggle said so only by rotating its chevron, which is
    // a CSS class. The desktop shell's identical toggle has always carried the
    // state; the two now agree.
    const start = shared.indexOf("'panel-section-title',");
    const end = shared.indexOf('onClick={onToggle}', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const toggle = shared.slice(start, end);
    expect(toggle).toContain('aria-expanded={open}');

    expect(dashboard).toContain('aria-expanded={sections[key]}');

    // No aria-controls to go with it: both call sites render the body only
    // while open, so the id would name a node that is absent half the time —
    // which the viewport check fails as a dead ARIA reference.
    expect(toggle).not.toContain('aria-controls=');
  });
});

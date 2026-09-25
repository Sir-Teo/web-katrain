import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('small text keeps its contrast', () => {
  it('draws active panel toggles in the theme text colour, not white on a tint', () => {
    // White on the report graph's 30% tints measured 1.5:1 in the light theme.
    const ui = read('src/components/layout/ui.tsx');
    expect(ui).toContain('active ? `${colorClass} border-[var(--ui-border-strong)] text-[var(--ui-text)]`');
    expect(read('src/components/GameReportModal.tsx').match(/colorClass="bg-\w+-600\/30"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('does not fade 11px labels with opacity', () => {
    // 3.6:1 (report filter count) and 3.3:1 (phone home hint) with the fade.
    expect(read('src/components/GameReportModal.tsx')).toContain('font-mono text-[0.6875rem] leading-none">');
    expect(read('src/components/MobileHome.tsx')).toContain('mobile-home-action-hint mt-0.5 block truncate text-[0.6875rem]"');
  });
});

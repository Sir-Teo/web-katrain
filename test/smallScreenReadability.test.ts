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

describe('Settings on a short landscape phone', () => {
  it('drops the footer that only repeats the header close button', () => {
    const css = read('src/index.css');
    // 101px of settings on a 320px-tall screen with both bars shown.
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\) \{[\s\S]{0,400}?\.settings-modal \.settings-modal-footer \{\s*display: none !important;/);
    expect(read('src/components/SettingsModal.tsx')).toContain('aria-label="Close settings"');
  });
});

describe('board coordinates', () => {
  it('sit just outside the edge stones rather than centred in the margin', () => {
    const board = read('src/components/GoBoard.tsx');
    // Centred, "13" ran 0.2 of a cell under the stone on A13.
    expect(board).toContain('const coordGap = cellSize * 0.56;');
    expect(board).toContain('left: originX - coordGap,');
    expect(board).toContain("'translate(-100%, -50%)'");
    expect(board).toContain('top: originY + (boardSize - 1) * cellSize + coordGap,');
    expect(board).toContain("'translate(-50%, 0)'");
    expect(board).not.toContain('coordOffset');
  });
});

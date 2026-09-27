import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AutoSaveRecoveryModal } from '../src/components/AutoSaveRecoveryModal';

const noop = () => undefined;

describe('AutoSaveRecoveryModal', () => {
  it('labels the recovery prompt and focuses the safer current-game action', () => {
    const html = renderToStaticMarkup(
      <AutoSaveRecoveryModal
        snapshots={[{ id: 'tab-a', version: 1, savedAt: Date.UTC(2026, 5, 4, 12), sgf: '(;GM[1]SZ[19])' }]}
        onRestore={noop}
        onDiscard={noop}
      />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="auto-save-recovery-title"');
    expect(html).toContain('aria-describedby="auto-save-recovery-description"');
    expect(html).toContain('id="auto-save-recovery-description"');
    expect(html).toContain('An unsaved game from');
    expect(html).toContain('discard the auto-save and keep the game currently on the board');
    expect(html).toContain('Discard Auto-Save');
    expect(html).toContain('Restore Game');
    expect(html).not.toContain('aria-label="Close"');
    expect(readFileSync('src/components/AutoSaveRecoveryModal.tsx', 'utf8')).toContain('focusContainer: false');
    expect(html).toMatch(/<button[^>]*autofocus=""[^>]*>Restore Game<\/button>/);
    expect(html).toContain('autofocus=""');
  });

  it('offers a choice when several tabs left games behind', () => {
    const html = renderToStaticMarkup(
      <AutoSaveRecoveryModal
        snapshots={[
          { id: 'tab-b', version: 1, savedAt: Date.UTC(2026, 5, 4, 13), sgf: '(;GM[1]SZ[19];B[pd])' },
          { id: 'tab-a', version: 1, savedAt: Date.UTC(2026, 5, 4, 12), sgf: '(;GM[1]SZ[19])' },
        ]}
        onRestore={noop}
        onDiscard={noop}
      />
    );

    expect(html).toContain('2 unsaved games from earlier sessions are available');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    // The newest is preselected.
    expect(html).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="tab-b"/);
    expect(html).not.toMatch(/<input type="radio"[^>]*checked=""[^>]*value="tab-a"/);
  });
});

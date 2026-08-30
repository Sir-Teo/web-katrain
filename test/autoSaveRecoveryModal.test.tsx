import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AutoSaveRecoveryModal } from '../src/components/AutoSaveRecoveryModal';

const noop = () => undefined;

describe('AutoSaveRecoveryModal', () => {
  it('labels the recovery prompt and focuses the safer current-game action', () => {
    const html = renderToStaticMarkup(
      <AutoSaveRecoveryModal
        snapshot={{ version: 1, savedAt: Date.UTC(2026, 5, 4, 12), sgf: '(;GM[1]SZ[19])' }}
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
});

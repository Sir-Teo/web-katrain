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

  it('shows the game it would restore: players, length, board size and final position', () => {
    const html = renderToStaticMarkup(
      <AutoSaveRecoveryModal
        snapshots={[{
          id: 'tab-a',
          version: 1,
          savedAt: Date.UTC(2026, 5, 4, 12),
          sgf: '(;GM[1]SZ[9]PB[Honinbo Shusaku]BR[7d]PW[Gennan Inseki];B[ee];W[cc];B[gg])',
        }]}
        onRestore={noop}
        onDiscard={noop}
      />
    );

    expect(html).toContain('Honinbo Shusaku (7d) vs Gennan Inseki');
    expect(html).toContain('3 moves · 9×9');
    expect(html).toContain('aria-label="Final position of the auto-saved game"');
    expect(html.match(/<circle[^>]*url\(#sb-(black|white)\)/g)).toHaveLength(3);
    // A way to keep it without restoring it, offered before Discard is final.
    expect(html).toContain('Download SGF');
  });

  it('still offers an unreadable copy for download', () => {
    const html = renderToStaticMarkup(
      <AutoSaveRecoveryModal
        snapshots={[{ id: 'tab-a', version: 1, savedAt: 1, sgf: 'not an sgf' }]}
        onRestore={noop}
        onDiscard={noop}
      />
    );

    expect(html).toContain('Unreadable game record');
    expect(html).not.toContain('Final position of the auto-saved game');
    expect(html).toContain('Download SGF');
  });
});


import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KifuPrintModal } from '../src/components/KifuPrintModal';
import { useGameStore } from '../src/store/gameStore';

describe('KifuPrintModal actions', () => {
  it('explains why printing is unavailable before the game has moves', () => {
    useGameStore.getState().startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });

    const html = renderToStaticMarkup(<KifuPrintModal onClose={() => undefined} />);

    expect(html).toContain('No moves to print yet.');
    expect(html).toContain('aria-label="No moves to print"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('disabled:cursor-not-allowed');
  });

  it('gives the printed figure the whole page instead of half of it', () => {
    const source = readFileSync('src/components/KifuPrintModal.tsx', 'utf8');

    // The preview sets two diagrams to a row so it stays scannable, and that
    // column count followed them onto paper: each figure printed at ~350px in
    // the left half of an A4 page, beside `break-after: page`, which was
    // already asking for one diagram per page. Print takes a single column.
    expect(source).toContain('.kifu-print .kifu-diagram-grid {');
    expect(source).toContain('grid-template-columns: 1fr !important;');
    expect(source).toContain('className="kifu-diagram-grid grid grid-cols-1 gap-6 sm:grid-cols-2"');

    // maxPx is a cap on a `width: 100%` board, so the ~350px preview column
    // still governs there; it is the printed page's column this frees.
    expect(source).toContain('maxPx={720}');
    expect(source).not.toContain('maxPx={360}');
  });
});

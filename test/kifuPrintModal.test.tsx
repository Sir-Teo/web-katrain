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
});

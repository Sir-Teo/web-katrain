import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GameReportModal } from '../src/components/GameReportModal';
import { useGameStore } from '../src/store/gameStore';

describe('GameReportModal empty state', () => {
  it('replaces empty report controls with one useful explanation', () => {
    useGameStore.getState().startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });

    const html = renderToStaticMarkup(
      <GameReportModal onClose={() => undefined} setReportHoverMove={() => undefined} />
    );

    expect(html).toContain('data-game-report-empty="true"');
    expect(html).toContain('min-h-[12rem]');
    expect(html).toContain('sm:min-h-[14rem]');
    expect(html).not.toContain('sm:min-h-[20rem]');
    expect(html).toContain('Play a game on the board or open an SGF with moves.');
    expect(html).not.toContain('Print / Save PDF');
    expect(html).not.toContain('aria-label="Report analysis coverage"');
  });
});

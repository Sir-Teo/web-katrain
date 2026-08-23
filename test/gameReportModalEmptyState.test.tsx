import { readFileSync } from 'node:fs';
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

  it('keeps the empty explanation above the footer in short landscape', () => {
    useGameStore.getState().startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });

    const html = renderToStaticMarkup(
      <GameReportModal onClose={() => undefined} setReportHoverMove={() => undefined} />
    );
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('game-report-modal-header');
    expect(html).toContain('game-report-modal-body');
    expect(html).toContain('game-report-modal-empty');
    expect(html).toContain('game-report-modal-footer');
    expect(css).toMatch(/\.game-report-modal-empty \{[^}]*min-height: 0 !important;[^}]*padding: 8px !important;/);
  });
});

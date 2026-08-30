import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ScoreQuizModal } from '../src/components/ScoreQuizModal';
import { TournamentModal } from '../src/components/TournamentModal';
import { ProGamesModal } from '../src/components/ProGamesModal';
import { LessonsModal } from '../src/components/LessonsModal';
import { StaticBoard } from '../src/components/StaticBoard';
import { boardFromRows } from '../src/data/lessons';

const noop = () => {};

describe('study tool components render without crashing', () => {
  it('StaticBoard renders an SVG goban', () => {
    const html = renderToString(<StaticBoard board={boardFromRows(['x.o', '...', 'o.x'])} />);
    expect(html).toContain('<svg');
    expect(html).toContain('sb-black');
  });

  it('ScoreQuizModal renders the prompt and board', () => {
    const html = renderToString(<ScoreQuizModal onClose={noop} />);
    expect(html).toContain('Score Estimation Quiz');
    expect(html).toContain('Who is ahead');
    expect(html).toContain('aria-label="Predicted leader"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>black</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>white</);
    expect(html).toContain('This is the starting position.');
    expect(html).toContain('class="min-h-11 w-24');
    expect(html).toContain('<svg');
  });

  it('keeps compact study inputs and filters touch-sized', () => {
    const guessMoveSource = readFileSync('src/components/GuessMoveModal.tsx', 'utf8');
    const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(guessMoveSource).toContain('className={`min-h-11 px-3 py-1 text-xs font-semibold');
    expect(guessMoveSource).toContain('No moves to guess');
    expect(guessMoveSource).toContain('Browse pro games');
    expect(guessMoveSource).toContain('Open SGF');
    expect(guessMoveSource).toContain('onClick={onBrowseProGames}');
    expect(guessMoveSource).toContain('onClick={onOpenSgf}');
    expect(layoutSource).toContain('setIsProGamesOpen(true);');
    expect(layoutSource).toContain('handleLoadClick();');
  });

  it('TournamentModal renders the ladder setup', () => {
    const html = renderToString(<TournamentModal onClose={noop} onPlayGame={noop} onPlayGauntletGame={noop} />);
    const styles = readFileSync('src/index.css', 'utf8');
    expect(html).toContain('Rank ladder');
    expect(html).toContain('Gauntlet');
    expect(html).toContain('Start ladder');
    expect(html).toMatch(/aria-pressed="true"[^>]*>9<!-- -->×/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>black</);
    expect(html).toMatch(/aria-pressed="true" class="min-h-11 rounded-t-lg[^>]*>Rank ladder</);
    expect(html).toContain('class="min-h-11 w-full rounded-lg');
    expect(html).toContain('tournament-board-sizes grid grid-cols-3');
    expect(html).toContain('tournament-color-options grid grid-cols-2');
    expect(styles).toMatch(/\.tournament-setup \{[\s\S]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(0, 0\.9fr\) minmax\(0, 1fr\);/);
    expect(styles).toMatch(/\.tournament-board-sizes button,[\s\S]*\.tournament-color-options button \{[\s\S]*padding-inline: 8px;/);
  });

  it('ProGamesModal parses and lists the bundled pro games', () => {
    const html = renderToString(<ProGamesModal onClose={noop} onLoadGame={noop} />);
    // Player names parsed from the bundled SGF headers.
    expect(html).toContain('Lee Sedol');
    expect(html).toContain('Search by player');
    expect(html).toContain('aria-label="Search pro games"');
    expect(html).toContain('class="min-h-11 w-full rounded-lg');
    // desktop-shell:, not lg: — the mobile shell also runs on wide-but-short
    // windows, where a width-only variant dropped these below 44px.
    expect(html).toContain('desktop-shell:min-h-0');
    expect(html).toContain('min-h-11 min-w-11 shrink-0');
    expect(html).toContain('desktop-shell:min-h-0 desktop-shell:min-w-0');
    expect(html).toContain('pro-games-featured flex flex-nowrap');
    expect(html).toContain('min-h-11 shrink-0 rounded-full');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-pressed="true"');
    // Final-position preview board replayed from real SGF moves.
    expect(html).toContain('<svg');
  });

  it('LessonsModal lists the lessons', () => {
    const html = renderToString(<LessonsModal onClose={noop} />);
    const styles = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('Capturing a stone');
    expect(html).toContain('Two eyes mean life');
    expect(styles).toMatch(/@media \(max-width: 419px\) and \(orientation: portrait\)[\s\S]*?\.lessons-board \{[\s\S]*?max-width: 13rem !important;[\s\S]*?\.lessons-copy \{[\s\S]*?line-height: 1\.25rem !important;/);
  });
});

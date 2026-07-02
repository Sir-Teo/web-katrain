import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScoreQuizModal } from '../src/components/ScoreQuizModal';
import { TournamentModal } from '../src/components/TournamentModal';
import { ProGamesModal } from '../src/components/ProGamesModal';
import { LessonsModal } from '../src/components/LessonsModal';
import { VideoBoardModal } from '../src/components/VideoBoardModal';
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
    expect(html).toContain('<svg');
  });

  it('TournamentModal renders the ladder setup', () => {
    const html = renderToString(<TournamentModal onClose={noop} onPlayGame={noop} onPlayGauntletGame={noop} />);
    expect(html).toContain('Rank ladder');
    expect(html).toContain('Gauntlet');
    expect(html).toContain('Start ladder');
  });

  it('ProGamesModal parses and lists the bundled pro games', () => {
    const html = renderToString(<ProGamesModal onClose={noop} onLoadGame={noop} />);
    // Player names parsed from the bundled SGF headers.
    expect(html).toContain('Lee Sedol');
    expect(html).toContain('Search by player');
    // Final-position preview board replayed from real SGF moves.
    expect(html).toContain('<svg');
  });

  it('LessonsModal lists the lessons', () => {
    const html = renderToString(<LessonsModal onClose={noop} />);
    expect(html).toContain('Capturing a stone');
    expect(html).toContain('Two eyes mean life');
  });

  it('VideoBoardModal renders the import UI', () => {
    const html = renderToString(<VideoBoardModal onClose={noop} onImportSgf={noop} />);
    expect(html).toContain('Video to SGF');
    expect(html).toContain('Process video');
  });
});

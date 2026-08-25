import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatBoardAnnouncement } from '../src/components/layout/ui-utils';

describe('formatBoardAnnouncement', () => {
  it('names the move number, colour and point', () => {
    expect(
      formatBoardAnnouncement({ move: { x: 15, y: 3, player: 'white' }, moveNumber: 34, totalMoves: 35 })
    ).toBe('Move 34 of 35, White Q16');
  });

  it('spells the colour out rather than using B and W', () => {
    // A screen reader reads a bare "B" as the letter, not the player.
    const black = formatBoardAnnouncement({ move: { x: 3, y: 3, player: 'black' }, moveNumber: 1, totalMoves: 1 });

    expect(black).toContain('Black');
    expect(black).not.toMatch(/\bB\b/);
  });

  it('says Pass rather than a coordinate for a pass', () => {
    expect(
      formatBoardAnnouncement({ move: { x: -1, y: -1, player: 'white' }, moveNumber: 36, totalMoves: 36 })
    ).toBe('Move 36 of 36, White Pass');
  });

  it('describes the root of a loaded game', () => {
    expect(formatBoardAnnouncement({ move: null, moveNumber: 0, totalMoves: 35 })).toBe(
      'Start of game, 35 moves'
    );
  });

  it('describes an empty board without inventing a move count', () => {
    expect(formatBoardAnnouncement({ move: null, moveNumber: 0, totalMoves: 0 })).toBe('Empty board');
  });

  it('respects the board size when naming the point', () => {
    expect(
      formatBoardAnnouncement({ move: { x: 0, y: 0, player: 'black' }, moveNumber: 1, totalMoves: 1, boardSize: 9 })
    ).toBe('Move 1 of 1, Black A9');
  });
});

describe('board announcer element', () => {
  it('is a polite, atomic, visually hidden region at the shell root', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(layout).toContain('data-board-announcer="true"');
    expect(layout).toMatch(/className="sr-only" aria-live="polite" aria-atomic="true"/);
  });

  it('sits outside the subtree that goes inert behind mobile panels', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    // <main> takes inert while a tab panel covers it; an announcer inside would
    // stop being announced exactly when the user is navigating from the panel.
    expect(layout.indexOf('data-board-announcer="true"')).toBeLessThan(layout.indexOf('inert={rightPanelOpen}'));
  });
});

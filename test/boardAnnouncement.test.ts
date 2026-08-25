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

describe('formatBoardAnnouncement evaluation', () => {
  const at = (winRate?: number | null, scoreLead?: number | null) =>
    formatBoardAnnouncement({
      move: { x: 15, y: 3, player: 'white' },
      moveNumber: 34,
      totalMoves: 35,
      winRate,
      scoreLead,
    });

  it('adds the evaluation once it has arrived', () => {
    expect(at(0.435, -2.9)).toBe('Move 34 of 35, White Q16. Black win 44%, White +3.0');
  });

  it('says nothing about evaluation before analysis returns', () => {
    expect(at(null, null)).toBe('Move 34 of 35, White Q16');
    expect(at(undefined, undefined)).toBe('Move 34 of 35, White Q16');
  });

  it('holds steady while the engine refines the same position', () => {
    // The real refinement that prompted the rounding: 38.1% -> 38.3% and
    // +5.7 -> +5.5 as the search deepened. Each change that reaches this string
    // is another utterance, so speech is rounded coarser than the display.
    expect(at(0.381, -5.7)).toBe(at(0.383, -5.5));
  });

  it('still distinguishes evaluations that differ meaningfully', () => {
    expect(at(0.38, -5.5)).not.toBe(at(0.44, -3.0));
  });

  it('gives the win rate without a score when only that is known', () => {
    expect(at(0.5, null)).toBe('Move 34 of 35, White Q16. Black win 50%');
  });

  it('reports a level game as even rather than a signed zero', () => {
    expect(at(0.5, 0)).toContain('Even');
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

    // <main> takes inert while a panel covers it; an announcer inside would stop
    // being announced exactly when the user is navigating from that panel.
    // Assert the position against <main> itself rather than the inert
    // expression, which changes whenever another panel is added to it.
    const announcer = layout.indexOf('data-board-announcer="true"');
    const mainStart = layout.indexOf('<main');
    expect(announcer).toBeGreaterThan(-1);
    expect(mainStart).toBeGreaterThan(-1);
    expect(announcer).toBeLessThan(mainStart);
  });
});

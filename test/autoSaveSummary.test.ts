import { describe, expect, it } from 'vitest';
import { summarizeAutoSavedGame } from '../src/utils/autoSaveSummary';

describe('summarizeAutoSavedGame', () => {
  it('replays the main line, with captures, to its final position', () => {
    // White captures the black stone in the 9x9 corner (aa).
    const summary = summarizeAutoSavedGame('(;GM[1]SZ[9];B[aa];W[ba];B[ee];W[ab](;B[ff])(;B[gg]))', 7);

    expect(summary.moveCount).toBe(5);
    expect(summary.boardSize).toBe(9);
    expect(summary.board?.[0]?.[0]).toBeNull();
    expect(summary.board?.[0]?.[1]).toBe('white');
    expect(summary.board?.[5]?.[5]).toBe('black');
    // Variations are not the main line.
    expect(summary.board?.[6]?.[6]).toBeNull();
    expect(summary.lastMove).toEqual({ x: 5, y: 5 });
    expect(summary.players).toBe('Black vs White');
    expect(summary.filename).toBe('game_7.sgf');
  });

  it('names the file after the players when it can', () => {
    expect(summarizeAutoSavedGame('(;GM[1]SZ[19]PB[Ann]PW[Bo])', 1).filename).toBe('Ann vs Bo.sgf');
  });

  it('does not throw on a copy it cannot read', () => {
    expect(summarizeAutoSavedGame('garbage', 3)).toMatchObject({
      moveCount: null,
      board: null,
      filename: 'recovered_3.sgf',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { countSgfMoves, scanSgf, sgfHeaderText } from '../src/utils/sgfScan';
import { PRELOADED_GAMES } from '../src/data/preloadedGames';

describe('countSgfMoves', () => {
  it('counts a move whose node names another property first', () => {
    // SGF fixes no order inside a node, and this app writes C before B.
    expect(countSgfMoves('(;GM[1]SZ[9];C[a note]B[cc];W[dd];C[another]B[ee])')).toBe(3);
  });

  it('counts passes and every variation', () => {
    expect(countSgfMoves('(;GM[1]SZ[9];B[cc];W[];B[])')).toBe(3);
    expect(countSgfMoves('(;GM[1]SZ[19];B[pd](;W[dp];B[pp])(;W[dd]))')).toBe(4);
  });

  it('is not fooled by a comment that contains a game', () => {
    expect(countSgfMoves('(;GM[1]SZ[9];C[;B[aa];W[bb]]B[dd])')).toBe(1);
    // The escaped ] does not end the value, so B[ inside it is just text.
    expect(countSgfMoves('(;GM[1]SZ[9];C[see \\]B[cc\\] there]B[dd])')).toBe(1);
  });

  it('leaves the clock and the setup stones out of it', () => {
    expect(countSgfMoves('(;GM[1]SZ[9];B[cc]BL[120.5];W[dd]WL[118.2])')).toBe(2);
    expect(countSgfMoves('(;GM[1]SZ[9]AB[aa][bb]AW[cc];B[dd])')).toBe(1);
  });

  it('says nothing about an empty or move-less file', () => {
    expect(countSgfMoves('')).toBe(0);
    expect(countSgfMoves('(;GM[1]SZ[19])')).toBe(0);
    expect(scanSgf('(;GM[1]SZ[19])').firstMoveIndex).toBe(-1);
  });
});

describe('sgfHeaderText', () => {
  it('stops at the first move, wherever in its node it sits', () => {
    expect(sgfHeaderText('(;GM[1]PB[Shusaku]SZ[19];C[hi]B[pd];W[dp])'))
      .toBe('(;GM[1]PB[Shusaku]SZ[19]');
  });

  it('hands back the whole thing when there is no move to stop at', () => {
    expect(sgfHeaderText('(;GM[1]SZ[19]PB[x])')).toBe('(;GM[1]SZ[19]PB[x])');
  });

  it('keeps the header of every bundled game to itself', () => {
    for (const game of PRELOADED_GAMES) {
      const header = sgfHeaderText(game.sgf);
      expect(header, game.name).toContain('PB[');
      expect(header.length, game.name).toBeLessThan(game.sgf.length);
    }
  });
});

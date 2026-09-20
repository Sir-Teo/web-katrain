import { describe, expect, it } from 'vitest';
import { countSgfMoves, scanSgf, sgfHeaderText } from '../src/utils/sgfScan';
import { parseSgf, type ParsedSgfNode } from '../src/utils/sgf';
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

describe('a file holding more than one game', () => {
  /** An SGF collection: three complete games, written one after another. */
  const COLLECTION =
    '(;GM[1]FF[4]SZ[19]PB[Alice]PW[Bob]RE[B+R];B[pd];W[dp];B[pp])\n' +
    '(;GM[1]FF[4]SZ[19]PB[Carol]PW[Dave]RE[W+2.5];B[qd];W[dc];B[pq];W[dq])\n' +
    '(;GM[1]FF[4]SZ[19]PB[Eve]PW[Frank]RE[B+1.5];B[ee];W[cc])';

  const movesInTree = (node: ParsedSgfNode): number =>
    (node.props.B || node.props.W ? 1 : 0) +
    node.children.reduce((total, child) => total + movesInTree(child), 0);

  it('counts the game that opens, not the ones behind it', () => {
    // Alice vs Bob is three moves. 9 was every game in the file at once.
    expect(countSgfMoves(COLLECTION)).toBe(3);
  });

  it('agrees with the tree the parser builds from the same text', () => {
    const { tree } = parseSgf(COLLECTION);
    expect(tree).toBeDefined();
    expect(countSgfMoves(COLLECTION)).toBe(movesInTree(tree!));
  });

  it('describes the same game the header and the name do', () => {
    expect(sgfHeaderText(COLLECTION)).toContain('PB[Alice]');
    expect(sgfHeaderText(COLLECTION)).not.toContain('Carol');
  });

  it('still counts every variation of the game that opens', () => {
    const branching = '(;GM[1]SZ[19];B[pd](;W[dp];B[pp])(;W[dd]))(;GM[1]SZ[19];B[aa];W[bb])';
    expect(countSgfMoves(branching)).toBe(4);
  });

  it('leaves a file holding one game exactly as it was', () => {
    for (const game of PRELOADED_GAMES) {
      expect(countSgfMoves(game.sgf), game.name).toBeGreaterThan(0);
      expect(countSgfMoves(game.sgf), game.name).toBe(movesInTree(parseSgf(game.sgf).tree!));
    }
  });
});

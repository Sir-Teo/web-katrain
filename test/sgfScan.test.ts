import { describe, expect, it } from 'vitest';
import { countSgfGames, countSgfMoves, readRootSgfProperties, scanSgf, sgfHeaderText } from '../src/utils/sgfScan';
import { parseSgf, type ParsedSgfNode } from '../src/utils/sgf';
import { PRELOADED_GAMES } from '../src/data/preloadedGames';

describe('readRootSgfProperties', () => {
  it('preserves the ordered values of large repeated properties without sharing them with variations', () => {
    const comments = Array.from({ length: 20_000 }, (_, i) => `Comment ${i}`);
    const sgf = `(;GM[1]SZ[9]${comments.map(comment => `C[${comment}]`).join('')}AB[aa]AB[bb]AB[cc](;B[dd]C[Branch first]C[Branch second]))`;
    const root = readRootSgfProperties(sgf);
    const parsed = parseSgf(sgf);
    expect(root.C).toEqual(comments);
    expect(parsed.tree!.props.C).toEqual(comments);
    expect(root.AB).toEqual(['aa', 'bb', 'cc']);
    expect(parsed.tree!.children[0]!.props.C).toEqual(['Branch first', 'Branch second']);
    expect(parsed.initialBoard[0]![0]).toBe('black');
    expect(parsed.initialBoard[1]![1]).toBe('black');
    expect(parsed.initialBoard[2]![2]).toBe('black');
  });

  it('appends a single large value list without exceeding function argument limits', () => {
    const count = 160_000;
    const sgf = `(;GM[1]C[first]C${'[x]'.repeat(count)}C[last])`;
    for (const props of [readRootSgfProperties(sgf), parseSgf(sgf).tree!.props]) {
      expect(props.C).toHaveLength(count + 2);
      expect(props.C![0]).toBe('first');
      expect(props.C![count]).toBe('x');
      expect(props.C![count + 1]).toBe('last');
    }
  });

  it('keeps comment contents, child nodes, and later games out of the root properties', () => {
    const sgf = '(;C[Example SZ[5\\] and PB[Fake\\]; (;SZ[7\\])]SZ[19]PB[Real];PW[Child])(;PW[Other])';
    expect(readRootSgfProperties(sgf)).toEqual({
      C: ['Example SZ[5] and PB[Fake]; (;SZ[7])'], SZ: ['19'], PB: ['Real'],
    });
  });

  it('matches the parser for old identifiers, repeated values, escaped brackets and continuations', () => {
    const sgf = '( \n;SiZe [19]PlayerBlack[A\\\nlice]PW[Bo\\\r\nb]GN[Title\\\rgame]' +
      'C[Bracket \\] and backslash \\\\]C[second]AB[aa]\n[bb]ignored[not a key];B[dd])';
    expect(readRootSgfProperties(sgf)).toEqual(parseSgf(sgf).tree!.props);
    expect(readRootSgfProperties(sgf)).toMatchObject({
      SZ: ['19'], PB: ['Alice'], PW: ['Bob'], GN: ['Titlegame'],
      C: ['Bracket ] and backslash \\', 'second'], AB: ['aa', 'bb'],
    });
  });

  it('preserves a literal escaped backslash before a line break', () => {
    const sgf = '(;PB[Alice\\\\\nSmith]SZ[19])';
    expect(readRootSgfProperties(sgf).PB).toEqual(['Alice\\\nSmith']);
    expect(readRootSgfProperties(sgf)).toEqual(parseSgf(sgf).tree!.props);
  });

  it('reads only closed values and requires the first tree to start with a root', () => {
    expect(readRootSgfProperties('')).toEqual({});
    expect(readRootSgfProperties('(invalid)(;SZ[5])')).toEqual({});
    expect(readRootSgfProperties('(;PB[Alice]PW[unfinished')).toEqual({ PB: ['Alice'] });
  });
});

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

describe('countSgfGames', () => {
  it('counts the trees at the top, not the variations inside them', () => {
    expect(countSgfGames('(;GM[1]SZ[19];B[pd](;W[dp])(;W[dd]))')).toBe(1);
    expect(countSgfGames('(;GM[1]SZ[9];B[aa])(;GM[1]SZ[9];B[bb])')).toBe(2);
  });

  it('is not fooled by parentheses inside a comment', () => {
    expect(countSgfGames('(;GM[1]SZ[9];C[a (joseki) here](;B[aa]))')).toBe(1);
    expect(countSgfGames('(;GM[1]SZ[9];C[see \\] ( ) there];B[aa])')).toBe(1);
  });

  it('says nothing about an empty file', () => {
    expect(countSgfGames('')).toBe(0);
  });

  it('reads every bundled game as the single game it is', () => {
    for (const game of PRELOADED_GAMES) expect(countSgfGames(game.sgf), game.name).toBe(1);
  });
});

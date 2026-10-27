import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unsupportedSgfBoardSize } from '../src/utils/boardSize';

describe('unsupported SGF board size', () => {
  it.each(['09:9', '9:09', '013:13', '19:019'])('accepts numerically square supported size %s', (size) => {
    expect(unsupportedSgfBoardSize(`(;GM[1]FF[4]SZ[${size}];B[cc])`)).toBeNull();
  });
  it('says nothing for the sizes the app actually supports', () => {
    for (const size of [9, 13, 19]) {
      expect(unsupportedSgfBoardSize(`(;GM[1]FF[4]SZ[${size}]KM[6.5];B[cc])`)).toBeNull();
    }
    // Square SZ[w:h] is still just that size.
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[19:19];B[cc])')).toBeNull();
  });

  it('names a legal board the app cannot open at its own size', () => {
    // 5x5 and 7x7 tsumego are real files; they load as 19x19 with the shape
    // scattered, which reads as a broken app unless we say what happened.
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[5]KM[6.5];B[cc])')).toBe('5');
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[7];B[cc])')).toBe('7');
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[21];B[cc])')).toBe('21');
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[25];B[cc])')).toBe('25');
    expect(unsupportedSgfBoardSize('(;SZ[05:5];B[cc])')).toBe('05:5');
  });

  it('names a non-square board, which has no layout here at all', () => {
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[19:13];B[cc])')).toBe('19:13');
    expect(unsupportedSgfBoardSize('(;SZ[09:13])')).toBe('09:13');
    expect(unsupportedSgfBoardSize('(;SZ[13:019])')).toBe('13:019');
  });

  it.each(['9:9junk', '9:9.5', '19:0x13', '19:1.9e1', '9junk:9'])('retains the warning for malformed composed size %s', (size) => {
    expect(unsupportedSgfBoardSize(`(;SZ[${size}])`)).toBe(size);
  });

  it('stays quiet when there is no real board to name', () => {
    // Junk and absent SZ both fall back to 19x19, but there is nothing
    // meaningful to report about them.
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[abc];B[cc])')).toBeNull();
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]KM[6.5];B[cc])')).toBeNull();
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[];B[cc])')).toBeNull();
    expect(unsupportedSgfBoardSize('')).toBeNull();
  });

  it('does not mistake another property that ends in SZ', () => {
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]XSZ[5]SZ[19];B[cc])')).toBeNull();
  });

  it('ignores size-looking text in a root comment and in later games', () => {
    expect(unsupportedSgfBoardSize('(;C[Example uses SZ[5\\] in its header]SZ[19];B[dd])')).toBeNull();
    expect(unsupportedSgfBoardSize('(;C[No board declaration here];B[dd])(;SZ[5];B[aa])')).toBeNull();
    expect(unsupportedSgfBoardSize('(;C[Compare SZ[9\\] with this board]SZ[21];B[dd])')).toBe('21');
  });

  it('reads the same whitespace, old identifiers, and continuations as the SGF parser', () => {
    expect(unsupportedSgfBoardSize('( ; GM[1] SZ [5];B[aa])')).toBe('5');
    expect(unsupportedSgfBoardSize('(;SiZe[7];B[aa])')).toBe('7');
    expect(unsupportedSgfBoardSize('(;SZ[1\\\n9];B[dd])')).toBeNull();
  });


  it('reports the coercion on every path that loads a user-supplied SGF', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    // One helper, called after loadGame so it can report the size actually
    // opened. Paste and file-open append it to their existing toast; the
    // library load passes the actual loaded record's notice to its caller.
    expect(layout).toContain('const boardSizeCoercionNotice = (sgfText: string): string =>');
    // The definition reads `boardSizeCoercionNotice = (`, so only calls match.
    const calls = layout.match(/boardSizeCoercionNotice\(/g) ?? [];
    expect(calls).toHaveLength(3);

    for (const source of ['result.sgf', 'text', 'textToLoad']) {
      expect(layout).toContain(`boardSizeCoercionNotice(${source})`);
    }
  });
});

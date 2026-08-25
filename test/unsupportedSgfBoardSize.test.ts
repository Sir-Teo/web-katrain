import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unsupportedSgfBoardSize } from '../src/utils/boardSize';

describe('unsupported SGF board size', () => {
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
  });

  it('names a non-square board, which has no layout here at all', () => {
    expect(unsupportedSgfBoardSize('(;GM[1]FF[4]SZ[19:13];B[cc])')).toBe('19:13');
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


  it('reports the coercion on every path that loads a user-supplied SGF', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    // One helper, called after loadGame so it can report the size actually
    // opened. Paste and file-open append it to their existing toast; the
    // library load is silent on success, so it speaks only when there is
    // something to say.
    expect(layout).toContain('const boardSizeCoercionNotice = (sgfText: string): string =>');
    // The definition reads `boardSizeCoercionNotice = (`, so only calls match.
    const calls = layout.match(/boardSizeCoercionNotice\(/g) ?? [];
    expect(calls).toHaveLength(3);

    for (const source of ['result.sgf', 'text', 'sgfText']) {
      expect(layout).toContain(`boardSizeCoercionNotice(${source})`);
    }
  });
});

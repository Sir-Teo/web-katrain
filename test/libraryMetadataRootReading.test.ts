import { describe, expect, it } from 'vitest';
import { extractLibraryMetadata } from '../src/utils/library';

describe('library metadata from an SGF root', () => {
  it('reads a root written with whitespace after the opening parenthesis', () => {
    const metadata = extractLibraryMetadata('(\n;GM[1]SZ[19]PB[Alice]PW[Bob])');
    expect(metadata).toMatchObject({ black: 'Alice', white: 'Bob', boardSize: 19 });
  });

  it('counts the stones of a compressed point list', () => {
    expect(extractLibraryMetadata('(;GM[1]FF[4]SZ[19]AB[aa:cc];W[pd])').setupStoneCount).toBe(9);
  });

  it('counts every value of a wrapped list', () => {
    expect(extractLibraryMetadata('(;GM[1]SZ[19]AB[aa]\n[bb] [cc]AW[dd])').setupStoneCount).toBe(4);
  });
});

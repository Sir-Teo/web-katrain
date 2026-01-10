import { describe, it, expect } from 'vitest';
import { parseSgf } from '../src/utils/sgf';

describe('SGF Parser', () => {
  it('parses a simple SGF with moves', () => {
    const sgf = '(;GM[1]SZ[19];B[pd];W[dp])';
    const result = parseSgf(sgf);
    expect(result.moves).toHaveLength(2);
    expect(result.moves[0]).toEqual({ x: 15, y: 3, player: 'black' }); // pd -> 15, 3
    expect(result.moves[1]).toEqual({ x: 3, y: 15, player: 'white' }); // dp -> 3, 15
  });

  it('parses handicap stones', () => {
      const sgf = '(;GM[1]SZ[19]AB[dd][pp]AW[dp];B[jj])';
      const result = parseSgf(sgf);
      // We expect initial board to have stones
      expect(result.initialBoard[3][3]).toBe('black'); // dd
      expect(result.initialBoard[15][15]).toBe('black'); // pp
      expect(result.initialBoard[15][3]).toBe('white'); // dp

      expect(result.moves).toHaveLength(1);
      expect(result.moves[0]).toEqual({ x: 9, y: 9, player: 'black' });
  });

  it('handles pass', () => {
      const sgf = '(;GM[1]SZ[19];B[];W[tt])';
      const result = parseSgf(sgf);
      expect(result.moves[0]).toEqual({ x: -1, y: -1, player: 'black' });
      expect(result.moves[1]).toEqual({ x: -1, y: -1, player: 'white' });
  });

  it('ignores metadata', () => {
      const sgf = '(;GM[1]FF[4]CA[UTF-8]AP[CGoban:3]ST[2]\nRU[Japanese]SZ[19]KM[6.50]\nPW[White]PB[Black]\n;B[pd])';
      const result = parseSgf(sgf);
      expect(result.moves).toHaveLength(1);
      expect(result.komi).toBe(6.5);
  });

  it('parses variations into a tree', () => {
      const sgf = '(;GM[1]SZ[19];B[pd](;W[dd])(;W[dp]))';
      const result = parseSgf(sgf);

      expect(result.moves).toHaveLength(2);
      expect(result.moves[0]).toEqual({ x: 15, y: 3, player: 'black' });
      expect(result.moves[1]).toEqual({ x: 3, y: 3, player: 'white' });

      expect(result.tree).toBeTruthy();
      const root = result.tree!;
      const bNode = root.children[0]!;
      expect(bNode.props['B']?.[0]).toBe('pd');
      expect(bNode.children).toHaveLength(2);
      expect(bNode.children[0]!.props['W']?.[0]).toBe('dd');
      expect(bNode.children[1]!.props['W']?.[0]).toBe('dp');
  });
});

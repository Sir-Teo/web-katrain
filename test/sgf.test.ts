import { describe, it, expect } from 'vitest';
import type { GameNode } from '../src/types';
import {
  getImportedSgfNameFromProperties,
  getSgfDownloadFilename,
  getSgfDownloadFilenameFromProperties,
  parseSgf,
} from '../src/utils/sgf';

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

  it('expands compressed point lists for setup stones and markup', () => {
      const sgf = '(;GM[1]SZ[9]AB[aa:bb]AW[cc]AE[ab];B[dd]TR[ee:ff]SQ[gg])';
      const result = parseSgf(sgf);

      expect(result.initialBoard[0][0]).toBe('black');
      expect(result.initialBoard[0][1]).toBe('black');
      expect(result.initialBoard[1][0]).toBe(null);
      expect(result.initialBoard[1][1]).toBe('black');
      expect(result.initialBoard[2][2]).toBe('white');

      const node = result.tree?.children[0];
      expect(node?.props.TR).toEqual(['ee', 'fe', 'ef', 'ff']);
      expect(node?.props.SQ).toEqual(['gg']);
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

  it('preserves SGF edit markers and labels in parsed nodes', () => {
      const sgf = '(;GM[1]SZ[19];B[pd]TR[dd]SQ[qq]CR[dp]MA[pp]LB[cc:A][dc:1])';
      const result = parseSgf(sgf);
      const node = result.tree?.children[0];
      expect(node?.props.TR).toEqual(['dd']);
      expect(node?.props.SQ).toEqual(['qq']);
      expect(node?.props.CR).toEqual(['dp']);
      expect(node?.props.MA).toEqual(['pp']);
      expect(node?.props.LB).toEqual(['cc:A', 'dc:1']);
  });

  it('throws on malformed SGF instead of returning an empty game', () => {
      expect(() => parseSgf('not sgf')).toThrow('Invalid SGF');
      expect(() => parseSgf('(;GM[1]SZ[19];B[pd]')).toThrow('Invalid SGF');
  });

  it('parses escaped line continuations without losing real newlines', () => {
      const sgf = '(;GM[1]SZ[19]C[hello\\\nworld]N[line1\nline2])';
      const result = parseSgf(sgf);

      expect(result.tree?.props.C?.[0]).toBe('helloworld');
      expect(result.tree?.props.N?.[0]).toBe('line1\nline2');
  });

  it('builds SGF download filenames from game metadata', () => {
      const nodeWithProps = (properties: GameNode['properties']) => ({ properties }) as unknown as GameNode;

      expect(getSgfDownloadFilename(nodeWithProps({ GN: ['  Alpha/Beta: Final?  '] }), 123)).toBe('Alpha-Beta- Final.sgf');
      expect(getSgfDownloadFilename(nodeWithProps({ GN: ['Review\u202efgs\u0000'] }), 123)).toBe('Reviewfgs.sgf');
      expect(getSgfDownloadFilenameFromProperties({ GN: ['League Round 1'] }, 123)).toBe('League Round 1.sgf');
      expect(getSgfDownloadFilename(nodeWithProps({ PB: ['Black/One'], PW: ['White:Two'] }), 123)).toBe('Black-One vs White-Two.sgf');
      expect(getSgfDownloadFilename(nodeWithProps({}), 123)).toBe('game_123.sgf');
  });

  it('names imported SGFs from metadata before falling back to source labels', () => {
      expect(getImportedSgfNameFromProperties({ GN: ['  Alpha/Beta: Final?  '] }, 'Pasted SGF')).toBe('Alpha-Beta- Final.sgf');
      expect(getImportedSgfNameFromProperties({ PB: ['Black/One'], PW: ['White:Two'] }, 'Pasted SGF')).toBe('Black-One vs White-Two.sgf');
      expect(getImportedSgfNameFromProperties({ GN: ['  '], PB: [''] }, 'Pasted SGF')).toBe('Pasted SGF');
      expect(getImportedSgfNameFromProperties({}, '')).toBe('Loaded SGF');
  });
});

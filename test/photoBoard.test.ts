import { describe, expect, it } from 'vitest';
import { buildPhotoBoardSetupSgf, isPhotoBoardImageFile, type PhotoBoardStone } from '../src/utils/photoBoard';
import { parseSgf } from '../src/utils/sgf';

const emptyStones = (boardSize: number): PhotoBoardStone[] =>
  Array.from({ length: boardSize * boardSize }, () => null);

describe('photo board SGF import', () => {
  it('builds setup stones and next player for a 9x9 position', () => {
    const stones = emptyStones(9);
    stones[0] = 'black';
    stones[8] = 'white';
    stones[80] = 'black';

    const sgf = buildPhotoBoardSetupSgf({
      boardSize: 9,
      stones,
      komi: 7.5,
      nextPlayer: 'white',
      sourceName: 'phone]photo.sgf',
    });

    expect(sgf).toContain('SZ[9]');
    expect(sgf).toContain('KM[7.5]');
    expect(sgf).toContain('PL[W]');
    expect(sgf).toContain('SO[phone\\]photo.sgf]');
    expect(sgf).toContain('AB[aa]');
    expect(sgf).toContain('AW[ia]');
    expect(sgf).toContain('AB[ii]');

    const parsed = parseSgf(sgf);
    expect(parsed.initialBoard[0]?.[0]).toBe('black');
    expect(parsed.initialBoard[0]?.[8]).toBe('white');
    expect(parsed.initialBoard[8]?.[8]).toBe('black');
    expect(parsed.komi).toBe(7.5);
  });

  it('supports empty setup SGFs for all board sizes', () => {
    for (const boardSize of [9, 13, 19] as const) {
      const sgf = buildPhotoBoardSetupSgf({ boardSize, stones: emptyStones(boardSize) });
      expect(sgf).toContain(`SZ[${boardSize}]`);
      expect(sgf).not.toContain('AB[');
      expect(sgf).not.toContain('AW[');
    }
  });

  it('rejects mismatched board arrays', () => {
    expect(() => buildPhotoBoardSetupSgf({ boardSize: 13, stones: emptyStones(9) })).toThrow(
      'Expected 169 intersections'
    );
  });

  it('recognizes board photo file types for drop import', () => {
    expect(isPhotoBoardImageFile({ name: 'board.JPG', type: '' })).toBe(true);
    expect(isPhotoBoardImageFile({ name: 'camera-capture', type: 'image/png' })).toBe(true);
    expect(isPhotoBoardImageFile({ name: 'game.sgf', type: 'application/x-go-sgf' })).toBe(false);
    expect(isPhotoBoardImageFile({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
  });
});

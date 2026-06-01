import { describe, expect, it } from 'vitest';
import {
  buildPhotoBoardSetupSgf,
  computePhotoBoardDelta,
  findPhotoBoardMoveDelta,
  getPhotoBoardClipboardImageFile,
  getPhotoBoardTracePaintValue,
  isPhotoBoardImageFile,
  photoBoardPointLabel,
  photoBoardStonesFromBoard,
  resizePhotoBoardStones,
  summarizePhotoBoardDelta,
  type PhotoBoardStone,
} from '../src/utils/photoBoard';
import { createEmptyBoard } from '../src/utils/boardSize';
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

  it('copies the current board into photo board tracing order', () => {
    const board = createEmptyBoard(9);
    board[0]![0] = 'black';
    board[0]![8] = 'white';
    board[8]![8] = 'black';

    const stones = photoBoardStonesFromBoard(board, 9);
    expect(stones).toHaveLength(81);
    expect(stones[0]).toBe('black');
    expect(stones[8]).toBe('white');
    expect(stones[80]).toBe('black');
    expect(stones[40]).toBeNull();
  });

  it('rejects current boards with the wrong size', () => {
    expect(() => photoBoardStonesFromBoard(createEmptyBoard(9), 13)).toThrow('Expected a 13x13 board.');
  });

  it('preserves shared intersections when resizing a traced photo board', () => {
    const stones = emptyStones(19);
    stones[0] = 'black';
    stones[12] = 'white';
    stones[13] = 'black';
    stones[18 * 19 + 18] = 'white';

    const smaller = resizePhotoBoardStones(stones, 19, 13);
    expect(smaller).toHaveLength(169);
    expect(smaller[0]).toBe('black');
    expect(smaller[12]).toBe('white');
    expect(smaller[13]).toBeNull();
    expect(smaller[12 * 13 + 12]).toBeNull();

    const expanded = resizePhotoBoardStones(emptyStones(9).map((stone, index) => (index === 80 ? 'black' : stone)), 9, 13);
    expect(expanded).toHaveLength(169);
    expect(expanded[8 * 13 + 8]).toBe('black');
    expect(expanded[12 * 13 + 12]).toBeNull();
  });

  it('detects a single traced stone as the next current-player move', () => {
    const board = createEmptyBoard(9);
    board[0]![0] = 'black';
    const stones = photoBoardStonesFromBoard(board, 9);
    stones[1] = 'white';

    expect(findPhotoBoardMoveDelta({ currentBoard: board, boardSize: 9, stones, currentPlayer: 'white' })).toEqual({
      x: 1,
      y: 0,
      player: 'white',
    });
  });

  it('summarizes traced differences against the current board', () => {
    const board = createEmptyBoard(9);
    board[0]![0] = 'black';
    board[0]![1] = 'white';
    const stones = photoBoardStonesFromBoard(board, 9);

    stones[0] = null;
    stones[1] = 'black';
    stones[2] = 'white';

    expect(computePhotoBoardDelta({ currentBoard: board, boardSize: 9, stones })).toEqual([
      { x: 0, y: 0, player: 'black', type: 'removed' },
      { x: 1, y: 0, player: 'white', type: 'removed' },
      { x: 1, y: 0, player: 'black', type: 'added' },
      { x: 2, y: 0, player: 'white', type: 'added' },
    ]);
  });

  it('formats photo board delta points for review', () => {
    expect(photoBoardPointLabel(0, 0, 19)).toBe('A19');
    expect(photoBoardPointLabel(8, 8, 19)).toBe('J11');

    const delta = [
      { x: 0, y: 0, player: 'black', type: 'removed' },
      { x: 8, y: 8, player: 'white', type: 'added' },
      { x: 18, y: 18, player: 'black', type: 'added' },
    ] as const;

    expect(summarizePhotoBoardDelta([...delta], 19, 2)).toEqual({
      items: [
        { x: 0, y: 0, player: 'black', type: 'removed', pointLabel: 'A19', label: '-B A19' },
        { x: 8, y: 8, player: 'white', type: 'added', pointLabel: 'J11', label: '+W J11' },
      ],
      hiddenCount: 1,
    });
  });

  it('rejects traced move deltas that are not exactly one current-player addition', () => {
    const board = createEmptyBoard(9);
    board[0]![0] = 'black';

    const opponentMove = photoBoardStonesFromBoard(board, 9);
    opponentMove[1] = 'white';
    expect(findPhotoBoardMoveDelta({ currentBoard: board, boardSize: 9, stones: opponentMove, currentPlayer: 'black' })).toBeNull();

    const twoMoves = photoBoardStonesFromBoard(board, 9);
    twoMoves[1] = 'white';
    twoMoves[2] = 'white';
    expect(findPhotoBoardMoveDelta({ currentBoard: board, boardSize: 9, stones: twoMoves, currentPlayer: 'white' })).toBeNull();

    const removedStone = photoBoardStonesFromBoard(board, 9);
    removedStone[0] = null;
    expect(findPhotoBoardMoveDelta({ currentBoard: board, boardSize: 9, stones: removedStone, currentPlayer: 'white' })).toBeNull();
  });

  it('recognizes board photo file types for drop import', () => {
    expect(isPhotoBoardImageFile({ name: 'board.JPG', type: '' })).toBe(true);
    expect(isPhotoBoardImageFile({ name: 'camera-capture', type: 'image/png' })).toBe(true);
    expect(isPhotoBoardImageFile({ name: 'game.sgf', type: 'application/x-go-sgf' })).toBe(false);
    expect(isPhotoBoardImageFile({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
  });

  it('extracts pasted board images from clipboard data', () => {
    const pastedImage = new File(['image-bytes'], 'clipboard.png', { type: 'image/png' });
    const textFile = new File(['(;GM[1])'], 'game.sgf', { type: 'application/x-go-sgf' });
    const fallbackImage = new File(['fallback'], 'fallback.webp', { type: '' });

    expect(getPhotoBoardClipboardImageFile({
      items: [
        { kind: 'string', type: 'text/plain' },
        { kind: 'file', type: 'application/x-go-sgf', getAsFile: () => textFile },
        { kind: 'file', type: 'image/png', getAsFile: () => pastedImage },
      ],
      files: [fallbackImage],
    })).toBe(pastedImage);

    expect(getPhotoBoardClipboardImageFile({
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }],
      files: [fallbackImage],
    })).toBe(fallbackImage);

    expect(getPhotoBoardClipboardImageFile({
      items: [{ kind: 'file', type: 'application/x-go-sgf', getAsFile: () => textFile }],
      files: [textFile],
    })).toBeNull();
  });

  it('names pasted clipboard images when the browser provides no filename', () => {
    const unnamedImage = new File(['image-bytes'], '', { type: 'image/png' });
    const pastedFile = getPhotoBoardClipboardImageFile({
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => unnamedImage }],
    });

    expect(pastedFile).not.toBeNull();
    expect(pastedFile?.name).toBe('pasted-board.png');
    expect(pastedFile?.type).toBe('image/png');
  });

  it('chooses a stable paint value for trace dragging', () => {
    expect(getPhotoBoardTracePaintValue(null, 'black')).toBe('black');
    expect(getPhotoBoardTracePaintValue('white', 'black')).toBe('black');
    expect(getPhotoBoardTracePaintValue('black', 'black')).toBeNull();
    expect(getPhotoBoardTracePaintValue('white', 'erase')).toBeNull();
  });
});

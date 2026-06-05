import { describe, expect, it } from 'vitest';
import {
  PHOTO_BOARD_IMAGE_ACCEPT,
  PHOTO_BOARD_SUPPORTED_IMAGE_LABEL,
  PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE,
  buildPhotoBoardSetupSgf,
  computePhotoBoardDelta,
  findPhotoBoardMoveDelta,
  getPhotoBoardClipboardImageFile,
  getPhotoBoardTracePaintValue,
  isPhotoBoardImageFile,
  isUnsupportedPhotoBoardImageFile,
  photoBoardPointLabel,
  photoBoardStonesFromBoard,
  resizePhotoBoardStones,
  summarizePhotoBoardDelta,
  swapPhotoBoardStoneColors,
  transformPhotoBoardStones,
  type PhotoBoardStone,
} from '../src/utils/photoBoard';
import { createEmptyBoard } from '../src/utils/boardSize';
import { getPhotoBoardRecognitionOptionsForSensitivity, recognizePhotoBoardFromPixels } from '../src/utils/photoBoardRecognition';
import { parseSgf } from '../src/utils/sgf';

const emptyStones = (boardSize: number): PhotoBoardStone[] =>
  Array.from({ length: boardSize * boardSize }, () => null);

function makeRecognitionImage(
  boardSize: 9 | 13 | 19,
  stones: Array<{ x: number; y: number; stone: Exclude<PhotoBoardStone, null>; color?: [number, number, number] }>
) {
  const width = 360;
  const height = 360;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 214;
    data[i + 1] = 173;
    data[i + 2] = 104;
    data[i + 3] = 255;
  }

  const margin = Math.min(width, height) * 0.06;
  const span = width - 1 - margin * 2;
  const cell = span / (boardSize - 1);
  const radius = cell * 0.36;
  const paintCircle = (cx: number, cy: number, color: [number, number, number]) => {
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x++) {
        if (Math.hypot(x - cx, y - cy) > radius) continue;
        const offset = (y * width + x) * 4;
        data[offset] = color[0];
        data[offset + 1] = color[1];
        data[offset + 2] = color[2];
      }
    }
  };

  for (const item of stones) {
    paintCircle(
      margin + (item.x / (boardSize - 1)) * span,
      margin + (item.y / (boardSize - 1)) * span,
      item.color ?? (item.stone === 'black' ? [24, 24, 24] : [248, 248, 248])
    );
  }

  return { width, height, data };
}

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
    expect(sgf).toContain('AB[aa][ii]');
    expect(sgf).toContain('AW[ia]');
    expect(sgf.match(/AB\[/g)).toHaveLength(1);
    expect(sgf.match(/AW\[/g)).toHaveLength(1);

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

  it('transforms traced stones for orientation correction', () => {
    const stones = emptyStones(9);
    stones[0] = 'black'; // A9
    stones[8] = 'white'; // J9
    stones[8 * 9] = 'black'; // A1

    const rotateRight = transformPhotoBoardStones(stones, 9, 'rotate-right');
    expect(rotateRight[8]).toBe('black');
    expect(rotateRight[80]).toBe('white');
    expect(rotateRight[0]).toBe('black');

    const rotateLeft = transformPhotoBoardStones(stones, 9, 'rotate-left');
    expect(rotateLeft[72]).toBe('black');
    expect(rotateLeft[0]).toBe('white');
    expect(rotateLeft[80]).toBe('black');

    const flipHorizontal = transformPhotoBoardStones(stones, 9, 'flip-horizontal');
    expect(flipHorizontal[8]).toBe('black');
    expect(flipHorizontal[0]).toBe('white');
    expect(flipHorizontal[80]).toBe('black');

    const flipVertical = transformPhotoBoardStones(stones, 9, 'flip-vertical');
    expect(flipVertical[72]).toBe('black');
    expect(flipVertical[80]).toBe('white');
    expect(flipVertical[0]).toBe('black');
  });

  it('swaps traced stone colors without moving empty points', () => {
    expect(swapPhotoBoardStoneColors(['black', 'white', null])).toEqual(['white', 'black', null]);
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
    expect(isPhotoBoardImageFile({ name: 'diagram.svg', type: 'image/svg+xml' })).toBe(false);
    expect(isPhotoBoardImageFile({ name: 'ios-photo', type: 'image/heic' })).toBe(false);
    expect(isPhotoBoardImageFile({ name: 'game.sgf', type: 'application/x-go-sgf' })).toBe(false);
    expect(isPhotoBoardImageFile({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
  });

  it('classifies unsupported board photo formats separately from SGF imports', () => {
    expect(isUnsupportedPhotoBoardImageFile({ name: 'board.jpg', type: '' })).toBe(false);
    expect(isUnsupportedPhotoBoardImageFile({ name: 'capture', type: 'image/webp' })).toBe(false);
    expect(isUnsupportedPhotoBoardImageFile({ name: 'diagram.svg', type: '' })).toBe(true);
    expect(isUnsupportedPhotoBoardImageFile({ name: 'ios-photo', type: 'image/heic' })).toBe(true);
    expect(isUnsupportedPhotoBoardImageFile({ name: 'camera.avif', type: '' })).toBe(true);
    expect(isUnsupportedPhotoBoardImageFile({ name: 'game.sgf', type: 'application/x-go-sgf' })).toBe(false);
  });

  it('advertises only browser-decodable board photo formats', () => {
    expect(PHOTO_BOARD_IMAGE_ACCEPT).toContain('.jpg');
    expect(PHOTO_BOARD_IMAGE_ACCEPT).toContain('image/png');
    expect(PHOTO_BOARD_IMAGE_ACCEPT).not.toContain('image/*');
    expect(PHOTO_BOARD_SUPPORTED_IMAGE_LABEL).toBe('JPG, PNG, WebP, or BMP');
    expect(PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE).toBe('Board photos must be JPG, PNG, WebP, or BMP.');
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

  it('ignores unsupported clipboard image MIME types instead of sending them to photo board', () => {
    const svgImage = new File(['<svg />'], 'diagram.svg', { type: 'image/svg+xml' });
    const heicImage = new File(['heic'], '', { type: 'image/heic' });

    expect(getPhotoBoardClipboardImageFile({
      items: [{ kind: 'file', type: 'image/svg+xml', getAsFile: () => svgImage }],
      files: [heicImage],
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

  it('auto traces stones from aligned board image pixels', () => {
    const result = recognizePhotoBoardFromPixels(
      makeRecognitionImage(9, [
        { x: 2, y: 3, stone: 'black' },
        { x: 6, y: 5, stone: 'white' },
      ]),
      9
    );

    expect(result.total).toBe(2);
    expect(result.black).toBe(1);
    expect(result.white).toBe(1);
    expect(result.stones[3 * 9 + 2]).toBe('black');
    expect(result.stones[5 * 9 + 6]).toBe('white');
    expect(result.stones[0]).toBeNull();
  });

  it('leaves empty aligned board image pixels empty', () => {
    const result = recognizePhotoBoardFromPixels(makeRecognitionImage(13, []), 13);

    expect(result.total).toBe(0);
    expect(result.stones).toHaveLength(13 * 13);
  });

  it('uses sensitivity options to include or reject weak stone candidates', () => {
    const image = makeRecognitionImage(9, [{ x: 4, y: 4, stone: 'black', color: [112, 112, 112] }]);

    expect(recognizePhotoBoardFromPixels(image, 9).total).toBe(0);
    expect(recognizePhotoBoardFromPixels(image, 9, getPhotoBoardRecognitionOptionsForSensitivity(0)).total).toBe(0);
    const sensitive = recognizePhotoBoardFromPixels(image, 9, getPhotoBoardRecognitionOptionsForSensitivity(100));
    expect(sensitive.black).toBe(1);
    expect(sensitive.stones[4 * 9 + 4]).toBe('black');
  });
});

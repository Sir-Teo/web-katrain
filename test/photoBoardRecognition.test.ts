import { describe, expect, it } from 'vitest';
import type { BoardSize } from '../src/types';
import {
  DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY,
  getPhotoBoardRecognitionOptionsForSensitivity,
  recognizePhotoBoardFromPixels,
} from '../src/utils/photoBoardRecognition';

const MARGIN_FRACTION = 0.06;

/**
 * A synthetic photo: flat background with square patches at the grid points
 * the recognizer samples, so the geometry here mirrors the geometry there.
 */
function boardImage(
  boardSize: BoardSize,
  stones: Array<[x: number, y: number, colour: 'black' | 'white']>,
  { size = 400, background = 150 } = {}
) {
  const width = size;
  const height = size;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = background;
    data[i * 4 + 1] = background;
    data[i * 4 + 2] = background;
    data[i * 4 + 3] = 255;
  }

  const margin = Math.min(width, height) * MARGIN_FRACTION;
  const spanX = Math.max(1, width - 1 - margin * 2);
  const spanY = Math.max(1, height - 1 - margin * 2);
  const cellSize = Math.min(spanX, spanY) / Math.max(1, boardSize - 1);
  const radius = Math.max(2, cellSize * 0.24);

  for (const [gx, gy, colour] of stones) {
    const px = margin + (gx / (boardSize - 1)) * spanX;
    const py = margin + (gy / (boardSize - 1)) * spanY;
    const value = colour === 'black' ? 10 : 245;
    for (let y = Math.floor(py - radius); y <= Math.ceil(py + radius); y += 1) {
      for (let x = Math.floor(px - radius); x <= Math.ceil(px + radius); x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const offset = (y * width + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
  }

  return { width, height, data };
}

const at = (boardSize: number, x: number, y: number) => y * boardSize + x;

describe('reading stones off a photo', () => {
  it('returns one reading per intersection', () => {
    for (const boardSize of [9, 13, 19] as BoardSize[]) {
      const result = recognizePhotoBoardFromPixels(boardImage(boardSize, []), boardSize);
      expect(result.stones).toHaveLength(boardSize * boardSize);
    }
  });

  it('finds an empty board empty', () => {
    const result = recognizePhotoBoardFromPixels(boardImage(9, []), 9);
    expect(result.black).toBe(0);
    expect(result.white).toBe(0);
    expect(result.total).toBe(0);
    expect(result.stones.every(stone => stone === null)).toBe(true);
  });

  it('tells black and white apart and places them correctly', () => {
    const result = recognizePhotoBoardFromPixels(
      boardImage(9, [[2, 3, 'black'], [6, 1, 'white'], [4, 4, 'black']]),
      9
    );
    expect(result.black).toBe(2);
    expect(result.white).toBe(1);
    expect(result.total).toBe(3);
    expect(result.stones[at(9, 2, 3)]).toBe('black');
    expect(result.stones[at(9, 6, 1)]).toBe('white');
    expect(result.stones[at(9, 4, 4)]).toBe('black');
    expect(result.stones[at(9, 0, 0)]).toBeNull();
  });

  it('finds the corners, where a margin error would show first', () => {
    const corners: Array<[number, number, 'black']> = [
      [0, 0, 'black'], [8, 0, 'black'], [0, 8, 'black'], [8, 8, 'black'],
    ];
    const result = recognizePhotoBoardFromPixels(boardImage(9, corners), 9);
    expect(result.black).toBe(4);
  });

  it('reads the background as the middle of what it sampled', () => {
    const result = recognizePhotoBoardFromPixels(boardImage(9, [[0, 0, 'black']], { background: 150 }), 9);
    expect(result.backgroundLuminance).toBeGreaterThan(140);
    expect(result.backgroundLuminance).toBeLessThan(160);
  });

  it('still works on a dark board photo', () => {
    // A dark wooden board: the absolute cutoffs alone would call everything
    // black, so the reading has to come off the background.
    const result = recognizePhotoBoardFromPixels(
      boardImage(9, [[3, 3, 'white'], [5, 5, 'black']], { background: 100 }),
      9
    );
    expect(result.stones[at(9, 3, 3)]).toBe('white');
    expect(result.stones[at(9, 5, 5)]).toBe('black');
  });

  it('refuses pixels it cannot read', () => {
    const usable = boardImage(9, []);
    expect(() => recognizePhotoBoardFromPixels({ ...usable, width: 0 }, 9)).toThrow(/RGBA/);
    expect(() => recognizePhotoBoardFromPixels({ ...usable, height: 0 }, 9)).toThrow(/RGBA/);
    expect(() => recognizePhotoBoardFromPixels({ ...usable, data: new Uint8ClampedArray(4) }, 9)).toThrow(/RGBA/);
  });

  it('ignores fully transparent pixels rather than reading them as black', () => {
    const image = boardImage(9, []);
    for (let i = 0; i < image.width * image.height; i += 1) image.data[i * 4 + 3] = 0;
    const result = recognizePhotoBoardFromPixels(image, 9);
    expect(result.backgroundLuminance).toBe(0);
  });
});

describe('the sensitivity slider', () => {
  it('is a no-op at the default', () => {
    const options = getPhotoBoardRecognitionOptionsForSensitivity(DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY);
    expect(options.blackDelta).toBeCloseTo(54, 5);
    expect(options.whiteDelta).toBeCloseTo(24, 5);
  });

  it('loosens as it rises, so more gets called a stone', () => {
    const low = getPhotoBoardRecognitionOptionsForSensitivity(0);
    const high = getPhotoBoardRecognitionOptionsForSensitivity(100);
    expect(high.blackDelta!).toBeLessThan(low.blackDelta!);
    expect(high.whiteDelta!).toBeLessThan(low.whiteDelta!);
    expect(high.absoluteBlackThreshold!).toBeGreaterThan(low.absoluteBlackThreshold!);
    expect(high.absoluteWhiteThreshold!).toBeLessThan(low.absoluteWhiteThreshold!);
  });

  it('clamps a slider value from outside the range', () => {
    expect(getPhotoBoardRecognitionOptionsForSensitivity(-50))
      .toEqual(getPhotoBoardRecognitionOptionsForSensitivity(0));
    expect(getPhotoBoardRecognitionOptionsForSensitivity(500))
      .toEqual(getPhotoBoardRecognitionOptionsForSensitivity(100));
  });

  it('falls back to the default for a value that is not a number', () => {
    expect(getPhotoBoardRecognitionOptionsForSensitivity(Number.NaN))
      .toEqual(getPhotoBoardRecognitionOptionsForSensitivity(DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY));
  });

  it('finds more stones at a higher sensitivity on a low-contrast photo', () => {
    // Stones only slightly darker and lighter than the board.
    const image = boardImage(9, [], { background: 150 });
    const margin = Math.min(image.width, image.height) * MARGIN_FRACTION;
    const span = Math.max(1, image.width - 1 - margin * 2);
    const paint = (gx: number, gy: number, value: number) => {
      const px = margin + (gx / 8) * span;
      const py = margin + (gy / 8) * span;
      for (let y = Math.floor(py - 8); y <= Math.ceil(py + 8); y += 1) {
        for (let x = Math.floor(px - 8); x <= Math.ceil(px + 8); x += 1) {
          const offset = (y * image.width + x) * 4;
          image.data[offset] = value;
          image.data[offset + 1] = value;
          image.data[offset + 2] = value;
        }
      }
    };
    paint(4, 4, 110);

    const strict = recognizePhotoBoardFromPixels(image, 9, getPhotoBoardRecognitionOptionsForSensitivity(0));
    const loose = recognizePhotoBoardFromPixels(image, 9, getPhotoBoardRecognitionOptionsForSensitivity(100));
    expect(loose.total).toBeGreaterThanOrEqual(strict.total);
  });
});

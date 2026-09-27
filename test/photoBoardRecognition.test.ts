import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardSize } from '../src/types';
import {
  DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY,
  getPhotoBoardRecognitionOptionsForSensitivity,
  getPhotoBoardRecognitionSize,
  PHOTO_BOARD_RECOGNITION_MAX_SIDE,
  recognizePhotoBoardFromImageUrl,
  recognizePhotoBoardFromPixels,
  scalePhotoBoardCorners,
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

  it('reads fully transparent pixels as board rather than as black', () => {
    const image = boardImage(9, []);
    for (let i = 0; i < image.width * image.height; i += 1) image.data[i * 4 + 3] = 0;
    const result = recognizePhotoBoardFromPixels(image, 9);
    expect(result.backgroundLuminance).toBeGreaterThan(100);
    expect(result.total).toBe(0);
  });

  it('finds black stones on a diagram with a transparent background', () => {
    // Every empty point used to read luminance 0, so the background median
    // was 0 and nothing could be dark enough to count as black.
    const image = boardImage(9, [[2, 2, 'black'], [6, 6, 'black'], [4, 4, 'white']]);
    for (let i = 0; i < image.width * image.height; i += 1) {
      const lum = image.data[i * 4]!;
      if (lum !== 10 && lum !== 245) image.data[i * 4 + 3] = 0;
    }
    const result = recognizePhotoBoardFromPixels(image, 9);
    expect(result.black).toBe(2);
    expect(result.white).toBe(1);
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

describe('reading a board that is not square to the frame', () => {
  /**
   * The sampler's default grid assumes the board fills the photo and is square
   * to it. A photo taken over a real board never is: tilt the camera and the
   * far edge foreshortens, so a straight grid drifts off the intersections and
   * reads stones from the wrong points.
   *
   * These build the photo the other way round -- pick a quad, project the board
   * onto it, and draw the stones where they would actually land.
   */
  type Point = { x: number; y: number };

  const project = (corners: readonly [Point, Point, Point, Point], u: number, v: number): Point => {
    const [p0, p1, p2, p3] = corners;
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const dy3 = p0.y - p1.y + p2.y - p3.y;
    const denominator = dx1 * dy2 - dx2 * dy1;
    const g = denominator === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / denominator;
    const h = denominator === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / denominator;
    const a = p1.x - p0.x + g * p1.x;
    const b = p3.x - p0.x + h * p3.x;
    const d = p1.y - p0.y + g * p1.y;
    const e = p3.y - p0.y + h * p3.y;
    const w = g * u + h * v + 1 || 1e-6;
    return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
  };

  const photoOfQuad = (
    boardSize: BoardSize,
    corners: readonly [Point, Point, Point, Point],
    stones: Array<[number, number, 'black' | 'white']>,
    { size = 400, background = 150 } = {}
  ) => {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      data[i * 4] = background;
      data[i * 4 + 1] = background;
      data[i * 4 + 2] = background;
      data[i * 4 + 3] = 255;
    }
    const last = boardSize - 1;
    // Radius from the shortest edge, matching what the recognizer will use.
    let shortest = Infinity;
    for (let i = 0; i < 4; i += 1) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      shortest = Math.min(shortest, Math.hypot(b.x - a.x, b.y - a.y));
    }
    const radius = Math.max(2, (shortest / last) * 0.24);
    for (const [gx, gy, colour] of stones) {
      const { x: px, y: py } = project(corners, gx / last, gy / last);
      const value = colour === 'black' ? 10 : 245;
      for (let y = Math.floor(py - radius); y <= Math.ceil(py + radius); y += 1) {
        for (let x = Math.floor(px - radius); x <= Math.ceil(px + radius); x += 1) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const offset = (y * size + x) * 4;
          data[offset] = value;
          data[offset + 1] = value;
          data[offset + 2] = value;
          data[offset + 3] = 255;
        }
      }
    }
    return { width: size, height: size, data };
  };

  // A board seen from behind and above: the far edge is narrower and higher.
  const TILTED: readonly [Point, Point, Point, Point] = [
    { x: 120, y: 60 },
    { x: 280, y: 60 },
    { x: 370, y: 330 },
    { x: 30, y: 330 },
  ];
  const STONES: Array<[number, number, 'black' | 'white']> = [
    [0, 0, 'black'],
    [8, 0, 'white'],
    [4, 4, 'black'],
    [0, 8, 'white'],
    [8, 8, 'black'],
    [6, 2, 'black'],
  ];
  const at = (result: { stones: Array<'black' | 'white' | null> }, x: number, y: number) => result.stones[y * 9 + x];

  it('reads every stone once it is told where the corners are', () => {
    const image = photoOfQuad(9, TILTED, STONES);
    const result = recognizePhotoBoardFromPixels(image, 9, { corners: TILTED });

    for (const [x, y, colour] of STONES) {
      expect(at(result, x, y), `${x},${y}`).toBe(colour);
    }
    expect(result.total).toBe(STONES.length);
  });

  it('reads the same photo wrongly without them, which is the point', () => {
    const image = photoOfQuad(9, TILTED, STONES);
    const straight = recognizePhotoBoardFromPixels(image, 9, {});
    const aligned = recognizePhotoBoardFromPixels(image, 9, { corners: TILTED });

    // Not a claim about how it fails, only that the straight grid does not
    // recover the position the corners do.
    expect(straight.stones).not.toEqual(aligned.stones);
  });

  it('changes nothing when the corners describe the default grid', () => {
    const image = boardImage(9, [[2, 2, 'black'], [6, 6, 'white'], [4, 0, 'black']]);
    const margin = 400 * MARGIN_FRACTION;
    const span = Math.max(1, 400 - 1 - margin * 2);
    const square: readonly [Point, Point, Point, Point] = [
      { x: margin, y: margin },
      { x: margin + span, y: margin },
      { x: margin + span, y: margin + span },
      { x: margin, y: margin + span },
    ];

    expect(recognizePhotoBoardFromPixels(image, 9, { corners: square }).stones).toEqual(
      recognizePhotoBoardFromPixels(image, 9, {}).stones
    );
  });

  it('ignores corners it cannot use, rather than sampling nonsense', () => {
    const image = boardImage(9, [[2, 2, 'black']]);
    const plain = recognizePhotoBoardFromPixels(image, 9, {}).stones;
    const broken = [
      { x: Number.NaN, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ] as unknown as readonly [Point, Point, Point, Point];

    expect(recognizePhotoBoardFromPixels(image, 9, { corners: broken }).stones).toEqual(plain);
  });
});

describe('reading a large photo at a bounded size', () => {
  /**
   * The recognizer used to draw the photo onto a canvas at its natural size and
   * read every pixel back: a 48-megapixel phone photo was a full-size canvas
   * plus a 192 MB RGBA buffer on the main thread, for a sampler that averages
   * patches a quarter of a grid cell across.
   */
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shrinks only images past the limit, keeping their shape', () => {
    expect(getPhotoBoardRecognitionSize(8000, 6000)).toEqual({ width: 2048, height: 1536 });
    expect(getPhotoBoardRecognitionSize(3000, 12000)).toEqual({ width: 512, height: 2048 });
    expect(getPhotoBoardRecognitionSize(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(getPhotoBoardRecognitionSize(PHOTO_BOARD_RECOGNITION_MAX_SIDE, 10)).toEqual({
      width: PHOTO_BOARD_RECOGNITION_MAX_SIDE,
      height: 10,
    });
    expect(getPhotoBoardRecognitionSize(100000, 10).height).toBe(1);
  });

  it('reads the same stones from a downscaled copy with its corners moved to match', () => {
    type Point = { x: number; y: number };
    const full = boardImage(19, [[0, 0, 'black'], [3, 15, 'white'], [9, 9, 'black'], [18, 18, 'white']], { size: 1200 });
    const size = getPhotoBoardRecognitionSize(full.width, full.height, 300);
    // Box-average down by four, the way a high-quality canvas downscale would.
    const factor = full.width / size.width;
    const small = new Uint8ClampedArray(size.width * size.height * 4);
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        for (let c = 0; c < 4; c += 1) {
          let sum = 0;
          for (let dy = 0; dy < factor; dy += 1) {
            for (let dx = 0; dx < factor; dx += 1) {
              sum += full.data[((y * factor + dy) * full.width + x * factor + dx) * 4 + c]!;
            }
          }
          small[(y * size.width + x) * 4 + c] = sum / (factor * factor);
        }
      }
    }
    const margin = full.width * MARGIN_FRACTION;
    const span = full.width - 1 - margin * 2;
    const corners: readonly [Point, Point, Point, Point] = [
      { x: margin, y: margin },
      { x: margin + span, y: margin },
      { x: margin + span, y: margin + span },
      { x: margin, y: margin + span },
    ];

    const expected = recognizePhotoBoardFromPixels(full, 19, { corners });
    const scaled = scalePhotoBoardCorners(corners, size.width / full.width, size.height / full.height);
    const actual = recognizePhotoBoardFromPixels({ ...size, data: small }, 19, { corners: scaled });
    expect(expected.total).toBe(4);
    expect(actual.stones).toEqual(expected.stones);
  });

  it('never reads more than the working size off the canvas, and scales the corners to it', async () => {
    const natural = { width: 8000, height: 6000 };
    const drawn: number[][] = [];
    const read: number[][] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        drawImage: (_image: unknown, ...args: number[]) => drawn.push(args),
        getImageData: (x: number, y: number, w: number, h: number) => {
          read.push([x, y, w, h]);
          const data = new Uint8ClampedArray(w * h * 4).fill(150);
          // A black stone on the top-left intersection, where it lands once
          // the corner placed at (800, 600) is scaled onto the working copy.
          for (let py = 114; py <= 194; py += 1) {
            for (let px = 165; px <= 245; px += 1) data.fill(10, (py * w + px) * 4, (py * w + px) * 4 + 3);
          }
          return { width: w, height: h, data };
        },
      }),
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = natural.width;
        naturalHeight = natural.height;
        width = natural.width;
        height = natural.height;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );

    const corners = [
      { x: 800, y: 600 },
      { x: 7200, y: 600 },
      { x: 7200, y: 5400 },
      { x: 800, y: 5400 },
    ] as const;
    const result = await recognizePhotoBoardFromImageUrl('blob:photo', 9, { corners });

    expect(drawn).toEqual([[0, 0, 2048, 1536]]);
    expect(read).toEqual([[0, 0, 2048, 1536]]);
    expect(result.stones).toHaveLength(81);
    expect(result.stones[0]).toBe('black');
    expect(result.total).toBe(1);
  });
});

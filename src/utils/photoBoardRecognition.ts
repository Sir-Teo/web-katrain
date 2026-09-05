import type { BoardSize } from '../types';
import type { PhotoBoardStone } from './photoBoard';

export type PhotoBoardRecognitionImage = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

/** A point in image pixels. */
export type PhotoBoardPoint = { x: number; y: number };

/**
 * The four board corners in the photo, as the outermost line intersections --
 * top-left, top-right, bottom-right, bottom-left, in that order.
 */
export type PhotoBoardCorners = readonly [PhotoBoardPoint, PhotoBoardPoint, PhotoBoardPoint, PhotoBoardPoint];

export type PhotoBoardRecognitionOptions = {
  marginFraction?: number;
  blackDelta?: number;
  whiteDelta?: number;
  absoluteBlackThreshold?: number;
  absoluteWhiteThreshold?: number;
  /**
   * Where the board actually sits in the photo. Without it the sampler assumes
   * the board is square to the frame and fills it bar a fixed margin, which a
   * photo taken from a chair over a real board never is: tilt the camera and
   * every interior intersection drifts off its line, so the grid reads stones
   * from the wrong points and the further from the centre the worse it gets.
   */
  corners?: PhotoBoardCorners;
};

export type PhotoBoardRecognitionResult = {
  stones: PhotoBoardStone[];
  black: number;
  white: number;
  total: number;
  backgroundLuminance: number;
};

/**
 * Measured limits of this classical detector, on a synthetic 9x9 with six
 * stones and a top-to-bottom lighting falloff (2026-09-05):
 *
 *   even lighting        6/6 stones, 0 spurious
 *   40 units darker      5/6
 *   80-120 units         5/6 then 4/6
 *   160 units            4/6, and 7 stones invented from shaded empty points
 *   200 units            3/6, 16 invented
 *
 * The single background median is what gives way: a gradient pulls it away from
 * both ends at once, so the shaded half of the board falls past the black
 * cutoff while the lit half's white stones do not reach the white one.
 *
 * Flattening the illumination with a fitted plane was tried and **reverted**.
 * It removed every spurious stone but found fewer real ones (3/6 where the
 * current code finds 5/6 at an 80-unit falloff), so it traded one failure for
 * another rather than fixing anything -- and tuning further would have meant
 * fitting a classical detector to a synthetic written to test it. Corner
 * alignment does not help here either; this is about light, not geometry. A
 * trained detector is the answer, and that is a dependency decision.
 */
const DEFAULT_MARGIN_FRACTION = 0.06;
export const DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY = 50;

const clampSensitivity = (value: number): number =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY));

export function getPhotoBoardRecognitionOptionsForSensitivity(sensitivity: number): PhotoBoardRecognitionOptions {
  const normalized = (clampSensitivity(sensitivity) - DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY) / DEFAULT_PHOTO_BOARD_RECOGNITION_SENSITIVITY;
  return {
    blackDelta: 54 - normalized * 24,
    whiteDelta: 24 - normalized * 16,
    absoluteBlackThreshold: 86 + normalized * 34,
    absoluteWhiteThreshold: 218 - normalized * 28,
  };
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, value));

const luminance = (r: number, g: number, b: number): number =>
  0.2126 * clampByte(r) + 0.7152 * clampByte(g) + 0.0722 * clampByte(b);

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return value;
  return ((sorted[middle - 1] ?? value) + value) / 2;
};

function samplePatchLuminance(image: PhotoBoardRecognitionImage, cx: number, cy: number, radius: number): number {
  const { width, height, data } = image;
  let sum = 0;
  let count = 0;
  const left = Math.max(0, Math.round(cx - radius));
  const right = Math.min(width - 1, Math.round(cx + radius));
  const top = Math.max(0, Math.round(cy - radius));
  const bottom = Math.min(height - 1, Math.round(cy + radius));

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3] ?? 255;
      if (alpha < 8) continue;
      sum += luminance(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
      count += 1;
    }
  }

  return count > 0 ? sum / count : 0;
}

const normalizeCorners = (corners: PhotoBoardCorners | undefined): PhotoBoardCorners | null => {
  if (!corners || corners.length !== 4) return null;
  for (const corner of corners) {
    if (!corner || !Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return null;
  }
  return corners;
};

const shortestEdge = (corners: PhotoBoardCorners): number => {
  let shortest = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    shortest = Math.min(shortest, Math.hypot(b.x - a.x, b.y - a.y));
  }
  return Math.max(1, shortest);
};

/**
 * Maps the unit square onto the corner quad, projectively.
 *
 * A board photographed off-axis is a plane seen by a pinhole camera, so the
 * mapping is a homography and not a stretch: interpolating the quad linearly
 * would place the centre lines evenly when perspective crowds the far ones
 * together, which is exactly the error this is here to remove. Closed form for
 * unit-square-to-quad, degenerating to the affine case when the quad is a
 * parallelogram.
 */
const projectiveMap = (corners: PhotoBoardCorners) => {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let a: number, b: number, d: number, e: number, g: number, h: number;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if ((dx3 === 0 && dy3 === 0) || denominator === 0) {
    g = 0;
    h = 0;
    a = p1.x - p0.x;
    b = p3.x - p0.x;
    d = p1.y - p0.y;
    e = p3.y - p0.y;
  } else {
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
  }
  const c = p0.x;
  const f = p0.y;

  return (u: number, v: number) => {
    const w = g * u + h * v + 1;
    const safe = w === 0 ? 1e-6 : w;
    return { x: (a * u + b * v + c) / safe, y: (d * u + e * v + f) / safe };
  };
};

export function recognizePhotoBoardFromPixels(
  image: PhotoBoardRecognitionImage,
  boardSize: BoardSize,
  options: PhotoBoardRecognitionOptions = {}
): PhotoBoardRecognitionResult {
  if (image.width <= 0 || image.height <= 0 || image.data.length < image.width * image.height * 4) {
    throw new Error('Photo board recognition needs RGBA pixels.');
  }

  const marginFraction = Math.max(0, Math.min(0.25, options.marginFraction ?? DEFAULT_MARGIN_FRACTION));
  const minDimension = Math.min(image.width, image.height);
  const margin = minDimension * marginFraction;
  const spanX = Math.max(1, image.width - 1 - margin * 2);
  const spanY = Math.max(1, image.height - 1 - margin * 2);
  const lastLine = Math.max(1, boardSize - 1);
  const corners = normalizeCorners(options.corners);
  const project = corners
    ? projectiveMap(corners)
    : (u: number, v: number) => ({ x: margin + u * spanX, y: margin + v * spanY });
  const cellSize = corners
    ? shortestEdge(corners) / lastLine
    : Math.min(spanX, spanY) / lastLine;
  const radius = Math.max(2, cellSize * 0.24);
  const samples: number[] = [];

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const point = project(x / lastLine, y / lastLine);
      samples.push(samplePatchLuminance(image, point.x, point.y, radius));
    }
  }

  const backgroundLuminance = median(samples);
  const blackCutoff = Math.min(
    options.absoluteBlackThreshold ?? 86,
    backgroundLuminance - (options.blackDelta ?? 54)
  );
  const whiteCutoff = Math.max(
    options.absoluteWhiteThreshold ?? 218,
    backgroundLuminance + (options.whiteDelta ?? 24)
  );

  let black = 0;
  let white = 0;
  const stones = samples.map<PhotoBoardStone>((value) => {
    if (value <= blackCutoff) {
      black += 1;
      return 'black';
    }
    if (value >= whiteCutoff) {
      white += 1;
      return 'white';
    }
    return null;
  });

  return {
    stones,
    black,
    white,
    total: black + white,
    backgroundLuminance,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode board photo.'));
    image.src = url;
  });
}

export async function recognizePhotoBoardFromImageUrl(
  url: string,
  boardSize: BoardSize,
  options?: PhotoBoardRecognitionOptions
): Promise<PhotoBoardRecognitionResult> {
  if (typeof document === 'undefined') {
    throw new Error('Photo board recognition needs a browser canvas.');
  }
  const image = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo board recognition needs a browser canvas.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return recognizePhotoBoardFromPixels(context.getImageData(0, 0, canvas.width, canvas.height), boardSize, options);
}

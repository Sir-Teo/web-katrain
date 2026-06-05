import type { BoardSize } from '../types';
import type { PhotoBoardStone } from './photoBoard';

export type PhotoBoardRecognitionImage = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

export type PhotoBoardRecognitionOptions = {
  marginFraction?: number;
  blackDelta?: number;
  whiteDelta?: number;
  absoluteBlackThreshold?: number;
  absoluteWhiteThreshold?: number;
};

export type PhotoBoardRecognitionResult = {
  stones: PhotoBoardStone[];
  black: number;
  white: number;
  total: number;
  backgroundLuminance: number;
};

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
  const cellSize = Math.min(spanX, spanY) / Math.max(1, boardSize - 1);
  const radius = Math.max(2, cellSize * 0.24);
  const samples: number[] = [];

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const px = margin + (x / Math.max(1, boardSize - 1)) * spanX;
      const py = margin + (y / Math.max(1, boardSize - 1)) * spanY;
      samples.push(samplePatchLuminance(image, px, py, radius));
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

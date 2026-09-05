import type { PhotoBoardCorners, PhotoBoardPoint } from './photoBoardRecognition';

/** A corner expressed as a fraction of the natural image, 0..1 on each axis. */
export type CornerFraction = { x: number; y: number };
export type CornerFractions = readonly [CornerFraction, CornerFraction, CornerFraction, CornerFraction];

/** Order is top-left, top-right, bottom-right, bottom-left, matching the sampler. */
export const CORNER_LABELS = ['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const;

/** Same 6% inset the recognizer falls back to when no corners are given. */
const DEFAULT_MARGIN_FRACTION = 0.06;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Where the handles start: the rectangle the sampler already assumes.
 *
 * Deliberately the same rect rather than the whole image, so opening the
 * aligner and immediately tracing gives the result it gave before. Anything
 * else would change the read for every existing photo the moment the handles
 * appeared.
 */
export function defaultCornerFractions(width: number, height: number): CornerFractions {
  if (!(width > 0) || !(height > 0)) {
    return [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
  }
  const margin = Math.min(width, height) * DEFAULT_MARGIN_FRACTION;
  const spanX = Math.max(1, width - 1 - margin * 2);
  const spanY = Math.max(1, height - 1 - margin * 2);
  const left = margin / width;
  const right = (margin + spanX) / width;
  const top = margin / height;
  const bottom = (margin + spanY) / height;
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/**
 * The box the photo actually occupies inside its element.
 *
 * The preview is `object-contain`, so the image is letterboxed: the element's
 * own rect is not where the picture is, and a handle placed against element
 * coordinates would sit off the board by the size of the bars.
 */
export function containedImageRect(
  elementWidth: number,
  elementHeight: number,
  naturalWidth: number,
  naturalHeight: number
): { left: number; top: number; width: number; height: number } {
  if (!(naturalWidth > 0) || !(naturalHeight > 0) || !(elementWidth > 0) || !(elementHeight > 0)) {
    return { left: 0, top: 0, width: Math.max(0, elementWidth), height: Math.max(0, elementHeight) };
  }
  const scale = Math.min(elementWidth / naturalWidth, elementHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return { left: (elementWidth - width) / 2, top: (elementHeight - height) / 2, width, height };
}

/** Element-relative pointer position to a fraction of the photo, clamped. */
export function cornerFractionFromPointer(
  offsetX: number,
  offsetY: number,
  elementWidth: number,
  elementHeight: number,
  naturalWidth: number,
  naturalHeight: number
): CornerFraction {
  const rect = containedImageRect(elementWidth, elementHeight, naturalWidth, naturalHeight);
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((offsetX - rect.left) / rect.width),
    y: clamp01((offsetY - rect.top) / rect.height),
  };
}

/** Where a handle sits inside its container, in element pixels. */
export function cornerFractionToElementPoint(
  corner: CornerFraction,
  elementWidth: number,
  elementHeight: number,
  naturalWidth: number,
  naturalHeight: number
): PhotoBoardPoint {
  const rect = containedImageRect(elementWidth, elementHeight, naturalWidth, naturalHeight);
  return { x: rect.left + clamp01(corner.x) * rect.width, y: rect.top + clamp01(corner.y) * rect.height };
}

/** Fractions to the natural-pixel corners the recognizer wants. */
export function cornersToImagePixels(
  corners: CornerFractions,
  naturalWidth: number,
  naturalHeight: number
): PhotoBoardCorners {
  return corners.map((corner) => ({
    x: clamp01(corner.x) * naturalWidth,
    y: clamp01(corner.y) * naturalHeight,
  })) as unknown as PhotoBoardCorners;
}

/**
 * Whether the quad is usable: four distinct, non-collinear corners that still
 * go round the board rather than crossing over. A bow-tie quad still has a
 * homography, but it maps the board inside out.
 */
export function areCornersUsable(corners: CornerFractions): boolean {
  for (const corner of corners) {
    if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return false;
  }
  const cross = (o: CornerFraction, a: CornerFraction, b: CornerFraction) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const value = cross(corners[i]!, corners[(i + 1) % 4]!, corners[(i + 2) % 4]!);
    if (Math.abs(value) < 1e-6) return false;
    const next = value > 0 ? 1 : -1;
    if (sign === 0) sign = next;
    else if (sign !== next) return false;
  }
  return true;
}

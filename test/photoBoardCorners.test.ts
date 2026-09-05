import { describe, expect, it } from 'vitest';
import {
  areCornersUsable,
  containedImageRect,
  cornerFractionFromPointer,
  cornerFractionToElementPoint,
  cornersToImagePixels,
  defaultCornerFractions,
  type CornerFractions,
} from '../src/utils/photoBoardCorners';
import { recognizePhotoBoardFromPixels } from '../src/utils/photoBoardRecognition';

const UNIT_SQUARE: CornerFractions = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

describe('placing the board corners on a photo', () => {
  it('starts on the rectangle the sampler already assumed', () => {
    /**
     * The handles have to open where the old fixed grid sat, or every photo
     * that scanned correctly before would read differently the moment the
     * aligner shipped. Checked against the recognizer itself rather than
     * against the 6% arithmetic, so the two cannot drift apart.
     */
    const size = 400;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      data[i * 4] = 150;
      data[i * 4 + 1] = 150;
      data[i * 4 + 2] = 150;
      data[i * 4 + 3] = 255;
    }
    // A couple of dark patches so the two reads have something to disagree on.
    for (let y = 100; y < 130; y += 1) {
      for (let x = 100; x < 130; x += 1) {
        const offset = (y * size + x) * 4;
        data[offset] = 10;
        data[offset + 1] = 10;
        data[offset + 2] = 10;
      }
    }
    const image = { width: size, height: size, data };
    const corners = cornersToImagePixels(defaultCornerFractions(size, size), size, size);

    expect(recognizePhotoBoardFromPixels(image, 9, { corners }).stones).toEqual(
      recognizePhotoBoardFromPixels(image, 9, {}).stones
    );
  });

  it('finds the photo inside its letterbox', () => {
    // A 2:1 photo in a square box: bars top and bottom, none at the sides.
    expect(containedImageRect(400, 400, 800, 400)).toEqual({ left: 0, top: 100, width: 400, height: 200 });
    // A tall photo in a wide box: bars at the sides.
    expect(containedImageRect(400, 200, 200, 400)).toEqual({ left: 150, top: 0, width: 100, height: 200 });
  });

  it('reads a pointer against the photo, not against the element', () => {
    // Centre of the element is the centre of the photo whatever the bars do.
    expect(cornerFractionFromPointer(200, 200, 400, 400, 800, 400)).toEqual({ x: 0.5, y: 0.5 });
    // A point in the letterbox bar clamps to the edge instead of going negative.
    expect(cornerFractionFromPointer(200, 20, 400, 400, 800, 400)).toEqual({ x: 0.5, y: 0 });
    expect(cornerFractionFromPointer(200, 380, 400, 400, 800, 400)).toEqual({ x: 0.5, y: 1 });
  });

  it('round-trips a handle between fraction and element pixels', () => {
    const point = cornerFractionToElementPoint({ x: 0.25, y: 0.75 }, 400, 400, 800, 400);
    expect(point).toEqual({ x: 100, y: 250 });
    expect(cornerFractionFromPointer(point.x, point.y, 400, 400, 800, 400)).toEqual({ x: 0.25, y: 0.75 });
  });

  it('scales fractions to the natural pixels the recognizer wants', () => {
    expect(cornersToImagePixels(UNIT_SQUARE, 640, 480)).toEqual([
      { x: 0, y: 0 },
      { x: 640, y: 0 },
      { x: 640, y: 480 },
      { x: 0, y: 480 },
    ]);
  });

  describe('rejecting a quad that is not a board', () => {
    it('accepts an ordinary tilted quad', () => {
      expect(areCornersUsable([
        { x: 0.2, y: 0.1 },
        { x: 0.8, y: 0.15 },
        { x: 0.95, y: 0.9 },
        { x: 0.05, y: 0.85 },
      ])).toBe(true);
    });

    it('rejects a bow tie, which maps the board inside out', () => {
      // Top-right and bottom-right swapped: still four points, still a
      // homography, but the board comes back mirrored through the crossing.
      expect(areCornersUsable([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ])).toBe(false);
    });

    it('rejects collapsed and collinear quads', () => {
      expect(areCornersUsable(UNIT_SQUARE.map(() => ({ x: 0.5, y: 0.5 })) as unknown as CornerFractions)).toBe(false);
      expect(areCornersUsable([
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: 0 },
      ])).toBe(false);
    });

    it('rejects a corner that is not a number', () => {
      expect(areCornersUsable([
        { x: Number.NaN, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ])).toBe(false);
    });
  });
});

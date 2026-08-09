import type { BoardState } from '../types';

// Helpers for the freehand drawing and region-inspection board tools.
// Coordinates are internal board units; region rects are inclusive
// integer intersection ranges.

export type RegionRect = { xMin: number; xMax: number; yMin: number; yMax: number };

// Minimum distance (in board cells) between recorded stroke points; keeps
// strokes light without visible corner-cutting.
export const MIN_STROKE_POINT_DISTANCE = 0.12;

/** Append `pt` to `points` if it moved far enough from the last point. Returns true when appended. */
export function appendStrokePoint(
  points: Array<{ x: number; y: number }>,
  pt: { x: number; y: number },
  minDistance = MIN_STROKE_POINT_DISTANCE
): boolean {
  const last = points[points.length - 1];
  if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < minDistance) return false;
  points.push({ x: pt.x, y: pt.y });
  return true;
}

export function normalizeRegionRect(a: { x: number; y: number }, b: { x: number; y: number }): RegionRect {
  return {
    xMin: Math.min(a.x, b.x),
    xMax: Math.max(a.x, b.x),
    yMin: Math.min(a.y, b.y),
    yMax: Math.max(a.y, b.y),
  };
}

export interface RegionStoneCount {
  black: number;
  white: number;
  empty: number;
  points: number;
}

export function countRegionStones(board: BoardState, rect: RegionRect): RegionStoneCount {
  let black = 0;
  let white = 0;
  let points = 0;
  for (let y = rect.yMin; y <= rect.yMax; y++) {
    for (let x = rect.xMin; x <= rect.xMax; x++) {
      const cell = board[y]?.[x];
      if (cell === undefined) continue;
      points++;
      if (cell === 'black') black++;
      else if (cell === 'white') white++;
    }
  }
  return { black, white, empty: points - black - white, points };
}

export interface RegionOwnershipSummary {
  /** Net ownership points in the region; positive favors Black. */
  net: number;
  points: number;
}

/** Sum AI ownership over a region (positive = Black), or null without ownership data. */
export function sumRegionOwnership(
  territory: number[][] | null | undefined,
  rect: RegionRect
): RegionOwnershipSummary | null {
  if (!territory) return null;
  let net = 0;
  let points = 0;
  for (let y = rect.yMin; y <= rect.yMax; y++) {
    for (let x = rect.xMin; x <= rect.xMax; x++) {
      const val = territory[y]?.[x];
      if (typeof val !== 'number') continue;
      net += val;
      points++;
    }
  }
  if (points === 0) return null;
  return { net, points };
}

export function formatRegionStoneCount(count: RegionStoneCount): string {
  return `Black ${count.black} · White ${count.white} · ${count.empty} empty`;
}

export function formatRegionOwnership(summary: RegionOwnershipSummary | null): string {
  if (!summary) return 'No AI ownership data — analyze this position first';
  const rounded = Math.round(summary.net * 10) / 10;
  if (Math.abs(rounded) < 0.05) return 'AI: even in this region';
  const side = rounded > 0 ? 'Black' : 'White';
  return `AI: ${side} +${Math.abs(rounded).toFixed(1)} in this region`;
}

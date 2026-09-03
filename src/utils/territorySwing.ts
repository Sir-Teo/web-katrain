/**
 * Where the points went.
 *
 * The engine already answers "this move lost 5.2 points". It does not answer
 * the question a player asks next, which is *where on the board* those points
 * were: a slack move in the top left and a bad ko threat in the bottom right
 * both read as "-5.2" in the candidate list.
 *
 * Ownership is per intersection, so the answer is already in the data. Two
 * analysed positions carry two ownership maps; subtracting them says which
 * intersections changed hands and by how much. Strong players do this by eye,
 * flipping between two territory overlays and holding the difference in their
 * head. This computes the difference instead.
 *
 * **What this deliberately does not do: report a number of points.** Ownership
 * and score come from two different heads of the net, and they do not have to
 * agree. Measured on the bundled test net over eight consecutive 9x9 positions,
 * the change in ownership sum and the change in score lead differed by 8 to 25
 * points -- so a "swing" total printed from ownership would sometimes have
 * contradicted the score lead shown beside it, and a wash that disagrees with
 * the number next to it is worse than no wash at all. The score readout owns
 * "how much"; this owns "where", and the two never quote each other.
 */

/**
 * Below this the strongest point on the board barely moved, so there is nothing
 * worth painting: a whole-board wash built out of rounding would read as a
 * finding. 0.15 is a fifth of one intersection changing hands, well under what
 * any real transfer moves.
 */
export const SWING_PEAK_FLOOR = 0.15;

/** A point has meaningfully changed hands past this much ownership. */
export const SWING_POINT_THRESHOLD = 0.25;

export type TerritorySwing = {
  /**
   * `[y][x]` in internal (unrotated) board coordinates, matching
   * `AnalysisResult.territory`. Positive = the point moved toward Black.
   */
  grid: number[][];
  /** The largest single-point move, as an absolute value. */
  peak: number;
  /** Intersections that moved toward Black by at least the threshold. */
  towardBlack: number;
  /** Intersections that moved toward White by at least the threshold. */
  towardWhite: number;
};

const isGrid = (grid: unknown): grid is number[][] =>
  Array.isArray(grid) && grid.length > 0 && Array.isArray(grid[0]);

/**
 * The swing from `before` to `after`.
 *
 * Both grids are Black-positive ownership in internal coordinates, the shape
 * `AnalysisResult.territory` already has. Returns null when either side is
 * missing or the two disagree about the board, which is the normal state for an
 * unanalysed node rather than an error.
 */
export function computeTerritorySwing(
  before: number[][] | null | undefined,
  after: number[][] | null | undefined
): TerritorySwing | null {
  if (!isGrid(before) || !isGrid(after)) return null;
  if (before.length !== after.length) return null;

  const size = after.length;
  const grid: number[][] = [];
  let peak = 0;
  let towardBlack = 0;
  let towardWhite = 0;

  for (let y = 0; y < size; y++) {
    const beforeRow = before[y];
    const afterRow = after[y];
    if (!beforeRow || !afterRow || beforeRow.length !== afterRow.length) return null;
    const row = new Array<number>(afterRow.length);
    for (let x = 0; x < afterRow.length; x++) {
      const a = afterRow[x];
      const b = beforeRow[x];
      // A non-finite reading is a hole in the data, not a swing of zero, but a
      // hole in one corner must not discard the rest of the board.
      const delta = Number.isFinite(a) && Number.isFinite(b) ? a! - b! : 0;
      row[x] = delta;
      const magnitude = Math.abs(delta);
      if (magnitude > peak) peak = magnitude;
      if (delta >= SWING_POINT_THRESHOLD) towardBlack++;
      else if (delta <= -SWING_POINT_THRESHOLD) towardWhite++;
    }
    grid.push(row);
  }

  return { grid, peak, towardBlack, towardWhite };
}

/** True when the swing has something on it worth drawing. */
export function hasVisibleSwing(swing: TerritorySwing | null): swing is TerritorySwing {
  return !!swing && swing.peak >= SWING_PEAK_FLOOR;
}

/**
 * How strongly to paint one point, 0..1.
 *
 * Normalised against the board's own peak rather than against a fixed scale:
 * the interesting comparison is between points in *this* swing, and a fixed
 * scale renders a quiet endgame exchange as a blank board even though that
 * exchange is the whole story of the move.
 */
export function swingAlpha(value: number, peak: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(peak) || peak < SWING_PEAK_FLOOR) return 0;
  const alpha = Math.abs(value) / peak;
  return alpha > 1 ? 1 : alpha;
}

/**
 * The swing in words, counting intersections rather than points -- see the
 * header for why this must not be phrased as a score. Null when nothing moved.
 */
export function describeTerritorySwing(swing: TerritorySwing | null): string | null {
  if (!hasVisibleSwing(swing)) return null;
  const parts: string[] = [];
  if (swing.towardBlack > 0) parts.push(`${swing.towardBlack} toward Black`);
  if (swing.towardWhite > 0) parts.push(`${swing.towardWhite} toward White`);
  if (parts.length === 0) return null;
  const points = swing.towardBlack + swing.towardWhite === 1 ? 'point' : 'points';
  return `${parts.join(', ')} ${points}`;
}

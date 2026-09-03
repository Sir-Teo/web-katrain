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
 * A point has meaningfully changed hands past this much ownership.
 *
 * One threshold serves both the count and the wash, so the two can never
 * disagree: every point the overlay paints is a point the caption counted.
 * Without it the wash is unreadable -- measured live on a real move, 325 of 441
 * intersections carried some non-zero difference, because subtracting two
 * whole-board estimates leaves a haze everywhere. Painting that haze says
 * "the whole board moved", which is exactly the wrong answer.
 */
export const SWING_POINT_THRESHOLD = 0.25;

/**
 * How faint the weakest painted point may be. A point that only just clears the
 * threshold still has to be visible, or the overlay silently drops the edges of
 * the area it is describing.
 */
export const SWING_MIN_ALPHA = 0.35;

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

/**
 * The node the current one should be held against, and what to call it.
 *
 * "Previous" is the move that reached this position: the map then says what
 * the move did. "Best" is the engine's own move at the same turn, played out
 * as a variation, and the map then says what your move gave away relative to
 * it -- which is the question a review is actually asking.
 *
 * The engine's move has to exist as a real, analysed sibling. There is no way
 * around that: ownership for a position nobody evaluated does not exist, and
 * the candidate list carries a score for the move but not a map. Playing it is
 * what buys the map, which is why this returns a reason rather than inventing
 * one.
 */
export type SwingBaseline =
  | { kind: 'previous'; territory: number[][] }
  | { kind: 'best'; territory: number[][]; label: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Structural, not `GameNode`: the resolver needs four fields and nothing else,
 * and naming them keeps it testable without building a whole tree.
 */
type SwingNode = {
  move?: { x: number; y: number } | null;
  analysis?: {
    territory?: number[][];
    moves?: Array<{ x: number; y: number; order: number }>;
  } | null;
  parent?: SwingNode | null;
  children?: SwingNode[];
};

/** Where the swing at `node` should measure from, under `compare`. */
export function resolveSwingBaseline(
  node: SwingNode | null | undefined,
  compare: 'previous' | 'best',
  formatMove: (x: number, y: number) => string
): SwingBaseline {
  const parent = node?.parent;
  if (!node || !parent) return { kind: 'unavailable', reason: 'there is no move before this one' };

  if (compare === 'previous') {
    const territory = parent.analysis?.territory;
    return territory
      ? { kind: 'previous', territory }
      : { kind: 'unavailable', reason: 'needs this move and the one before it analysed' };
  }

  const best = parent.analysis?.moves?.find((move) => move.order === 0);
  if (!best || best.x < 0 || best.y < 0) {
    return { kind: 'unavailable', reason: 'needs the previous position analysed, so the engine has a move to compare' };
  }
  if (node.move && node.move.x === best.x && node.move.y === best.y) {
    return { kind: 'unavailable', reason: 'this is the engine\u2019s move' };
  }
  const sibling = (parent.children ?? []).find(
    (child) => child !== node && child.move?.x === best.x && child.move?.y === best.y
  );
  const label = formatMove(best.x, best.y);
  if (!sibling) {
    return { kind: 'unavailable', reason: `play ${label} from the previous move to compare against it` };
  }
  const territory = sibling.analysis?.territory;
  if (!territory) return { kind: 'unavailable', reason: `${label} is not analysed yet` };
  return { kind: 'best', territory, label };
}

/** True when at least one point changed hands, so there is something to draw. */
export function hasVisibleSwing(swing: TerritorySwing | null): swing is TerritorySwing {
  return !!swing && swing.towardBlack + swing.towardWhite > 0;
}

/**
 * How strongly to paint one point, 0..1.
 *
 * Points under the threshold are haze and paint nothing. Above it the ramp is
 * normalised against the board's own peak rather than a fixed scale, because
 * the interesting comparison is between points in *this* swing: a quiet
 * endgame exchange moves ownership by a fraction of what a capture does, and a
 * fixed scale would render it as a blank board even though that exchange is
 * the whole story of the move.
 */
export function swingAlpha(value: number, peak: number): number {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude) || !Number.isFinite(peak)) return 0;
  if (magnitude < SWING_POINT_THRESHOLD || peak < SWING_POINT_THRESHOLD) return 0;
  const span = peak - SWING_POINT_THRESHOLD;
  const ramp = span > 1e-6 ? Math.min(1, (magnitude - SWING_POINT_THRESHOLD) / span) : 1;
  return SWING_MIN_ALPHA + (1 - SWING_MIN_ALPHA) * ramp;
}

/**
 * The swing in words. Null when nothing moved.
 *
 * "Intersections", not "points". In Go the two words mean the same thing on the
 * board and different things on the scoresheet, and this count is emphatically
 * not a score -- "8 points toward Black" beside a score readout saying White
 * leads is the exact confusion the header exists to avoid.
 */
export function describeTerritorySwing(swing: TerritorySwing | null): string | null {
  if (!hasVisibleSwing(swing)) return null;
  const { towardBlack, towardWhite } = swing;
  const noun = (n: number) => (n === 1 ? 'intersection' : 'intersections');
  if (towardWhite === 0) return `${towardBlack} ${noun(towardBlack)} toward Black`;
  if (towardBlack === 0) return `${towardWhite} ${noun(towardWhite)} toward White`;
  return `${towardBlack} ${noun(towardBlack)} toward Black, ${towardWhite} toward White`;
}

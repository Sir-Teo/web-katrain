/**
 * Which move a point along the analysis graph refers to.
 *
 * Lifted out of the component so the arithmetic can be tested on its own: the
 * graph itself only appears with analysed moves or an SGF that carries a clock,
 * which is not a state a fast test can reach.
 */
export function indexAtGraphX(args: {
  clientX: number;
  /** The graph box, from getBoundingClientRect(). */
  left: number;
  width: number;
  /** Points on the graph; one per move plus the root. */
  count: number;
}): number | null {
  const { clientX, left, width, count } = args;
  if (!Number.isFinite(clientX) || !Number.isFinite(left)) return null;
  // A zero-width box has no position to read, and one point has no span: both
  // would divide by zero.
  if (!(width > 0) || count < 2) return null;
  const index = Math.round(((clientX - left) / width) * (count - 1));
  // Clamped rather than rejected. A drag holds the pointer captured, so the
  // finger goes outside the box routinely -- past the right edge it should sit
  // on the last move, not stop reporting. The mouse never asks: it stops
  // previewing when it leaves.
  return Math.min(count - 1, Math.max(0, index));
}

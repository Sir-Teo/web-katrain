export type PvAnimationProgress = {
  /** Zero-based last PV move to reveal; the first move is visible immediately. */
  upToMove: number;
  /** Time until the picture can change again, or null once every move is shown. */
  nextDelayMs: number | null;
};

/**
 * PV animation is discrete: between move boundaries the board picture is
 * identical. Returning the next boundary lets the UI sleep instead of
 * repainting the whole workspace on every display frame.
 */
export function getPvAnimationProgress(
  elapsedMs: number,
  moveDelayMs: number,
  pvLength: number
): PvAnimationProgress {
  const length = Math.max(0, Math.trunc(pvLength));
  if (length <= 1) return { upToMove: 0, nextDelayMs: null };

  const delay = Math.max(1, moveDelayMs);
  const elapsed = Math.max(0, elapsedMs);
  const lastMoveIndex = length - 1;
  const step = Math.min(lastMoveIndex, Math.floor(elapsed / delay));
  if (step >= lastMoveIndex) return { upToMove: lastMoveIndex, nextDelayMs: null };

  return {
    upToMove: step,
    nextDelayMs: Math.max(1, (step + 1) * delay - elapsed),
  };
}

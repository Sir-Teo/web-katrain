export type PvAnimationProgress = {
  /** Zero-based last PV move to reveal; the first move is visible immediately. */
  upToMove: number;
  /** Time until the picture can change again, or null once every move is shown. */
  nextDelayMs: number | null;
};

/**
 * How many moves of a variation go on the board under "PV Animation Moves".
 *
 * The setting was saved and never read, so a variation always played out in
 * full. Its help text is the contract: a positive number caps the moves laid
 * on the board, and 0 shows the whole sequence at once.
 */
export function getPvVisibleLength(pvLength: number, animPvMoves: number | null | undefined): number {
  const length = Math.max(0, Math.trunc(pvLength));
  if (typeof animPvMoves !== 'number' || !Number.isFinite(animPvMoves) || animPvMoves <= 0) return length;
  return Math.min(length, Math.trunc(animPvMoves));
}

/** Whether the variation is revealed move by move, or shown whole at once. */
export function isPvAnimated(animTimeSeconds: number, animPvMoves: number | null | undefined): boolean {
  if (!(animTimeSeconds > 0)) return false;
  // 0 moves means "the whole sequence at once": no animation at all.
  return !(typeof animPvMoves === 'number' && Number.isFinite(animPvMoves) && animPvMoves <= 0);
}

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

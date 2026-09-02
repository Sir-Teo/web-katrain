/** Bounds for the tsumego frame's "distance of wall", shared by UI and store. */
export const TSUMEGO_FRAME_MIN_MARGIN = 0;
export const TSUMEGO_FRAME_MAX_MARGIN = 8;
export const TSUMEGO_FRAME_DEFAULT_MARGIN = 4;

export const clampTsumegoFrameMargin = (value: number): number => {
  if (!Number.isFinite(value)) return TSUMEGO_FRAME_DEFAULT_MARGIN;
  return Math.max(TSUMEGO_FRAME_MIN_MARGIN, Math.min(TSUMEGO_FRAME_MAX_MARGIN, Math.round(value)));
};

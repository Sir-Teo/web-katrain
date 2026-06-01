export type SwipeNavigationAction = 'previous' | 'next';

export const SWIPE_NAVIGATION_MAX_DURATION_MS = 450;

export type HorizontalSwipeNavigationInput = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTimeMs?: number;
  endTimeMs?: number;
  enabled?: boolean;
  isEditMode?: boolean;
  isSelectingRegionOfInterest?: boolean;
  minDistancePx?: number;
  maxVerticalRatio?: number;
  maxDurationMs?: number;
};

export function getHorizontalSwipeNavigationAction({
  startX,
  startY,
  endX,
  endY,
  startTimeMs,
  endTimeMs,
  enabled = true,
  isEditMode = false,
  isSelectingRegionOfInterest = false,
  minDistancePx = 48,
  maxVerticalRatio = 0.75,
  maxDurationMs = SWIPE_NAVIGATION_MAX_DURATION_MS,
}: HorizontalSwipeNavigationInput): SwipeNavigationAction | null {
  if (!enabled || isEditMode || isSelectingRegionOfInterest) return null;
  if (
    typeof startTimeMs === 'number' &&
    typeof endTimeMs === 'number' &&
    endTimeMs - startTimeMs > maxDurationMs
  ) {
    return null;
  }

  const dx = endX - startX;
  const dy = endY - startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < minDistancePx) return null;
  if (absY > absX * maxVerticalRatio) return null;

  return dx < 0 ? 'next' : 'previous';
}

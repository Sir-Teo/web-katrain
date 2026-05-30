export type SwipeNavigationAction = 'previous' | 'next';

export type HorizontalSwipeNavigationInput = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  enabled?: boolean;
  isEditMode?: boolean;
  isSelectingRegionOfInterest?: boolean;
  minDistancePx?: number;
  maxVerticalRatio?: number;
};

export function getHorizontalSwipeNavigationAction({
  startX,
  startY,
  endX,
  endY,
  enabled = true,
  isEditMode = false,
  isSelectingRegionOfInterest = false,
  minDistancePx = 48,
  maxVerticalRatio = 0.75,
}: HorizontalSwipeNavigationInput): SwipeNavigationAction | null {
  if (!enabled || isEditMode || isSelectingRegionOfInterest) return null;

  const dx = endX - startX;
  const dy = endY - startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < minDistancePx) return null;
  if (absY > absX * maxVerticalRatio) return null;

  return dx < 0 ? 'next' : 'previous';
}

import { describe, expect, it } from 'vitest';
import { getHorizontalSwipeNavigationAction } from '../src/utils/swipeNavigation';

describe('getHorizontalSwipeNavigationAction', () => {
  it('maps horizontal swipes to move navigation', () => {
    expect(getHorizontalSwipeNavigationAction({ startX: 200, startY: 100, endX: 120, endY: 106 })).toBe('next');
    expect(getHorizontalSwipeNavigationAction({ startX: 120, startY: 100, endX: 210, endY: 104 })).toBe('previous');
  });

  it('ignores short or mostly vertical gestures', () => {
    expect(getHorizontalSwipeNavigationAction({ startX: 100, startY: 100, endX: 130, endY: 100 })).toBeNull();
    expect(getHorizontalSwipeNavigationAction({ startX: 100, startY: 100, endX: 170, endY: 170 })).toBeNull();
  });

  it('ignores slow horizontal drags', () => {
    expect(getHorizontalSwipeNavigationAction({
      startX: 200,
      startY: 100,
      endX: 120,
      endY: 104,
      startTimeMs: 1000,
      endTimeMs: 1600,
    })).toBeNull();
    expect(getHorizontalSwipeNavigationAction({
      startX: 200,
      startY: 100,
      endX: 120,
      endY: 104,
      startTimeMs: 1000,
      endTimeMs: 1300,
    })).toBe('next');
  });

  it('ignores swipes while edit mode or region selection is active', () => {
    const swipe = { startX: 200, startY: 100, endX: 120, endY: 100 };
    expect(getHorizontalSwipeNavigationAction({ ...swipe, isEditMode: true })).toBeNull();
    expect(getHorizontalSwipeNavigationAction({ ...swipe, isSelectingRegionOfInterest: true })).toBeNull();
  });
});

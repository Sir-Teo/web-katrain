import { describe, expect, it } from 'vitest';
import {
  isGraphKeyboardNavigationKey,
  nextGraphKeyboardIndex,
} from '../src/utils/graphKeyboard';

describe('analysis graph keyboard helpers', () => {
  it('recognizes graph navigation keys only', () => {
    expect(isGraphKeyboardNavigationKey('ArrowLeft')).toBe(true);
    expect(isGraphKeyboardNavigationKey('End')).toBe(true);
    expect(isGraphKeyboardNavigationKey('Enter')).toBe(false);
    expect(isGraphKeyboardNavigationKey('a')).toBe(false);
  });

  it('moves from the highlighted point when no keyboard point is active', () => {
    expect(nextGraphKeyboardIndex({
      key: 'ArrowRight',
      currentIndex: null,
      highlightedIndex: 2,
      count: 5,
    })).toBe(3);
    expect(nextGraphKeyboardIndex({
      key: 'ArrowLeft',
      currentIndex: null,
      highlightedIndex: 2,
      count: 5,
    })).toBe(1);
  });

  it('clamps and clears keyboard graph selection', () => {
    expect(nextGraphKeyboardIndex({
      key: 'ArrowLeft',
      currentIndex: 0,
      highlightedIndex: 3,
      count: 5,
    })).toBe(0);
    expect(nextGraphKeyboardIndex({
      key: 'End',
      currentIndex: 1,
      highlightedIndex: 3,
      count: 5,
    })).toBe(4);
    expect(nextGraphKeyboardIndex({
      key: 'Escape',
      currentIndex: 1,
      highlightedIndex: 3,
      count: 5,
    })).toBeNull();
  });
});

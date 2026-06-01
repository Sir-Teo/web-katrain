import { describe, expect, it } from 'vitest';
import {
  getInitialBoardKeyboardCursor,
  moveBoardKeyboardCursor,
} from '../src/utils/boardKeyboardNavigation';

describe('board keyboard navigation', () => {
  it('starts at the board center when there is no valid cursor', () => {
    expect(getInitialBoardKeyboardCursor(null, 19)).toEqual({ x: 9, y: 9 });
    expect(getInitialBoardKeyboardCursor({ x: 30, y: 3 }, 19)).toEqual({ x: 9, y: 9 });
    expect(getInitialBoardKeyboardCursor({ x: 2, y: 2 }, 9)).toEqual({ x: 2, y: 2 });
  });

  it('wraps movement across board edges', () => {
    expect(moveBoardKeyboardCursor({ x: 0, y: 0 }, 19, -1, 0)).toEqual({ x: 18, y: 0 });
    expect(moveBoardKeyboardCursor({ x: 18, y: 18 }, 19, 1, 1)).toEqual({ x: 0, y: 0 });
    expect(moveBoardKeyboardCursor(null, 9, 0, -1)).toEqual({ x: 4, y: 3 });
  });
});

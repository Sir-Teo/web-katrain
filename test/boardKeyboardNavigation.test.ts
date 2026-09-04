import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  boardKeyboardCursorHandlesKey,
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

  it('keeps keyboard-only board feedback separate from pointer focus', () => {
    const goBoardSource = readFileSync(new URL('../src/components/GoBoard.tsx', import.meta.url), 'utf8');

    expect(goBoardSource).toContain('const boardPointerFocusRef = useRef(false);');
    expect(goBoardSource).toContain('data-board-input-mode={isKeyboardCursorActive');
    expect(goBoardSource).toContain('data-board-keyboard-cursor="true"');
    expect(goBoardSource).not.toContain('focus-visible:outline');
  });
  it('leaves the arrow keys to the app when the board was only clicked', () => {
    /**
     * The board is focusable, so a click focuses it -- and it was claiming
     * every arrow from that moment on, which is the app's move navigation.
     * Verified in a browser: after clicking an occupied point, ArrowRight never
     * reached `window` while `x`, the same command's other binding, still
     * stepped forward.
     */
    const clicked = { active: false, pointerFocused: true };
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ']) {
      expect(boardKeyboardCursorHandlesKey(key, clicked), key).toBe(false);
    }
  });

  it('raises the cursor on the first arrow when the board was tabbed to', () => {
    // Focus alone does not draw the cursor -- the first arrow is the only way
    // it ever appears -- so a keyboard user must keep these keys.
    const tabbed = { active: false, pointerFocused: false };
    expect(boardKeyboardCursorHandlesKey('ArrowRight', tabbed)).toBe(true);
    expect(boardKeyboardCursorHandlesKey('Enter', tabbed)).toBe(true);
  });

  it('keeps the keys once the cursor is up, however the board was focused', () => {
    for (const pointerFocused of [true, false]) {
      expect(boardKeyboardCursorHandlesKey('ArrowUp', { active: true, pointerFocused })).toBe(true);
      expect(boardKeyboardCursorHandlesKey(' ', { active: true, pointerFocused })).toBe(true);
    }
  });

  it('never claims a key the cursor does not drive', () => {
    for (const key of ['x', 'z', 'Escape', 'Tab', 'a', 'PageDown']) {
      expect(boardKeyboardCursorHandlesKey(key, { active: true, pointerFocused: false }), key).toBe(false);
    }
  });

  it('reads how the board was focused before anything clears it', () => {
    const source = readFileSync(new URL('../src/components/GoBoard.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const handleBoardKeyDown');
    const handler = source.slice(start, source.indexOf('const handleTouchStart', start));
    expect(start).toBeGreaterThan(-1);

    // The bug was ordering, not the rule: the handler reset the ref on its
    // first line, so by the time the arrow branch ran, a clicked board looked
    // exactly like a tabbed one.
    const read = handler.indexOf('const pointerFocused = boardPointerFocusRef.current;');
    const cleared = handler.indexOf('boardPointerFocusRef.current = false;');
    expect(read, 'the handler no longer records how the board was focused').toBeGreaterThan(-1);
    expect(read).toBeLessThan(cleared);
    // And it may only be cleared on a key the board actually took.
    expect(handler.slice(0, cleared)).toContain('if (!cursorOwnsKey) return;');
  });
});

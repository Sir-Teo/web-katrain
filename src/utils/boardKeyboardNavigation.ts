export type BoardKeyboardPoint = { x: number; y: number };

export function getInitialBoardKeyboardCursor(
  current: BoardKeyboardPoint | null,
  boardSize: number
): BoardKeyboardPoint {
  const size = Math.max(1, Math.floor(boardSize));
  if (
    current &&
    current.x >= 0 &&
    current.x < size &&
    current.y >= 0 &&
    current.y < size
  ) {
    return current;
  }
  const center = Math.floor(size / 2);
  return { x: center, y: center };
}

export function moveBoardKeyboardCursor(
  current: BoardKeyboardPoint | null,
  boardSize: number,
  dx: number,
  dy: number
): BoardKeyboardPoint {
  const size = Math.max(1, Math.floor(boardSize));
  const start = getInitialBoardKeyboardCursor(current, size);
  return {
    x: (start.x + dx + size) % size,
    y: (start.y + dy + size) % size,
  };
}

/** The keys the on-board keyboard cursor drives. */
const CURSOR_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ']);

/**
 * Whether the board should take a cursor key for itself instead of letting it
 * reach the app's global shortcuts.
 *
 * The board is `tabIndex={0}`, so an ordinary click focuses it too -- and every
 * key the cursor wants is already bound globally: arrows step through the game
 * and Enter asks the AI for a move. Claiming them whenever the board merely
 * held focus meant that clicking the board, much the largest target in the app,
 * silently stopped arrow-key navigation until focus moved somewhere else.
 * Measured in the browser: after a click on an occupied point the ArrowRight
 * never reached `window`, while `x` -- the same command's other binding -- kept
 * working.
 *
 * How the board was focused is the whole signal. A Tab-focus means the person
 * is on the keyboard and the first arrow should raise the cursor, which is the
 * only way it ever appears -- focus alone does not draw it. A click means they
 * are on the pointer and the arrows are still the app's. Once the cursor is up
 * it owns these keys either way.
 */
export function boardKeyboardCursorHandlesKey(
  key: string,
  cursor: { active: boolean; pointerFocused: boolean }
): boolean {
  if (!CURSOR_KEYS.has(key)) return false;
  return cursor.active || !cursor.pointerFocused;
}

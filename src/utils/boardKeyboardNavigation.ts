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

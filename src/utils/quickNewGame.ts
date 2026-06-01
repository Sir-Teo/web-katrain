import type { BoardSize } from '../types';

export function getQuickNewGameWarning(boardSize: BoardSize): string {
  return `Quick new game (${boardSize}x${boardSize}): starts immediately and replaces the current game without saving.`;
}

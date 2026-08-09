import type { BoardSize } from '../types';

export function getQuickNewGameWarning(boardSize: BoardSize): string {
  return `Quick new game (${boardSize}×${boardSize}): uses your saved defaults and replaces the current game after the unsaved-changes check.`;
}

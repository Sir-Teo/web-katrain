import type { Move } from '../types';

/**
 * Grid mapping each intersection to the 1-based move number that most recently
 * placed a stone there. A point can be re-occupied after a capture, so later
 * moves overwrite earlier ones (last placement wins). Passes are skipped.
 *
 * Independent of the "show move numbers" display toggle so features like
 * modifier-click-to-jump work regardless of what overlays are enabled.
 */
export function buildStonePlacementGrid(moveHistory: Move[], boardSize: number): Array<Array<number | null>> {
  const grid: Array<Array<number | null>> = Array.from({ length: boardSize }, () =>
    Array<number | null>(boardSize).fill(null)
  );
  for (let i = 0; i < moveHistory.length; i++) {
    const m = moveHistory[i]!;
    if (m.x < 0 || m.y < 0 || m.x >= boardSize || m.y >= boardSize) continue;
    grid[m.y]![m.x] = i + 1;
  }
  return grid;
}

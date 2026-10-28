import { getBoardTooltipPlacement } from './boardTooltipPlacement';

const EDGE_RESERVE = 36;
const MIN_WIDTH = 120;
const MAX_WIDTH = 240;

/** Prefer the board's side margins while keeping the panel handles clear. */
export function getAnalysisTooltipHorizontal(args: {
  boundaryWidth: number;
  boardLeft: number;
  boardWidth: number;
  boardHeight: number;
  anchorX: number;
  anchorY: number;
  cellSize: number;
  minimumWidth?: number;
  maximumWidth?: number;
}): { left: number; width: number; outside: boolean } {
  const { boundaryWidth, boardLeft, boardWidth, anchorX, cellSize, minimumWidth = MIN_WIDTH, maximumWidth = MAX_WIDTH } = args;
  const gap = Math.max(12, cellSize * 0.32);
  // Outside the board the stones are already clear of the card. Large cells
  // on a 5x5 must not consume otherwise usable side space.
  const outsideGap = 12;
  const room = {
    left: boardLeft - outsideGap - EDGE_RESERVE,
    right: boundaryWidth - boardLeft - boardWidth - outsideGap - EDGE_RESERVE,
  };
  const preferred = anchorX >= boardWidth / 2 ? 'right' : 'left';
  const other = preferred === 'left' ? 'right' : 'left';
  const side = room[preferred] >= minimumWidth ? preferred : room[other] >= minimumWidth ? other : null;
  if (side) {
    const width = Math.min(maximumWidth, room[side]);
    return { left: side === 'left' ? boardLeft - outsideGap - width : boardLeft + boardWidth + outsideGap, width, outside: true };
  }
  const inside = getBoardTooltipPlacement(args);
  const width = Math.min(Math.max(minimumWidth, inside.maxWidth), boundaryWidth - 16);
  const left = boardLeft + (anchorX > boardWidth * 0.58 ? anchorX - gap - width : anchorX + gap);
  return { left: Math.max(8, Math.min(left, boundaryWidth - width - 8)), width, outside: false };
}

export function getAnalysisTooltipTop(anchorY: number, height: number, boundaryHeight: number, topInset = 8, bottomInset = 8): number {
  return Math.max(topInset, Math.min(anchorY - height / 2, boundaryHeight - height - bottomInset));
}

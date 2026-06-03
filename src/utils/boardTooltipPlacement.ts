export function getBoardTooltipPlacement(args: {
  anchorX: number;
  anchorY: number;
  boardWidth: number;
  boardHeight: number;
  cellSize: number;
}): {
  left: number;
  top: number;
  transform: string | undefined;
  minWidth: number;
  maxWidth: number;
} {
  const { anchorX, anchorY, boardWidth, boardHeight, cellSize } = args;
  const tooltipGap = Math.max(12, cellSize * 0.32);
  const openLeft = anchorX > boardWidth * 0.58;
  const openUp = anchorY > boardHeight * 0.58;
  const maxWidth = Math.max(72, Math.min(240, boardWidth - 16));
  const minWidth = Math.min(120, maxWidth);
  const transform = `${openLeft ? 'translateX(-100%)' : ''}${openUp ? ' translateY(-100%)' : ''}`.trim() || undefined;

  return {
    left: openLeft ? anchorX - tooltipGap : anchorX + tooltipGap,
    top: openUp ? anchorY - tooltipGap : anchorY + tooltipGap,
    transform,
    minWidth,
    maxWidth,
  };
}

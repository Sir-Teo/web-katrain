export function getBoardTooltipPlacement(args: {
  anchorX: number;
  anchorY: number;
  boardWidth: number;
  boardHeight: number;
  cellSize: number;
  containerWidth?: number;
  containerHeight?: number;
  boardLeft?: number;
  boardTop?: number;
  tooltipHeight?: number;
  allowGutter?: boolean;
}): {
  left: number;
  top: number;
  transform: string | undefined;
  minWidth: number;
  maxWidth: number;
  region: 'board' | 'gutter';
} {
  const { anchorX, anchorY, boardWidth, boardHeight, cellSize } = args;
  const tooltipGap = Math.max(12, cellSize * 0.32);
  const boardLeft = args.boardLeft ?? 0;
  const boardTop = args.boardTop ?? 0;
  const containerHeight = args.containerHeight ?? boardHeight;
  const height = args.tooltipHeight ?? 0;
  const fitTop = (top: number) => height > 0
    ? Math.max(8, Math.min(top, containerHeight - height - 8)) : top;
  const leftRoom = boardLeft - tooltipGap - 8;
  const rightRoom = (args.containerWidth ?? boardWidth) - boardLeft - boardWidth - tooltipGap - 8;
  if (args.allowGutter !== false && Math.max(leftRoom, rightRoom) >= 120) {
    const useLeft = leftRoom >= 120 && (anchorX <= boardWidth / 2 || rightRoom < 120);
    return {
      left: useLeft ? boardLeft - tooltipGap : boardLeft + boardWidth + tooltipGap,
      top: fitTop(Math.max(8, boardTop + 8)),
      transform: useLeft ? 'translateX(-100%)' : undefined,
      minWidth: 120,
      maxWidth: Math.min(240, useLeft ? leftRoom : rightRoom),
      region: 'gutter',
    };
  }
  const openLeft = anchorX > boardWidth * 0.58;
  const openUp = anchorY > boardHeight * 0.58;
  // The tooltip hangs off one side of its anchor, so the board width is not
  // the room it has: from the centre of a phone-sized board that side holds
  // well under 240px, and the tooltip ran off the screen edge.
  const sideRoom = openLeft ? anchorX - tooltipGap : boardWidth - anchorX - tooltipGap;
  const maxWidth = Math.max(72, Math.min(240, boardWidth - 16, sideRoom));
  const minWidth = Math.min(120, maxWidth);
  const transform = `${openLeft ? 'translateX(-100%)' : ''}${openUp && !height ? ' translateY(-100%)' : ''}`.trim() || undefined;

  return {
    left: boardLeft + (openLeft ? anchorX - tooltipGap : anchorX + tooltipGap),
    top: fitTop(boardTop + (openUp ? anchorY - tooltipGap - height : anchorY + tooltipGap)),
    transform,
    minWidth,
    maxWidth,
    region: 'board',
  };
}

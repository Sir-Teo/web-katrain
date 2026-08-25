export function rgba(color: readonly [number, number, number, number], alphaOverride?: number): string {
  const a = typeof alphaOverride === 'number' ? alphaOverride : color[3];
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${a})`;
}

export function formatMoveLabel(x: number, y: number, boardSize = 19): string {
  if (x < 0 || y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
  const row = boardSize - y;
  return `${col}${row}`;
}

/**
 * What a screen reader hears when the board position changes.
 *
 * The board itself carries a static "Go board" label and the move counter is an
 * input whose value changes silently, so navigating a game announced nothing.
 * Keep this to the position — number, colour, point — which is what the move
 * counter and the tree node labels already say in text.
 */
export function formatBoardAnnouncement(args: {
  move: { x: number; y: number; player: 'black' | 'white' } | null;
  moveNumber: number;
  totalMoves: number;
  boardSize?: number;
}): string {
  const { move, moveNumber, totalMoves, boardSize = 19 } = args;
  if (!move) {
    return totalMoves > 0 ? `Start of game, ${totalMoves} moves` : 'Empty board';
  }
  const player = move.player === 'black' ? 'Black' : 'White';
  return `Move ${moveNumber} of ${totalMoves}, ${player} ${formatMoveLabel(move.x, move.y, boardSize)}`;
}

export function playerToShort(p: 'black' | 'white'): string {
  return p === 'black' ? 'B' : 'W';
}

export function formatPositionSummary(args: {
  move: { x: number; y: number; player: 'black' | 'white' } | null;
  currentPlayer: 'black' | 'white';
  moveNumber: number;
  boardSize?: number;
  positionLabel?: string;
}): { playerLabel: string; moveNumberLabel: string; pointLabel: string; title: string } {
  const player = args.move?.player ?? args.currentPlayer;
  const playerLabel = playerToShort(player);
  const pointLabel = args.move
    ? formatMoveLabel(args.move.x, args.move.y, args.boardSize)
    : args.positionLabel ?? 'Root';
  const playerName = player === 'black' ? 'Black' : 'White';
  const nonMoveTitle = pointLabel === 'Root'
    ? `${playerName} to play at root`
    : `${playerName} to play at ${pointLabel}`;
  return {
    playerLabel,
    moveNumberLabel: String(args.moveNumber),
    pointLabel,
    title: args.move ? `${playerName} played ${pointLabel}` : nonMoveTitle,
  };
}

export const panelCardBase = 'panel-section';
export const panelCardOpen = '';
export const panelCardClosed = '';

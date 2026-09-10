import { DEFAULT_BOARD_SIZE, type BoardSize, type Move } from '../types';

const GTP_COORD = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'] as const;

/**
 * The GTP name for an intersection: the column letter, then the row counted
 * from the bottom.
 *
 * This module owned the table and the parser but no formatter, so twelve places
 * grew one -- four private `xyToGtp` functions plus eight inline copies -- each
 * rederiving the skipped 'I' as `x >= 8 ? x + 1 : x`. GTP_COORD already has the
 * skip built in, so indexing it says the same thing without the arithmetic, and
 * says it once.
 *
 * A pass is 'pass', which is what GTP calls it and what all four private copies
 * returned. A column off the board cannot happen -- x indexes a board of at most
 * nineteen columns, which is exactly the length of GTP_COORD -- so it throws
 * rather than inventing a letter past 'T', which is what the arithmetic did.
 */
export function formatGtpMove(x: number, y: number, boardSize: number = DEFAULT_BOARD_SIZE): string {
  if (x < 0 || y < 0) return 'pass';
  const column = GTP_COORD[x];
  if (column === undefined) throw new Error(`GTP column out of range: ${x}`);
  return `${column}${boardSize - y}`;
}

/** The same vertex as the app writes it on screen: 'Pass', not GTP's 'pass'. */
export function formatBoardMoveLabel(
  move: Pick<Move, 'x' | 'y'>,
  boardSize: number = DEFAULT_BOARD_SIZE,
): string {
  if (move.x < 0 || move.y < 0) return 'Pass';
  return formatGtpMove(move.x, move.y, boardSize);
}

export type ParsedGtpMove =
  | { kind: 'pass' }
  | {
      kind: 'move';
      x: number;
      y: number;
    };

export function parseGtpMove(s: string, boardSize: BoardSize = DEFAULT_BOARD_SIZE): ParsedGtpMove | null {
  const t = s.trim().toUpperCase();
  if (t === 'PASS') return { kind: 'pass' };
  const m = /^([A-T])([1-9]|1[0-9])$/.exec(t);
  if (!m) return null;
  const colChar = m[1]!;
  if (colChar === 'I') return null;
  const raw = colChar.charCodeAt(0) - 65;
  const x = raw >= 9 ? raw - 1 : raw;
  const row = Number.parseInt(m[2]!, 10);
  const y = boardSize - row;
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return null;
  if (x >= GTP_COORD.length) return null;
  return { kind: 'move', x, y };
}

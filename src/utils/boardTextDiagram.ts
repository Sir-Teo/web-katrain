import { formatGtpMove } from '../lib/gtp';
import { getHoshiPoints, normalizeBoardSize } from './boardSize';
import type { BoardState, Move, Player } from '../types';
import { DEFAULT_BOARD_SIZE } from '../types';

/**
 * The position as plain text, for pasting where an image will not go: a forum
 * post, a chat message, a code block, a note.
 *
 * The app could already hand out the position as SGF, as a PNG and as a share
 * link, all of which need something to open them. This is the one that survives
 * being typed into a message box.
 *
 * The glyphs are the ones this repo already reads: `boardFromRows` in
 * data/lessons.ts takes 'X' for black and 'O' for white and treats everything
 * else as empty, so a diagram from here parses straight back into a board. The
 * star points are drawn as '+' for the same reason -- it reads as an empty
 * point either way, and without them a 19x19 grid of dots is very hard to count
 * across.
 */
export interface BoardTextDiagramOptions {
  board: BoardState;
  /** The move that produced this position. Named in the caption when given. */
  lastMove?: Move | null;
  /** Whose turn it is now. Omitted from the caption when not given. */
  toPlay?: Player | null;
  komi?: number | null;
  /**
   * Stones taken off the board, counted by the colour that was captured -- the
   * same sense as the store's `capturedBlack` / `capturedWhite`, so a caller
   * cannot invert it by passing them straight through. The caption flips it
   * into prisoners held, which is how a score is read.
   */
  captured?: { black: number; white: number } | null;
}

const BLACK = 'X';
const WHITE = 'O';
const EMPTY = '.';
const STAR = '+';

const COLUMNS = 'ABCDEFGHJKLMNOPQRST';

const playerName = (player: Player): string => (player === 'black' ? 'Black' : 'White');

function columnHeader(size: number, gutter: number): string {
  return `${' '.repeat(gutter)} ${[...COLUMNS.slice(0, size)].join(' ')}`;
}

export function formatBoardTextDiagram(options: BoardTextDiagramOptions): string {
  const { board } = options;
  const size = normalizeBoardSize(board.length, DEFAULT_BOARD_SIZE);
  const stars = new Set(getHoshiPoints(size).map(([x, y]) => `${x},${y}`));
  // Row numbers count from the bottom, so the widest one is the board size.
  const gutter = String(size).length;

  const lines: string[] = [columnHeader(size, gutter)];
  for (let y = 0; y < size; y++) {
    const row = String(size - y).padStart(gutter, ' ');
    const cells: string[] = [];
    for (let x = 0; x < size; x++) {
      const stone = board[y]?.[x] ?? null;
      cells.push(stone === 'black' ? BLACK : stone === 'white' ? WHITE : stars.has(`${x},${y}`) ? STAR : EMPTY);
    }
    lines.push(`${row} ${cells.join(' ')} ${row}`);
  }
  lines.push(columnHeader(size, gutter));

  const caption: string[] = [];
  if (options.toPlay) caption.push(`${playerName(options.toPlay)} to play.`);
  const last = options.lastMove;
  if (last && last.player) {
    caption.push(`Last move: ${playerName(last.player)} ${formatGtpMove(last.x, last.y, size)}.`);
  }
  const captured = options.captured;
  if (captured && (captured.black > 0 || captured.white > 0)) {
    // Black holds the white stones it captured, and vice versa.
    caption.push(`Prisoners: Black ${captured.white}, White ${captured.black}.`);
  }
  if (typeof options.komi === 'number' && Number.isFinite(options.komi)) {
    caption.push(`Komi ${Number(options.komi.toFixed(2))}.`);
  }
  if (caption.length > 0) lines.push('', caption.join(' '));

  return lines.join('\n');
}

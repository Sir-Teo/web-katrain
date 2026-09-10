import { formatGtpMove } from '../lib/gtp';
import { coordinateToSgf } from './sgf';
import { createEmptyBoard, getHoshiPoints, isBoardSize, normalizeBoardSize } from './boardSize';
import type { BoardSize, BoardState, Move, Player } from '../types';
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

/**
 * The inverse: a diagram someone pasted back into a position.
 *
 * Written to read what people actually post, not only what this app prints.
 * Row numbers and column letters on either side are optional and ignored, as is
 * every kind of spacing; 'X', 'x', '#' and '@' are all black, 'O', 'o' and '0'
 * are white, and '.', ',', '+', '-', '_' and '*' are all empty points -- the
 * star-point glyphs differ from tool to tool and mean nothing about occupancy.
 *
 * It is deliberately hard to trigger: a run of same-length rows, as many rows
 * as columns, that count is a board size this app plays, and at least one stone
 * on it. Nothing that is really SGF, a URL or prose gets through, which is what
 * lets the paste box try this only after those have been ruled out.
 */
const BLACK_CHARS = new Set(['X', 'x', '#', '@']);
const WHITE_CHARS = new Set(['O', 'o', '0']);
const EMPTY_CHARS = new Set(['.', ',', '+', '-', '_', '*']);

/** Strips the row number a diagram may carry on either side, and all spacing. */
function gridRow(line: string): string | null {
  const bare = line.trim().replace(/^\d{1,2}\s+/, '').replace(/\s+\d{1,2}$/, '').replace(/\s+/g, '');
  if (!bare) return null;
  for (const ch of bare) {
    if (!BLACK_CHARS.has(ch) && !WHITE_CHARS.has(ch) && !EMPTY_CHARS.has(ch)) return null;
  }
  return bare;
}

export function parseBoardTextDiagram(text: string): BoardState | null {
  const rows: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const row = gridRow(line);
    // A column header is all letters, so gridRow already rejected it; anything
    // else that is not a grid row ends the run rather than being skipped over,
    // so two diagrams in one paste do not merge into one impossible board.
    if (row) rows.push(row);
    else if (rows.length > 0) break;
  }

  const size = rows.length;
  if (!isBoardSize(size)) return null;
  if (rows.some((row) => row.length !== size)) return null;

  const board = createEmptyBoard(size as BoardSize);
  let stones = 0;
  for (let y = 0; y < size; y++) {
    const row = rows[y]!;
    for (let x = 0; x < size; x++) {
      const ch = row[x]!;
      if (BLACK_CHARS.has(ch)) { board[y]![x] = 'black'; stones += 1; }
      else if (WHITE_CHARS.has(ch)) { board[y]![x] = 'white'; stones += 1; }
    }
  }
  // An empty grid is a board someone drew, not a position worth loading, and
  // accepting it would let a page of dots replace the game on screen.
  return stones > 0 ? board : null;
}

/**
 * The same position as SGF setup stones, ready for the importer. Setup rather
 * than moves, because a diagram records where the stones are and says nothing
 * about the order they arrived in.
 */
export function sgfFromBoardTextDiagram(text: string): string | null {
  const board = parseBoardTextDiagram(text);
  if (!board) return null;
  const size = board.length;
  const black: string[] = [];
  const white: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stone = board[y]?.[x];
      if (stone === 'black') black.push(coordinateToSgf(x, y));
      else if (stone === 'white') white.push(coordinateToSgf(x, y));
    }
  }
  const placements = [
    black.length > 0 ? `AB${black.map((point) => `[${point}]`).join('')}` : '',
    white.length > 0 ? `AW${white.map((point) => `[${point}]`).join('')}` : '',
  ].join('');
  return `(;GM[1]FF[4]CA[UTF-8]SZ[${size}]${placements})`;
}

/**
 * The position as a note block: a heading, then the diagram in a fenced code
 * block so the note renderer draws it monospace and the columns line up.
 *
 * Notes are saved into the SGF comment, so a diagram added here travels with
 * the file — a variation can carry the board it is talking about instead of
 * describing it in prose.
 */
export function formatBoardNoteBlock(
  options: BoardTextDiagramOptions & { moveNumber?: number | null },
): string {
  const heading = typeof options.moveNumber === 'number' && options.moveNumber > 0
    ? `### Position at move ${options.moveNumber}`
    : '### Position';
  return `${heading}\n\n\`\`\`\n${formatBoardTextDiagram(options)}\n\`\`\``;
}

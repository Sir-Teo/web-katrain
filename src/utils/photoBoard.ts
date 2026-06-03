import type { BoardSize, BoardState, Player } from '../types';
import { coordinateToSgf } from './sgf';

export type PhotoBoardStone = Player | null;
export type PhotoBoardTraceTool = Player | 'erase';

export const PHOTO_BOARD_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] as const;

const PHOTO_BOARD_CLIPBOARD_EXTENSION_BY_MIME: Record<string, string> = {
  'image/bmp': 'bmp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const PHOTO_BOARD_IMAGE_MIME_TYPES = new Set(Object.keys(PHOTO_BOARD_CLIPBOARD_EXTENSION_BY_MIME));

export interface PhotoBoardClipboardItemLike {
  kind?: string;
  type?: string;
  getAsFile?: () => File | null;
}

export interface PhotoBoardClipboardDataLike {
  items?: ArrayLike<PhotoBoardClipboardItemLike> | null;
  files?: ArrayLike<File> | null;
}

export function isPhotoBoardImageFile(file: { name?: string; type?: string }): boolean {
  const mime = file.type?.toLowerCase() ?? '';
  if (PHOTO_BOARD_IMAGE_MIME_TYPES.has(mime)) return true;

  const name = file.name?.toLowerCase() ?? '';
  return PHOTO_BOARD_IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function normalizeClipboardImageName(file: File): File {
  if (file.name.trim()) return file;
  const extension = PHOTO_BOARD_CLIPBOARD_EXTENSION_BY_MIME[file.type.toLowerCase()] ?? 'png';
  return new File([file], `pasted-board.${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function getPhotoBoardClipboardImageFile(data: PhotoBoardClipboardDataLike | null | undefined): File | null {
  if (!data) return null;

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind && item.kind !== 'file') continue;
    if (!PHOTO_BOARD_IMAGE_MIME_TYPES.has(item.type?.toLowerCase() ?? '')) continue;
    const file = item.getAsFile?.() ?? null;
    if (file && isPhotoBoardImageFile(file)) return normalizeClipboardImageName(file);
  }

  for (const file of Array.from(data.files ?? [])) {
    if (isPhotoBoardImageFile(file)) return normalizeClipboardImageName(file);
  }

  return null;
}

export function getPhotoBoardTracePaintValue(current: PhotoBoardStone, tool: PhotoBoardTraceTool): PhotoBoardStone {
  if (tool === 'erase') return null;
  return current === tool ? null : tool;
}

export function resizePhotoBoardStones(
  stones: PhotoBoardStone[],
  fromBoardSize: BoardSize,
  toBoardSize: BoardSize,
): PhotoBoardStone[] {
  const resized: PhotoBoardStone[] = Array.from({ length: toBoardSize * toBoardSize }, () => null);
  if (stones.length !== fromBoardSize * fromBoardSize) return resized;

  const sharedSize = Math.min(fromBoardSize, toBoardSize);
  for (let y = 0; y < sharedSize; y++) {
    for (let x = 0; x < sharedSize; x++) {
      resized[y * toBoardSize + x] = stones[y * fromBoardSize + x] ?? null;
    }
  }
  return resized;
}

export interface PhotoBoardSetup {
  boardSize: BoardSize;
  stones: PhotoBoardStone[];
  komi?: number;
  nextPlayer?: Player;
  sourceName?: string;
}

export interface PhotoBoardMoveDelta {
  x: number;
  y: number;
  player: Player;
}

export interface PhotoBoardDeltaStone {
  x: number;
  y: number;
  player: Player;
  type: 'added' | 'removed';
}

export interface PhotoBoardDeltaSummaryItem extends PhotoBoardDeltaStone {
  pointLabel: string;
  label: string;
}

const escapeSgfValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/]/g, '\\]');

const playerToSgf = (player: Player): 'B' | 'W' => (player === 'black' ? 'B' : 'W');

export function photoBoardPointLabel(x: number, y: number, boardSize: BoardSize): string {
  const col = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
  return `${col}${boardSize - y}`;
}

export function summarizePhotoBoardDelta(
  delta: PhotoBoardDeltaStone[],
  boardSize: BoardSize,
  limit = 8
): { items: PhotoBoardDeltaSummaryItem[]; hiddenCount: number } {
  const visibleLimit = Math.max(0, Math.floor(limit));
  const items = delta.slice(0, visibleLimit).map((item) => {
    const pointLabel = photoBoardPointLabel(item.x, item.y, boardSize);
    const sign = item.type === 'added' ? '+' : '-';
    const playerLabel = item.player === 'black' ? 'B' : 'W';
    return {
      ...item,
      pointLabel,
      label: `${sign}${playerLabel} ${pointLabel}`,
    };
  });

  return {
    items,
    hiddenCount: Math.max(0, delta.length - items.length),
  };
}

export function photoBoardStonesFromBoard(board: BoardState, boardSize: BoardSize): PhotoBoardStone[] {
  if (board.length !== boardSize || board.some((row) => row.length !== boardSize)) {
    throw new Error(`Expected a ${boardSize}x${boardSize} board.`);
  }

  const stones: PhotoBoardStone[] = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      stones.push(board[y]?.[x] ?? null);
    }
  }
  return stones;
}

export function findPhotoBoardMoveDelta(args: {
  currentBoard: BoardState;
  boardSize: BoardSize;
  stones: PhotoBoardStone[];
  currentPlayer: Player;
}): PhotoBoardMoveDelta | null {
  const { currentBoard, boardSize, stones, currentPlayer } = args;
  if (stones.length !== boardSize * boardSize) return null;
  if (currentBoard.length !== boardSize || currentBoard.some((row) => row.length !== boardSize)) return null;

  const added: PhotoBoardMoveDelta[] = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const current = currentBoard[y]?.[x] ?? null;
      const traced = stones[y * boardSize + x] ?? null;
      if (current === traced) continue;
      if (!current && traced) {
        added.push({ x, y, player: traced });
        continue;
      }
      return null;
    }
  }

  if (added.length !== 1) return null;
  const [move] = added;
  return move && move.player === currentPlayer ? move : null;
}

export function computePhotoBoardDelta(args: {
  currentBoard: BoardState;
  boardSize: BoardSize;
  stones: PhotoBoardStone[];
}): PhotoBoardDeltaStone[] {
  const { currentBoard, boardSize, stones } = args;
  if (stones.length !== boardSize * boardSize) return [];
  if (currentBoard.length !== boardSize || currentBoard.some((row) => row.length !== boardSize)) return [];

  const delta: PhotoBoardDeltaStone[] = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const current = currentBoard[y]?.[x] ?? null;
      const traced = stones[y * boardSize + x] ?? null;
      if (current === traced) continue;

      if (current) delta.push({ x, y, player: current, type: 'removed' });
      if (traced) delta.push({ x, y, player: traced, type: 'added' });
    }
  }
  return delta;
}

export function buildPhotoBoardSetupSgf({
  boardSize,
  stones,
  komi = 6.5,
  nextPlayer = 'black',
  sourceName,
}: PhotoBoardSetup): string {
  if (stones.length !== boardSize * boardSize) {
    throw new Error(`Expected ${boardSize * boardSize} intersections for a ${boardSize}x${boardSize} board.`);
  }

  const black: string[] = [];
  const white: string[] = [];
  stones.forEach((stone, index) => {
    if (!stone) return;
    const x = index % boardSize;
    const y = Math.floor(index / boardSize);
    const point = coordinateToSgf(x, y);
    if (stone === 'black') black.push(point);
    else white.push(point);
  });

  const props = [
    'GM[1]',
    'FF[4]',
    'CA[UTF-8]',
    'AP[web-KaTrain:photo-board]',
    `SZ[${boardSize}]`,
    `KM[${Number.isFinite(komi) ? komi : 6.5}]`,
    `PL[${playerToSgf(nextPlayer)}]`,
    'GN[Photo board position]',
  ];
  if (sourceName?.trim()) props.push(`SO[${escapeSgfValue(sourceName.trim())}]`);
  if (black.length > 0) props.push(...black.map((point) => `AB[${point}]`));
  if (white.length > 0) props.push(...white.map((point) => `AW[${point}]`));
  props.push('C[Manual board import]');

  return `(;${props.join('')})`;
}

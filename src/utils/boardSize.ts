import type { BoardSize, BoardState } from '../types';

export const BOARD_SIZES: BoardSize[] = [9, 13, 19];

export const isBoardSize = (value: number): value is BoardSize =>
  value === 9 || value === 13 || value === 19;

export const normalizeBoardSize = (value: number | null | undefined, fallback: BoardSize): BoardSize =>
  typeof value === 'number' && isBoardSize(value) ? value : fallback;

/**
 * The board size a file asked for, when the app cannot honour it. Only 9, 13
 * and 19 are supported, so a 5x5 tsumego or a 21x21 game is loaded as 19x19 —
 * the stones keep their coordinates but the shape is unrecognisable, and
 * reporting a plain "Loaded SGF" leaves the reader thinking it is broken.
 * Returns null for junk like SZ[abc]: there is no real board to name there.
 */
export const unsupportedSgfBoardSize = (sgfText: string): string | null => {
  // Properties run together as FF[4]SZ[19], so anchor on "not part of a
  // longer identifier" rather than on a preceding delimiter.
  const match = /(?<![A-Za-z])SZ\[([^\]]*)\]/.exec(sgfText);
  if (!match) return null;
  const raw = (match[1] ?? '').trim();
  if (!raw) return null;
  const [width, height] = raw.split(':').map((part) => part.trim());
  const parsedWidth = Number.parseInt(width ?? '', 10);
  if (!Number.isFinite(parsedWidth)) return null;
  // SGF allows a non-square SZ[w:h]; this app has no layout for one.
  if (height !== undefined && height !== width) return raw;
  return isBoardSize(parsedWidth) ? null : raw;
};

export const createEmptyBoard = (size: BoardSize): BoardState =>
  Array.from({ length: size }, () => Array(size).fill(null));

const HOSHI_POINTS: Record<BoardSize, Array<[number, number]>> = {
  9: [
    [2, 2],
    [2, 6],
    [6, 2],
    [6, 6],
    [4, 4],
  ],
  13: [
    [3, 3],
    [3, 9],
    [9, 3],
    [9, 9],
    [6, 6],
  ],
  19: [
    [3, 3],
    [3, 9],
    [3, 15],
    [9, 3],
    [9, 9],
    [9, 15],
    [15, 3],
    [15, 9],
    [15, 15],
  ],
};

const HANDICAP_POINTS: Record<BoardSize, Array<[number, number]>> = {
  9: [
    [6, 2],
    [2, 6],
    [6, 6],
    [2, 2],
    [4, 4],
    [2, 4],
    [6, 4],
    [4, 2],
    [4, 6],
  ],
  13: [
    [9, 3],
    [3, 9],
    [9, 9],
    [3, 3],
    [6, 6],
    [3, 6],
    [9, 6],
    [6, 3],
    [6, 9],
  ],
  19: [
    [15, 3],
    [3, 15],
    [15, 15],
    [3, 3],
    [9, 9],
    [3, 9],
    [15, 9],
    [9, 3],
    [9, 15],
  ],
};

const HANDICAP_PATTERNS: Record<number, number[]> = {
  2: [0, 1],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 5, 6],
  7: [0, 1, 2, 3, 5, 6, 4],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 5, 6, 7, 8, 4],
};

export const getHoshiPoints = (size: BoardSize): Array<[number, number]> => HOSHI_POINTS[size];

export const getMaxHandicap = (size: BoardSize): number => HANDICAP_POINTS[size].length;

export const getHandicapPoints = (size: BoardSize, handicap: number): Array<[number, number]> => {
  if (handicap <= 0) return [];
  const points = HANDICAP_POINTS[size];
  if (handicap === 1) return points.slice(0, 1);
  const pattern = HANDICAP_PATTERNS[Math.min(getMaxHandicap(size), handicap)];
  return pattern ? pattern.map((index) => points[index]!) : [];
};

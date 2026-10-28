import type { BoardSize, BoardState } from '../types';

export const BOARD_SIZES: BoardSize[] = [5, 7, 9, 11, 13, 15, 17, 19];

export const isBoardSize = (value: number): value is BoardSize =>
  BOARD_SIZES.includes(value as BoardSize);

export const normalizeBoardSize = (value: number | null | undefined, fallback: BoardSize): BoardSize =>
  typeof value === 'number' && isBoardSize(value) ? value : fallback;

/**
 * The board size a file asked for, when the app cannot honour it. Odd square
 * boards from 5 through 19 are supported; a 21x21 game is loaded as 19x19 —
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

const hoshiOffset = (size: BoardSize): number => size === 5 ? 1 : size < 13 ? 2 : 3;

const handicapPoints = (size: BoardSize): Array<[number, number]> => {
  const low = hoshiOffset(size);
  const high = size - low - 1;
  const center = Math.floor(size / 2);
  return [
    [high, low], [low, high], [high, high], [low, low], [center, center],
    [low, center], [high, center], [center, low], [center, high],
  ];
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

export const getHoshiPoints = (size: BoardSize): Array<[number, number]> => {
  const center = Math.floor(size / 2);
  if (size === 5) return [[center, center]];
  const low = hoshiOffset(size);
  const high = size - low - 1;
  if (size < 15) return [[low, low], [low, high], [high, low], [high, high], [center, center]];
  return [low, center, high].flatMap(x => [low, center, high].map(y => [x, y] as [number, number]));
};

export const getMaxHandicap = (size: BoardSize): number => handicapPoints(size).length;

export const getHandicapPoints = (size: BoardSize, handicap: number): Array<[number, number]> => {
  if (handicap <= 0) return [];
  const points = handicapPoints(size);
  if (handicap === 1) return points.slice(0, 1);
  const pattern = HANDICAP_PATTERNS[Math.min(getMaxHandicap(size), handicap)];
  return pattern ? pattern.map((index) => points[index]!) : [];
};

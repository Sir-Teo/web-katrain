import type { BoardState, Player, RegionOfInterest } from '../types';

/**
 * Tsumego frame — a port of KaTrain's `core/tsumego_frame.py`, which is itself
 * kaorahi's algorithm from lizgoban.
 *
 * A life-and-death problem sitting alone in a corner is a strange whole-board
 * position, and the net reads it accordingly: it sees a huge empty board and
 * evaluates the problem as irrelevant. Walling the problem off and filling the
 * rest of the board with a settled, roughly balanced framework makes the local
 * life and death the only thing that decides the game, which is what makes the
 * engine actually solve it.
 *
 * Coordinates here are (i, j) = (row, column) of the board array, matching the
 * original. The algorithm flips the position into a canonical corner first, so
 * whether row 0 is the top or the bottom makes no difference to the result.
 */

const NEAR_TO_EDGE = 2;
const OFFENCE_TO_WIN = 5;

type Cell = {
  stone: boolean;
  black: boolean;
  /** Placed by the frame (rather than part of the original problem). */
  frame: boolean;
  /** Part of the wall, which also defines the analysis region. */
  regionMark: boolean;
};

type Grid = Array<Array<Cell | null>>;

export type TsumegoFrameOptions = {
  komi: number;
  blackToPlay: boolean;
  koAllowed: boolean;
  /** How far the wall stands from the problem ("distance of wall"). */
  margin: number;
};

export type TsumegoFramePoint = { x: number; y: number };

export type TsumegoFrameResult = {
  black: TsumegoFramePoint[];
  white: TsumegoFramePoint[];
  region: RegionOfInterest | null;
};

const xorOf = (a: boolean, b: boolean): boolean => a !== b;

const gridSizes = (grid: Grid): [number, number] => [grid.length, grid[0]?.length ?? 0];

const snap = (k: number, to: number): number => (Math.abs(k - to) <= NEAR_TO_EDGE ? to : k);
const snapStart = (k: number): number => snap(k, 0);
const snapEnd = (k: number, size: number): number => snap(k, size - 1);

const needFlip = (kMin: number, kMax: number, size: number): boolean => kMin < size - kMax - 1;

/** Distance from the edge, used to guess which colour is attacking. */
const height = (k: number, size: number): number => size - Math.abs(k - (size - 1) / 2);

const emptyGrid = (rows: number, cols: number): Grid =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => null as Cell | null));

const gridFromBoard = (board: BoardState): Grid =>
  board.map((row) =>
    row.map((value) =>
      value ? { stone: true, black: value === 'black', frame: false, regionMark: false } : null
    )
  );

const cloneGrid = (grid: Grid): Grid => grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

const putStone = (
  grid: Grid,
  i: number,
  j: number,
  black: boolean,
  empty: boolean,
  regionMark = false
): void => {
  const [rows, cols] = gridSizes(grid);
  if (i < 0 || i >= rows || j < 0 || j >= cols) return;
  grid[i]![j] = empty ? null : { stone: true, black, frame: true, regionMark };
};

const insideFrame = (i: number, j: number, frame: [number, number, number, number]): boolean => {
  const [i0, i1, j0, j1] = frame;
  return i >= i0 && i <= i1 && j >= j0 && j <= j1;
};

// --- symmetry ------------------------------------------------------------

type FlipSpec = [boolean, boolean, boolean];

const flip1 = (k: number, size: number, flag: boolean): number => (flag ? size - 1 - k : k);

const flipIj = (i: number, j: number, rows: number, cols: number, spec: FlipSpec): [number, number] => {
  const [flipI, flipJ, swap] = spec;
  const fi = flip1(i, rows, flipI);
  const fj = flip1(j, cols, flipJ);
  return swap ? [fj, fi] : [fi, fj];
};

const flipGrid = (grid: Grid, spec: FlipSpec): Grid => {
  const [rows, cols] = gridSizes(grid);
  const [newRows, newCols] = spec[2] ? [cols, rows] : [rows, cols];
  const next = emptyGrid(newRows, newCols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const [ni, nj] = flipIj(i, j, rows, cols, spec);
      next[ni]![nj] = grid[i]![j];
    }
  }
  return next;
};

// --- the frame itself ----------------------------------------------------

const putTwin = (
  grid: Grid,
  begin: number,
  end: number,
  at0: number,
  at1: number,
  isBlack: boolean,
  reverse: boolean
): void => {
  for (const at of [at0, at1]) {
    for (let k = begin; k <= end; k++) {
      const i = reverse ? at : k;
      const j = reverse ? k : at;
      putStone(grid, i, j, isBlack, false, true);
    }
  }
};

const putBorder = (grid: Grid, frame: [number, number, number, number], isBlack: boolean): void => {
  const [i0, i1, j0, j1] = frame;
  putTwin(grid, i0, i1, j0, j1, isBlack, false);
  putTwin(grid, j0, j1, i0, i1, isBlack, true);
};

/**
 * Fill everything outside the wall so the score is already decided there: the
 * defender gets just enough to lose by a few points, so only the problem's
 * outcome can swing the game.
 */
const putOutside = (
  grid: Grid,
  frame: [number, number, number, number],
  blackToAttack: boolean,
  komi: number
): void => {
  const [rows, cols] = gridSizes(grid);
  const offenseKomi = (blackToAttack ? 1 : -1) * komi;
  const defenseArea = (rows * cols - offenseKomi - OFFENCE_TO_WIN) / 2;
  let count = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (insideFrame(i, j, frame)) continue;
      count += 1;
      const black = xorOf(blackToAttack, count <= defenseArea);
      const empty = (i + j) % 2 === 0 && Math.abs(count - defenseArea) > rows;
      putStone(grid, i, j, black, empty);
    }
  }
};

// Standard position: ? = problem, X = offense, O = defense.
const OFFENSE_KO_THREAT = { pattern: ['....OOOX.', '.....XXXX'], top: true, left: false };
const DEFENSE_KO_THREAT = { pattern: ['..', '..', 'X.', 'XO', 'OO', '.O'], top: false, left: true };

/**
 * A ko threat far from the problem, so a ko fight resolves the way the options
 * say it should rather than by whoever happens to have threats.
 */
const putKoThreat = (
  grid: Grid,
  frame: [number, number, number, number],
  blackToAttack: boolean,
  blackToPlay: boolean,
  koAllowed: boolean
): void => {
  const [rows, cols] = gridSizes(grid);
  const forOffense = xorOf(koAllowed, xorOf(blackToAttack, blackToPlay));
  const { pattern, top, left } = forOffense ? OFFENSE_KO_THREAT : DEFENSE_KO_THREAT;
  const patternRows = pattern.length;
  const patternCols = pattern[0]?.length ?? 0;
  for (let i = 0; i < patternRows; i++) {
    const row = pattern[i]!;
    for (let j = 0; j < patternCols; j++) {
      const ch = row[j]!;
      const ai = i + (top ? 0 : rows - patternRows);
      const aj = j + (left ? 0 : cols - patternCols);
      // Never let the threat crowd the problem itself.
      if (insideFrame(ai, aj, frame)) return;
      putStone(grid, ai, aj, xorOf(blackToAttack, ch === 'O'), ch === '.');
    }
  }
};

const frameStones = (grid: Grid, options: TsumegoFrameOptions): Grid => {
  const [rows, cols] = gridSizes(grid);
  const stones: Array<{ i: number; j: number; black: boolean }> = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cell = grid[i]![j];
      if (cell?.stone) stones.push({ i, j, black: cell.black });
    }
  }
  if (stones.length === 0) return grid;

  const minBy = <K extends 'i' | 'j'>(key: K, sign: 1 | -1) =>
    stones.reduce((best, entry) => (sign * entry[key] < sign * best[key] ? entry : best));

  const top = minBy('i', 1);
  const bottom = minBy('i', -1);
  const left = minBy('j', 1);
  const right = minBy('j', -1);

  const iMin = snapStart(top.i);
  const jMin = snapStart(left.j);
  const iMax = snapEnd(bottom.i, rows);
  const jMax = snapEnd(right.j, cols);

  // Rotate/mirror the problem into the canonical corner, frame it there, and
  // put it back. Pure swap or pure flips only — both are their own inverse.
  const flipSpec: FlipSpec =
    iMin < jMin ? [false, false, true] : [needFlip(iMin, iMax, rows), needFlip(jMin, jMax, cols), false];
  if (flipSpec.some(Boolean)) {
    return flipGrid(frameStones(flipGrid(grid, flipSpec), options), flipSpec);
  }

  const frame: [number, number, number, number] = [
    iMin - options.margin,
    iMax + options.margin,
    jMin - options.margin,
    jMax + options.margin,
  ];
  const blackToAttack =
    [top, bottom, left, right].reduce(
      (sum, entry) => sum + (entry.black ? 1 : -1) * (height(entry.i, rows) + height(entry.j, cols)),
      0
    ) > 0;

  putBorder(grid, frame, blackToAttack);
  putOutside(grid, frame, blackToAttack, options.komi);
  putKoThreat(grid, frame, blackToAttack, options.blackToPlay, options.koAllowed);
  return grid;
};

/**
 * Build the frame for a position. Returns only the stones to add — the
 * problem's own stones are left exactly as they are — plus the region of
 * interest the wall implies.
 */
export const buildTsumegoFrame = (board: BoardState, options: TsumegoFrameOptions): TsumegoFrameResult => {
  const empty: TsumegoFrameResult = { black: [], white: [], region: null };
  if (board.length === 0) return empty;
  const hasStones = board.some((row) => row.some((cell) => cell !== null));
  if (!hasStones) return empty;

  const filled = frameStones(cloneGrid(gridFromBoard(board)), options);

  const black: TsumegoFramePoint[] = [];
  const white: TsumegoFramePoint[] = [];
  let iMin = Number.POSITIVE_INFINITY;
  let iMax = Number.NEGATIVE_INFINITY;
  let jMin = Number.POSITIVE_INFINITY;
  let jMax = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < filled.length; i++) {
    const row = filled[i]!;
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (!cell?.frame) continue;
      (cell.black ? black : white).push({ x: j, y: i });
      if (cell.regionMark) {
        iMin = Math.min(iMin, i);
        iMax = Math.max(iMax, i);
        jMin = Math.min(jMin, j);
        jMax = Math.max(jMax, j);
      }
    }
  }

  const region =
    Number.isFinite(iMin) && iMin < iMax && jMin < jMax
      ? { xMin: jMin, xMax: jMax, yMin: iMin, yMax: iMax }
      : null;

  return { black, white, region };
};

/** True when there is a position worth framing. */
export const canFrameAsTsumego = (board: BoardState): boolean =>
  board.some((row) => row.some((cell: Player | null) => cell !== null));

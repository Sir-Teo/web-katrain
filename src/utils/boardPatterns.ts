// Pattern matcher for named Go arrangements (fuseki openings, multi-stone shapes).
// Algorithm ported from @sabaki/boardmatcher <https://github.com/SabakiHQ/boardmatcher>,
// MIT License, Copyright (c) Yichuan Shen.
//
// Patterns are matched by hypothesizing that the played stone sits on one of the
// pattern's anchor points, then testing every pattern vertex under all eight board
// symmetries (and color inversion) until a hypothesis survives.

import type { BoardState, Move } from '../types';

export type PatternPoint = [number, number];
export type PatternVertex = [PatternPoint, number];

export interface BoardPattern {
  name: string;
  url: string | null;
  /** When set, the board must be exactly size x size (whole-board fusekis). */
  size: number | null;
  /** 'corner' patterns use absolute coordinates mapped through board symmetries. */
  type: 'corner' | null;
  anchors: PatternVertex[];
  vertices: PatternVertex[];
}

export interface PatternMatch {
  pattern: BoardPattern;
  /** Board vertices covered by the matched pattern, in board coordinates. */
  vertices: PatternPoint[];
}

type SignBoard = number[][];

const SYMMETRY_COUNT = 8;

const getSymmetries = ([x, y]: PatternPoint): PatternPoint[] => [
  [x, y],
  [-x, y],
  [x, -y],
  [-x, -y],
  [y, x],
  [-y, x],
  [y, -x],
  [-y, -x],
];

const mod = (x: number, m: number): number => ((x % m) + m) % m;

const getBoardSymmetries = (vertex: PatternPoint, size: number): PatternPoint[] => {
  const max = size - 1;
  return getSymmetries(vertex).map(([x, y]) => [mod(x, max), mod(y, max)] as PatternPoint);
};

const hasVertex = (x: number, y: number, size: number): boolean =>
  x >= 0 && y >= 0 && x < size && y < size;

/**
 * Tries to match `pattern` anchored at `anchor` on the signed board
 * (1 = black, -1 = white, 0 = empty). Returns the matched board vertices
 * or null when no symmetry hypothesis survives.
 */
function matchPatternAt(
  data: SignBoard,
  anchor: PatternPoint,
  pattern: BoardPattern,
  size: number
): PatternPoint[] | null {
  if (pattern.size != null && pattern.size !== size) return null;

  const [x, y] = anchor;
  const sign = data[y]?.[x];
  if (!sign) return null;

  for (const [[ax, ay], anchorSign] of pattern.anchors) {
    if (
      pattern.type === 'corner' &&
      !getBoardSymmetries([ax, ay], size).some(([sx, sy]) => sx === x && sy === y)
    ) {
      continue;
    }

    // Hypothesize the played stone is this anchor, under each of the 8 symmetries.
    const hypotheses = new Array<boolean>(SYMMETRY_COUNT).fill(true);
    let alive = SYMMETRY_COUNT;

    for (const [[vx, vy], vertexSign] of pattern.vertices) {
      const symmetries = getSymmetries([vx - ax, vy - ay]);
      for (let k = 0; k < SYMMETRY_COUNT; k++) {
        if (!hypotheses[k]) continue;
        const wx = x + symmetries[k][0];
        const wy = y + symmetries[k][1];
        if (!hasVertex(wx, wy, size) || data[wy][wx] !== vertexSign * sign * anchorSign) {
          hypotheses[k] = false;
          alive -= 1;
        }
      }
      if (alive === 0) break;
    }

    const symmetryIndex = hypotheses.indexOf(true);
    if (symmetryIndex >= 0) {
      return pattern.vertices.map(([vertex]) => {
        const diff = getSymmetries([vertex[0] - ax, vertex[1] - ay])[symmetryIndex];
        return [x + diff[0], y + diff[1]] as PatternPoint;
      });
    }
  }

  return null;
}

const toSignBoard = (board: BoardState): { data: SignBoard; stoneCount: number } => {
  let stoneCount = 0;
  const data = board.map((row) =>
    row.map((cell) => {
      if (cell === null) return 0;
      stoneCount += 1;
      return cell === 'black' ? 1 : -1;
    })
  );
  return { data, stoneCount };
};

/** Whole-board fuseki specs cannot match once the board is this full. */
const MAX_STONES_FOR_FUSEKI = 24;

/**
 * Finds the first pattern from `patterns` matching the position after `move`
 * is played on `parentBoard`. Captures are ignored: capturing moves should be
 * (and are) classified by the tactical insight layer before pattern matching.
 */
export function findBoardPattern(
  move: Move,
  parentBoard: BoardState,
  patterns: BoardPattern[]
): PatternMatch | null {
  const size = parentBoard.length;
  if (size === 0 || !hasVertex(move.x, move.y, size)) return null;
  if (parentBoard[move.y]?.[move.x] !== null) return null;

  const { data, stoneCount } = toSignBoard(parentBoard);
  data[move.y][move.x] = move.player === 'black' ? 1 : -1;

  const anchor: PatternPoint = [move.x, move.y];
  for (const pattern of patterns) {
    // Whole-board specs (fixed size) are unmatchable on a crowded board;
    // skip them cheaply instead of testing hundreds of vertices.
    if (pattern.size != null && stoneCount > MAX_STONES_FOR_FUSEKI) continue;
    const vertices = matchPatternAt(data, anchor, pattern, size);
    if (vertices) return { pattern, vertices };
  }

  return null;
}

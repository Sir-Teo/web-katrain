import type { BoardState, CandidateMove, Move, Player } from '../types';

/**
 * KataAntiMirror — playing against mirror go.
 *
 * Mirror go (copying every move through the centre) is annoying rather than
 * strong: the copier wins on komi unless the other side breaks the symmetry,
 * and a bot that just plays "the best move" happily walks into it.
 *
 * Two halves, and they are not the same kind of port:
 *
 * - **Detection** is a faithful port of KataGo's `Search::updateMirroring`
 *   (`cpp/search/searchmirror.cpp`), including its exponentially-weighted recent
 *   history test, so we call mirror go exactly when KataGo would.
 * - **Move choice** is ours, at the move-selection layer, the way our other
 *   KaTrain strategies work. KataGo's own anti-mirror lives inside its search
 *   (policy priors, forced exploration, a value-head adjustment) and is not
 *   reproduced here. What we keep is the preference that behaviour expresses:
 *   take the centre point, else lean on the opponent's centre stone, else play
 *   near the centre — and never at the cost of more than a few points.
 */

export const MIRROR_MAX_POINTS_LOST = 3.5;

export type AntiMirrorPoint = { x: number; y: number };

/** KataGo `Location::getMirrorLoc`: the point diagonally opposite the centre. */
export const mirrorPoint = (point: AntiMirrorPoint, boardSize: number): AntiMirrorPoint => ({
  x: boardSize - 1 - point.x,
  y: boardSize - 1 - point.y,
});

/** KataGo `Location::getCenterLoc`: only exists on odd-sized boards. */
export const centerPoint = (boardSize: number): AntiMirrorPoint | null =>
  boardSize % 2 === 0 ? null : { x: (boardSize / 2) | 0, y: (boardSize / 2) | 0 };

/** KataGo `Location::isCentral`. */
export const isCentral = (point: AntiMirrorPoint, boardSize: number): boolean => {
  const lo = (boardSize - 1) / 2;
  const hi = boardSize / 2;
  return point.x >= lo && point.x <= hi && point.y >= lo && point.y <= hi;
};

/** KataGo `Location::isNearCentral`. */
export const isNearCentral = (point: AntiMirrorPoint, boardSize: number): boolean => {
  const lo = (boardSize - 1) / 2 - 1;
  const hi = boardSize / 2 + 1;
  return point.x >= lo && point.x <= hi && point.y >= lo && point.y <= hi;
};

const isPass = (move: Move): boolean => move.x < 0 || move.y < 0;

/**
 * Is the opponent playing mirror go?
 *
 * Ported from `updateMirroring`: count how many of the opponent's moves mirrored
 * ours, weight recent ones more heavily, and require that the last move was a
 * mirror too. The thresholds are KataGo's.
 */
export const isOpponentMirroring = (args: {
  moveHistory: Move[];
  boardSize: number;
  /** The side we are choosing a move for. */
  rootPlayer: Player;
}): boolean => {
  const { moveHistory, boardSize, rootPlayer } = args;
  let mirrorCount = 0;
  let totalCount = 0;
  let mirrorEwms = 0;
  let totalEwms = 0;
  let lastWasMirror = false;

  for (let i = 1; i < moveHistory.length; i++) {
    const move = moveHistory[i]!;
    if (move.player === rootPlayer) continue;
    const previous = moveHistory[i - 1]!;
    lastWasMirror = false;
    if (!isPass(move) && !isPass(previous)) {
      const mirrored = mirrorPoint(previous, boardSize);
      if (move.x === mirrored.x && move.y === mirrored.y) {
        mirrorCount += 1;
        mirrorEwms += 1;
        lastWasMirror = true;
      }
    }
    totalCount += 1;
    totalEwms += 1;
    mirrorEwms *= 0.75;
    totalEwms *= 0.75;
  }

  return mirrorCount >= 7.0 + 0.5 * totalCount && mirrorEwms >= 0.45 * totalEwms && lastWasMirror;
};

const stoneAt = (board: BoardState, point: AntiMirrorPoint): Player | null =>
  board[point.y]?.[point.x] ?? null;

const isAdjacent = (a: AntiMirrorPoint, b: AntiMirrorPoint): boolean =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

const distanceSquared = (a: AntiMirrorPoint, b: AntiMirrorPoint): number =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export type AntiMirrorChoice = {
  move: CandidateMove;
  /** Why this move was picked, for the AI thoughts line. */
  reason: string;
};

/**
 * Pick the move that breaks the mirror best, out of the candidates that do not
 * throw the game away. Preference order follows KataGo's anti-mirror priors:
 * the centre point, then leaning on an opponent stone sitting on it, then
 * merely being near the centre.
 */
export const chooseAntiMirrorMove = (args: {
  candidates: CandidateMove[];
  board: BoardState;
  boardSize: number;
  opponent: Player;
  maxPointsLost?: number;
}): AntiMirrorChoice | null => {
  const { candidates, board, boardSize, opponent } = args;
  const maxPointsLost = args.maxPointsLost ?? MIRROR_MAX_POINTS_LOST;
  const playable = candidates.filter((move) => move.x >= 0 && move.y >= 0);
  if (playable.length === 0) return null;

  const affordable = playable.filter((move, index) => move.pointsLost <= maxPointsLost || index === 0);
  const center = centerPoint(boardSize);
  const opponentHoldsCenter = center !== null && stoneAt(board, center) === opponent;

  const score = (move: CandidateMove): { rank: number; reason: string } | null => {
    if (center && move.x === center.x && move.y === center.y) {
      return { rank: 4, reason: 'took the centre point' };
    }
    if (center && opponentHoldsCenter) {
      if (isAdjacent(move, center)) return { rank: 3, reason: 'leaned on the centre stone' };
      const d2 = distanceSquared(move, center);
      if (d2 <= 4) return { rank: 2, reason: 'played tight to the centre stone' };
    }
    if (isCentral(move, boardSize)) return { rank: 2, reason: 'played the central point' };
    if (isNearCentral(move, boardSize)) return { rank: 1, reason: 'played near the centre' };
    return null;
  };

  let best: { move: CandidateMove; rank: number; reason: string } | null = null;
  for (const move of affordable) {
    const scored = score(move);
    if (!scored) continue;
    // Same preference tier: keep the move the engine liked more.
    if (!best || scored.rank > best.rank || (scored.rank === best.rank && move.pointsLost < best.move.pointsLost)) {
      best = { move, rank: scored.rank, reason: scored.reason };
    }
  }

  if (!best) return null;
  return { move: best.move, reason: best.reason };
};

import * as tf from '@tensorflow/tfjs';
import type { BoardState, FloatArray, GameRules, Move, Player, RegionOfInterest } from '../../types';
import { getAnimationNow } from '../../utils/animationFrame';
import { postprocessKataGoV8 } from './evalV8';
import type { KataGoModelV8Tf } from './modelV8';
import {
  expectedWhiteScoreValue,
  getScoreStdev,
  getSqrtBoardArea,
  whiteDScoreValueDScoreSmoothNoDrawAdjust,
} from './scoreValue';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from './limits';
import { interpolateEarly } from './chosenMove';
import {
  BLACK,
  WHITE,
  EMPTY,
  BOARD_AREA,
  BOARD_SIZE,
  PASS_MOVE,
  NEIGHBOR_COUNTS,
  NEIGHBOR_LIST,
  NEIGHBOR_STARTS,
  opponentOf,
  playMove,
  undoMove,
  computeLadderFeaturesV7KataGoInto,
  computeLadderedStonesV7KataGoInto,
  computeAreaMapV7KataGoInto,
  computePassAliveAreaInto,
  isAdjacentToColor,
  isNonPassAliveSelfConnection,
  wouldBeCapture,
  computeLibertyMap,
  computeLibertyMapInto,
  updateLibertyMapForSeeds,
  type SimPosition,
  type StoneColor,
  type UndoSnapshot,
} from './fastBoard';
import {
  GRAPH_SEARCH_REP_BOUND,
  computeStateHash,
  mixGraphHash,
  packHashKey,
  simpleRepetitionBoundGt,
} from './graphHash';
import { fillInputsV7Fast, type RecentMove } from './featuresV7Fast';
import { POLICY_OPTIMISM, ROOT_POLICY_OPTIMISM } from './searchParams';

export type OwnershipMode = 'none' | 'root' | 'tree';

type PolicyValueOutput = ReturnType<KataGoModelV8Tf['forwardPolicyValue']>;
type PolicyValueOwnershipOutput = ReturnType<KataGoModelV8Tf['forward']>;

const hasOwnership = (out: PolicyValueOutput | PolicyValueOwnershipOutput): out is PolicyValueOwnershipOutput => {
  return 'ownership' in out;
};

type Edge = {
  move: number; // 0..360 or PASS_MOVE
  prior: number;
  child: Node | null;
  /**
   * KataGo's edge visits, which lag the child's own visit count whenever a
   * weightless playout evaluated the child without the parent paying for it.
   * The parent only owns the fraction of the child's weight its edge visits bought.
   */
  visits: number;
  pvCache?: { visits: number; depth: number; moves: number[]; pvVisits: number[]; pvEdgeVisits: number[] };
};

/** KataGo NodeStats::childWeight (cpp/search/searchnode.h). */
function edgeChildWeight(edge: Edge): number {
  const child = edge.child;
  if (!child) return 0;
  const childVisits = child.visits;
  if (childVisits <= 0 || edge.visits <= 0) return 0;
  if (edge.visits >= childVisits) return child.weightSum;
  return (child.weightSum * edge.visits) / childVisits;
}

/** KataGo NodeStats::childWeightSq. */
function edgeChildWeightSq(edge: Edge): number {
  const child = edge.child;
  if (!child) return 0;
  const childVisits = child.visits;
  if (childVisits <= 0 || edge.visits <= 0) return 0;
  if (edge.visits >= childVisits) return child.weightSqSum;
  return (child.weightSqSum * edge.visits) / childVisits;
}

type ExpandScratch = {
  moves: Int16Array;
  logits: Float32Array;
  priors: Float64Array;
  topMoves: Int16Array;
  topPriors: Float64Array;
  order: number[];
};

let expandScratch: ExpandScratch | null = null;
let expandScratchBoardArea = 0;
const getExpandScratch = (): ExpandScratch => {
  if (!expandScratch || expandScratchBoardArea !== BOARD_AREA) {
    expandScratch = {
      moves: new Int16Array(BOARD_AREA),
      logits: new Float32Array(BOARD_AREA),
      priors: new Float64Array(BOARD_AREA),
      topMoves: new Int16Array(BOARD_AREA),
      topPriors: new Float64Array(BOARD_AREA),
      order: [],
    };
    expandScratchBoardArea = BOARD_AREA;
  }
  return expandScratch;
};

/**
 * A search node, holding KataGo's NodeStats: weighted averages over this node's own
 * network evaluation and its children's stats, recomputed after every playout
 * (cpp/search/searchupdatehelpers.cpp recomputeNodeStats) rather than accumulated,
 * because the children are reweighted every time.
 */
class Node {
  readonly playerToMove: StoneColor;
  visits = 0;
  weightSum = 0;
  weightSqSum = 0;
  valueAvg = 0; // [-1,1] where +1 is black win
  scoreLeadAvg = 0; // black lead
  scoreMeanAvg = 0; // black score mean
  scoreMeanSqAvg = 0; // E[score^2], for the mixture stdev
  utilityAvg = 0; // from black perspective
  utilitySqAvg = 0; // from black perspective

  // This node's own network evaluation, which is one weighted term of the above.
  nnValue = 0;
  nnScoreLead = 0;
  nnScoreMean = 0;
  nnScoreMeanSq = 0;
  nnWeight = 1;
  nnUtility: number | null = null; // direct NN eval utility, from black perspective

  /** Set when the game is over here: the score is known, so no network eval is needed. */
  isTerminal = false;

  // Subtree value bias: the shared record of how much the search has historically
  // disagreed with the network about positions that look locally like this one.
  biasEntry: SubtreeBiasEntry | null = null;
  biasEpoch = -1;
  lastBiasDeltaSum = 0;
  lastBiasWeight = 0;
  ownership: Float32Array | null = null; // len 361, +1 black owns, -1 white owns
  inFlight = 0;
  pendingEval = false;
  edges: Edge[] | null = null;

  constructor(playerToMove: StoneColor) {
    this.playerToMove = playerToMove;
  }
}

function playerToColor(p: Player): StoneColor {
  return p === 'black' ? BLACK : WHITE;
}

function colorToPlayer(c: StoneColor): Player {
  return c === BLACK ? 'black' : 'white';
}

function boardStateToStones(board: BoardState): Uint8Array<ArrayBuffer> {
  const stones = new Uint8Array(BOARD_AREA);
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const v = board[y]?.[x] ?? null;
      if (!v) continue;
      stones[y * BOARD_SIZE + x] = v === 'black' ? BLACK : WHITE;
    }
  }
  return stones;
}

function computeKoPointFromPrevious(args: { board: BoardState; previousBoard?: BoardState; moveHistory: Move[] }): number {
  const { previousBoard, moveHistory } = args;
  if (!previousBoard) return -1;
  const last = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
  if (!last || last.x < 0 || last.y < 0) return -1;

  const prevStones = boardStateToStones(previousBoard);
  const pos: SimPosition = { stones: prevStones, koPoint: -1 };
  const captureStack: number[] = [];
  playMove(pos, last.y * BOARD_SIZE + last.x, playerToColor(last.player), captureStack);
  return pos.koPoint;
}

function computeKoPointAfterMove(previousBoard: BoardState | undefined, move: Move | null): number {
  if (!previousBoard || !move || move.x < 0 || move.y < 0) return -1;
  const prevStones = boardStateToStones(previousBoard);
  const pos: SimPosition = { stones: prevStones, koPoint: -1 };
  const captureStack: number[] = [];
  playMove(pos, move.y * BOARD_SIZE + move.x, playerToColor(move.player), captureStack);
  return pos.koPoint;
}

function takeRecentMoves(
  rootMoves: RecentMove[],
  pathMoves: RecentMove[],
  max: number,
  out: RecentMove[] = []
): RecentMove[] {
  out.length = 0;
  const pushCopy = (src: RecentMove) => {
    const idx = out.length;
    let dst = out[idx];
    if (!dst) {
      dst = { move: src.move, player: src.player };
      out[idx] = dst;
    } else {
      dst.move = src.move;
      dst.player = src.player;
    }
    out.length = idx + 1;
  };
  for (let i = pathMoves.length - 1; i >= 0 && out.length < max; i--) pushCopy(pathMoves[i]!);
  for (let i = rootMoves.length - 1; i >= 0 && out.length < max; i--) pushCopy(rootMoves[i]!);
  out.reverse();
  return out;
}

function normalizeRegionOfInterest(roi?: RegionOfInterest | null): RegionOfInterest | null {
  if (!roi) return null;
  const xMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.xMin, roi.xMax)));
  const xMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.xMin, roi.xMax)));
  const yMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.yMin, roi.yMax)));
  const yMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.yMin, roi.yMax)));
  const isSinglePoint = xMin === xMax && yMin === yMax;
  const isWholeBoard = xMin === 0 && yMin === 0 && xMax === BOARD_SIZE - 1 && yMax === BOARD_SIZE - 1;
  if (isSinglePoint || isWholeBoard) return null;
  return { xMin, xMax, yMin, yMax };
}

function buildAllowedMovesMask(roi?: RegionOfInterest | null): Uint8Array | null {
  const normalized = normalizeRegionOfInterest(roi);
  if (!normalized) return null;
  const allowed = new Uint8Array(BOARD_AREA);
  for (let y = normalized.yMin; y <= normalized.yMax; y++) {
    const rowOff = y * BOARD_SIZE;
    for (let x = normalized.xMin; x <= normalized.xMax; x++) {
      allowed[rowOff + x] = 1;
    }
  }
  return allowed;
}

/** Last n entries of a move list, oldest first. */
/** How many passes the game currently ends with, KataGo's consecutiveEndingPasses. */
function countConsecutiveEndingPasses(moves: RecentMove[]): number {
  let count = 0;
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i]!.move !== PASS_MOVE) break;
    count++;
  }
  return count;
}

function takeLastMoves(moves: RecentMove[], n: number): RecentMove[] {
  return moves.length <= n ? moves : moves.slice(moves.length - n);
}

/**
 * KataGo's four-passes test in isAllowedRootMove: the opponent's last four moves
 * (every other entry back from the end) were all passes.
 */
function opponentHasPassedFourTimes(moveHistory: RecentMove[], currentPlayer: Player): boolean {
  const lastIdx = moveHistory.length - 1;
  if (lastIdx < 6) return false;
  const opp: Player = currentPlayer === 'black' ? 'white' : 'black';
  for (const back of [0, 2, 4, 6]) {
    const m = moveHistory[lastIdx - back]!;
    if (m.move !== PASS_MOVE || m.player !== opp) return false;
  }
  return true;
}

/**
 * Symmetries under which the root position is unchanged, KataGo's
 * SymmetryHelpers::markDuplicateMoveLocs (cpp/neuralnet/nninputs.cpp).
 *
 * KataGo compares stones only, which is sound because its analysis engine zeroes
 * the pre-root history. When this port is asked to keep that history instead, a
 * symmetry that moves one of the last five moves changes the network input and is
 * not a real duplicate, so it has to fix those moves too.
 */
export function computeValidRootSymmetries(args: {
  stones: Uint8Array;
  koPoint: number;
  recentMoves: RecentMove[];
  ignorePreRootHistory?: boolean;
}): number[] {
  const valid = [0];
  // A ko ban is not symmetric, so nothing may be treated as a duplicate.
  if (args.koPoint >= 0) return valid;

  const map = getSymPosMap();
  for (let sym = 1; sym < NUM_SYMMETRIES; sym++) {
    const off = sym * BOARD_AREA;
    let ok = true;
    for (let p = 0; p < BOARD_AREA; p++) {
      if (args.stones[p] !== args.stones[map[off + p]!]) {
        ok = false;
        break;
      }
    }
    if (ok && args.ignorePreRootHistory !== true) {
      for (const m of args.recentMoves) {
        if (m.move === PASS_MOVE) continue;
        if (map[off + m.move] !== m.move) {
          ok = false;
          break;
        }
      }
    }
    if (ok) valid.push(sym);
  }
  return valid;
}

/**
 * Marks every root move that is a symmetric copy of another, keeping one
 * representative. The iteration order is KataGo's, which keeps the representative
 * in the upper right for black:
 * https://senseis.xmp.net/?PlayingTheFirstMoveInTheUpperRightCorner
 */
export function markSymmetryDuplicateMoves(
  validSymmetries: number[],
  nextPlayerIsBlack: boolean,
  roiMask: Uint8Array | null
): Uint8Array | null {
  if (validSymmetries.length <= 1) return null;
  const map = getSymPosMap();
  const dup = new Uint8Array(BOARD_AREA);
  const n = BOARD_SIZE;

  const markFrom = (loc: number) => {
    // A move the search may not play never becomes the representative, so a copy
    // inside the region survives instead (KataGo passes avoidMoveUntilByLoc here).
    if (roiMask && roiMask[loc] === 0) return;
    if (dup[loc] === 1) return;
    for (const sym of validSymmetries) {
      if (sym === 0) continue;
      const symLoc = map[sym * BOARD_AREA + loc]!;
      if (symLoc !== loc) dup[symLoc] = 1;
    }
  };

  if (nextPlayerIsBlack) {
    for (let x = n - 1; x >= 0; x--) {
      for (let y = 0; y < n; y++) markFrom(y * n + x);
    }
  } else {
    for (let x = 0; x < n; x++) {
      for (let y = n - 1; y >= 0; y--) markFrom(y * n + x);
    }
  }
  return dup;
}

/**
 * The root move mask: the region of interest, minus symmetric duplicates when
 * root symmetry pruning applies. Also reports the symmetries that were folded
 * away so the analysis output can put the copies back.
 */
/**
 * The moves a human of the configured rank is most likely to play, as a mask.
 * They are added to the root's children so the report says what those moves are
 * actually worth, which is the point of loading the human net at all.
 */
export function topHumanMovesMask(humanPolicy: ArrayLike<number> | null | undefined, count: number): Uint8Array | null {
  if (!humanPolicy || count <= 0) return null;
  const best: Array<{ move: number; prob: number }> = [];
  for (let p = 0; p < BOARD_AREA; p++) {
    const prob = humanPolicy[p] ?? -1;
    if (prob <= 0) continue;
    if (best.length < count) {
      best.push({ move: p, prob });
      if (best.length === count) best.sort((a, b) => a.prob - b.prob);
    } else if (prob > best[0]!.prob) {
      best[0] = { move: p, prob };
      best.sort((a, b) => a.prob - b.prob);
    }
  }
  if (best.length === 0) return null;
  const mask = new Uint8Array(BOARD_AREA);
  for (const entry of best) mask[entry.move] = 1;
  return mask;
}

function buildRootMoveMask(args: {
  regionOfInterest?: RegionOfInterest | null;
  stones: Uint8Array;
  koPoint: number;
  moveHistory: RecentMove[];
  currentPlayer: Player;
  symmetryPruning?: boolean;
  /** KataGo ignorePreRootHistory: with it on, symmetry is a matter of stones alone. */
  ignorePreRootHistory?: boolean;
  /** Moves the search may not play at the root, KataGo's avoidMoves. */
  avoidMoves?: Uint8Array | null;
}): { allowedMoves: Uint8Array | null; roiMask: Uint8Array | null; rootSymmetries: number[] } {
  const roiMask = buildAllowedMovesMask(args.regionOfInterest);
  let allowedMoves = roiMask;

  if (args.avoidMoves) {
    const avoided = allowedMoves ? new Uint8Array(allowedMoves) : new Uint8Array(BOARD_AREA).fill(1);
    for (let p = 0; p < BOARD_AREA; p++) {
      if (args.avoidMoves[p] === 1) avoided[p] = 0;
    }
    allowedMoves = avoided;
  }

  // KataGo rootPruneUselessMoves: once the opponent has passed four times running,
  // stop considering moves inside either side's pass-alive area. Those only prolong
  // a finished game (cpp/search/searchhelpers.cpp isAllowedRootMove).
  if (opponentHasPassedFourTimes(args.moveHistory, args.currentPlayer)) {
    const safeArea = computePassAliveAreaInto(args.stones, new Uint8Array(BOARD_AREA), false);
    const pruned = allowedMoves ? new Uint8Array(allowedMoves) : new Uint8Array(BOARD_AREA).fill(1);
    for (let p = 0; p < BOARD_AREA; p++) {
      if ((safeArea[p] as StoneColor) !== EMPTY) pruned[p] = 0;
    }
    // Passing is never masked, so pruning every point on the board is still fine.
    allowedMoves = pruned;
  }

  if (args.symmetryPruning === false) return { allowedMoves, roiMask, rootSymmetries: [0] };

  const rootSymmetries = computeValidRootSymmetries({
    stones: args.stones,
    koPoint: args.koPoint,
    recentMoves: takeLastMoves(args.moveHistory, 5),
    ignorePreRootHistory: args.ignorePreRootHistory,
  });
  const symDupMoves = markSymmetryDuplicateMoves(rootSymmetries, args.currentPlayer === 'black', allowedMoves);
  if (!symDupMoves) return { allowedMoves, roiMask, rootSymmetries };

  // Searching one copy of each symmetric move spends every visit on a distinct
  // position; the copies go back into the analysis output afterwards.
  const allowed = allowedMoves ? new Uint8Array(allowedMoves) : new Uint8Array(BOARD_AREA).fill(1);
  for (let p = 0; p < BOARD_AREA; p++) {
    if (symDupMoves[p] === 1) allowed[p] = 0;
  }
  return { allowedMoves: allowed, roiMask, rootSymmetries };
}

function expandNode(args: {
  node: Node;
  stones: Uint8Array;
  koPoint: number;
  policyLogits: ArrayLike<number>; // len 361 (in symmetry space if policyLogitsSymmetry != 0)
  policyLogitsSymmetry?: number; // 0..7, where 0 is identity
  passLogit: number;
  maxChildren: number;
  libertyMap?: Uint8Array;
  allowedMoves?: Uint8Array;
  /** Moves to keep as children even if the policy would rank them out of the top set. */
  forcedMoves?: Uint8Array;
  policyOut?: Float32Array; // len 362, illegal = -1, pass at index 361
  policyOutputScaling?: number;
  /**
   * KataGo rootPolicyTemperature, already interpolated for the turn number. Above 1
   * it flattens the root policy so the search spreads over more moves. It reshapes
   * the priors the search explores by, never the policy that gets reported.
   */
  rootPolicyTemperature?: number;
}): void {
  const { node, stones, koPoint, policyLogits, passLogit, maxChildren } = args;
  const policyScale = args.policyOutputScaling ?? 1.0;
  const pla = node.playerToMove;
  const opp = opponentOf(pla);
  const sym = args.policyLogitsSymmetry ?? 0;
  const symOff = sym * BOARD_AREA;
  const symPosMap = sym === 0 ? null : getSymPosMap();

  const libs = args.libertyMap ?? computeLibertyMap(stones);

  const scratch = getExpandScratch();
  const movesScratch = scratch.moves;
  const logitsScratch = scratch.logits;
  const priorsScratch = scratch.priors;
  let moveCount = 0;
  const passLogitScaled = passLogit * policyScale;
  let maxLogit = passLogitScaled;
  const allowedMoves = args.allowedMoves;
  for (let p = 0; p < BOARD_AREA; p++) {
    if (stones[p] !== EMPTY) continue;
    if (p === koPoint) continue;

    let hasEmptyNeighbor = false;
    let captures = false;
    let connectsToSafeGroup = false;

    const nStart = NEIGHBOR_STARTS[p]!;
    const nCount = NEIGHBOR_COUNTS[p]!;

    for (let i = 0; i < nCount; i++) {
      const n = NEIGHBOR_LIST[nStart + i]!;
      const c = stones[n] as StoneColor;
      if (c === EMPTY) {
        hasEmptyNeighbor = true;
        break;
      }
      if (c === opp) {
        if (libs[n] === 1) {
          captures = true;
          break;
        }
        continue;
      }
      if (c === pla && libs[n] > 1) {
        connectsToSafeGroup = true;
        break;
      }
    }

    if (!hasEmptyNeighbor && !captures && !connectsToSafeGroup) continue;
    const symPos = sym === 0 ? p : symPosMap![symOff + p]!;
    const logit = policyLogits[symPos]! * policyScale;
    movesScratch[moveCount] = p;
    logitsScratch[moveCount] = logit;
    if (logit > maxLogit) maxLogit = logit;
    moveCount++;
  }

  let sum = 0;
  for (let i = 0; i < moveCount; i++) {
    const v = Math.exp(logitsScratch[i]! - maxLogit);
    priorsScratch[i] = v;
    sum += v;
  }
  const passPriorRaw = Math.exp(passLogitScaled - maxLogit);
  sum += passPriorRaw;
  const invSum = 1.0 / sum;
  for (let i = 0; i < moveCount; i++) priorsScratch[i] *= invSum;
  let passPrior = passPriorRaw * invSum;

  if (args.policyOut) {
    const out = args.policyOut;
    out.fill(-1);
    for (let i = 0; i < moveCount; i++) out[movesScratch[i]!] = priorsScratch[i]! as number;
    out[PASS_MOVE] = passPrior as number;
  }

  // KataGo Search::maybeAddPolicyNoiseAndTemp. The reported policy above is the raw
  // one; only what the search explores by is reshaped.
  const rootPolicyTemperature = args.rootPolicyTemperature ?? 1.0;
  if (rootPolicyTemperature !== 1.0 && rootPolicyTemperature > 0) {
    let maxValue = passPrior;
    for (let i = 0; i < moveCount; i++) {
      if (priorsScratch[i]! > maxValue) maxValue = priorsScratch[i]!;
    }
    if (maxValue > 0) {
      const logMaxValue = Math.log(maxValue);
      const invTemp = 1.0 / rootPolicyTemperature;
      let tempSum = 0;
      for (let i = 0; i < moveCount; i++) {
        const prob = priorsScratch[i]!;
        if (prob > 0) {
          // Numerically stable way to raise to a power and normalize.
          const p = Math.exp((Math.log(prob) - logMaxValue) * invTemp);
          priorsScratch[i] = p;
          tempSum += p;
        }
      }
      if (passPrior > 0) {
        passPrior = Math.exp((Math.log(passPrior) - logMaxValue) * invTemp);
        tempSum += passPrior;
      }
      if (tempSum > 0) {
        const invTempSum = 1.0 / tempSum;
        for (let i = 0; i < moveCount; i++) priorsScratch[i] *= invTempSum;
        passPrior *= invTempSum;
      }
    }
  }

  const topMoves = scratch.topMoves;
  const topPriors = scratch.topPriors;
  const forcedMoves = args.forcedMoves;
  const maxKids = Math.max(0, maxChildren);
  let topCount = 0;
  let minIdx = 0;
  for (let i = 0; i < moveCount; i++) {
    // The mask restricts which moves the search may pick, like KataGo's
    // isAllowedRootMove. Policy itself is normalized over every legal move, so
    // masking does not inflate the priors of the moves that survive.
    if (allowedMoves && allowedMoves[movesScratch[i]!] === 0) continue;
    // Forced moves are added afterwards so they cannot be crowded out.
    if (forcedMoves && forcedMoves[movesScratch[i]!] === 1) continue;
    const prior = priorsScratch[i]!;
    if (topCount < maxKids) {
      topMoves[topCount] = movesScratch[i]!;
      topPriors[topCount] = prior;
      topCount++;
      if (topCount === maxKids) {
        minIdx = 0;
        for (let j = 1; j < topCount; j++) {
          if (topPriors[j]! < topPriors[minIdx]!) minIdx = j;
        }
      }
    } else if (maxKids > 0 && prior > topPriors[minIdx]!) {
      topMoves[minIdx] = movesScratch[i]!;
      topPriors[minIdx] = prior;
      minIdx = 0;
      for (let j = 1; j < topCount; j++) {
        if (topPriors[j]! < topPriors[minIdx]!) minIdx = j;
      }
    }
  }

  const order = scratch.order;
  order.length = topCount;
  for (let i = 0; i < topCount; i++) order[i] = i;
  order.sort((a, b) => {
    const diff = topPriors[b]! - topPriors[a]!;
    if (diff !== 0) return diff;
    return topMoves[a]! - topMoves[b]!;
  });

  const edges: Edge[] = [];
  for (let i = 0; i < order.length; i++) {
    const idx = order[i]!;
    edges.push({ move: topMoves[idx]!, prior: topPriors[idx]!, child: null, visits: 0 });
  }
  if (forcedMoves) {
    // Their real policy prior, so the search still treats them on their merits;
    // forcing only guarantees they are looked at at all.
    for (let i = 0; i < moveCount; i++) {
      const move = movesScratch[i]!;
      if (forcedMoves[move] !== 1) continue;
      if (allowedMoves && allowedMoves[move] === 0) continue;
      edges.push({ move, prior: priorsScratch[i]!, child: null, visits: 0 });
    }
  }
  edges.push({ move: PASS_MOVE, prior: passPrior, child: null, visits: 0 });

  node.edges = edges;
}

async function buildRootEval(args: {
  model: KataGoModelV8Tf;
  ownershipMode: OwnershipMode;
  rules: GameRules;
  rootSymmetrySamples?: number;
  komi: number;
  currentPlayer: Player;
  conservativePass: boolean;
  rootStones: Uint8Array;
  rootKoPoint: number;
  rootPrevStones: Uint8Array;
  rootPrevKoPoint: number;
  rootPrevPrevStones: Uint8Array;
  rootPrevPrevKoPoint: number;
  rootMoves: RecentMove[];
  maxChildren: number;
  regionOfInterest?: RegionOfInterest | null;
  rootSymmetryPruning?: boolean;
  forcedRootMoves?: Uint8Array | null;
  avoidRootMoves?: Uint8Array | null;
  outputScaleMultiplier: number;
  /** KataGo ignorePreRootHistory: the root's history planes stay empty. */
  ignorePreRootHistory: boolean;
  /** KataGo enablePassingHacks. */
  enablePassingHacks: boolean;
  /** KataGo rootPolicyTemperature, already interpolated for the turn number. */
  rootPolicyTemperature: number;
  node?: Node;
  preserveExistingChildren?: boolean;
}): Promise<{
  rootSymmetries: number[];
  roiMask: Uint8Array | null;
  rootNnWeight: number;
  rootLibertyMap: Uint8Array;
  rootOwnership: Float32Array;
  rootPolicy: Float32Array;
  rootValue: number;
  rootScoreLead: number;
  rootScoreMean: number;
  rootScoreMeanSq: number;
  rootUtility: number;
  recentScoreCenter: number;
  /** KataGo rootInfo's raw* fields: what the network said before any search. */
  rawWinRate: number;
  rawScoreLead: number;
  rawScoreSelfplay: number;
  rawScoreSelfplayStdev: number;
  rawNoResultProb: number;
  rawStWrError: number;
  rawStScoreError: number;
}> {
  const includeOwnership = args.ownershipMode !== 'none';
  const rootEval = await evaluateRootEval({
    model: args.model,
    includeOwnership,
    rules: args.rules,
    rootSymmetrySamples: args.rootSymmetrySamples,
    policyOptimism: ROOT_POLICY_OPTIMISM,
    komi: args.komi,
    outputScaleMultiplier: args.outputScaleMultiplier,
    state: {
      stones: args.rootStones,
      koPoint: args.rootKoPoint,
      prevStones: args.rootPrevStones,
      prevKoPoint: args.rootPrevKoPoint,
      prevPrevStones: args.rootPrevPrevStones,
      prevPrevKoPoint: args.rootPrevPrevKoPoint,
      currentPlayer: args.currentPlayer,
      recentMoves: takeRecentMoves(args.rootMoves, [], 5),
      conservativePassAndIsRoot: args.conservativePass,
      maxHistory: args.ignorePreRootHistory ? 0 : 5,
      enablePassingHacks: args.enablePassingHacks,
    },
  });

  const rootLibertyMap = new Uint8Array(rootEval.libertyMap);
  const rootOwnership = new Float32Array(BOARD_AREA);
  if (includeOwnership) {
    if (!rootEval.ownership) throw new Error('Missing ownership output');
    const rootOwnershipSign = args.currentPlayer === 'black' ? 1 : -1;
    const rootSym = rootEval.symmetry;
    const rootSymOff = rootSym * BOARD_AREA;
    const symPosMap = rootSym === 0 ? null : getSymPosMap();
    for (let i = 0; i < BOARD_AREA; i++) {
      const symPos = rootSym === 0 ? i : symPosMap![rootSymOff + i]!;
      rootOwnership[i] = rootOwnershipSign * activatedOwnership(rootEval, symPos, args.outputScaleMultiplier);
    }
  }

  const { allowedMoves: rootAllowedMoves, roiMask, rootSymmetries } = buildRootMoveMask({
    regionOfInterest: args.regionOfInterest,
    stones: args.rootStones,
    koPoint: args.rootKoPoint,
    moveHistory: args.rootMoves,
    currentPlayer: args.currentPlayer,
    symmetryPruning: args.rootSymmetryPruning,
    ignorePreRootHistory: args.ignorePreRootHistory,
    avoidMoves: args.avoidRootMoves,
  });
  const rootPolicy = new Float32Array(BOARD_AREA + 1);
  const policyNode = args.node ?? new Node(playerToColor(args.currentPlayer));
  const previousEdges = args.preserveExistingChildren === true ? policyNode.edges : null;
  expandNode({
    node: policyNode,
    stones: args.rootStones,
    koPoint: args.rootKoPoint,
    policyLogits: rootEval.policy,
    policyLogitsSymmetry: rootEval.symmetry,
    passLogit: rootEval.passLogit,
    maxChildren: args.maxChildren,
    libertyMap: rootEval.libertyMap,
    allowedMoves: rootAllowedMoves ?? undefined,
    forcedMoves: args.forcedRootMoves ?? undefined,
    policyOut: rootPolicy,
    policyOutputScaling: args.outputScaleMultiplier,
    rootPolicyTemperature: args.rootPolicyTemperature,
  });
  if (previousEdges && policyNode.edges) {
    const previousByMove = new Map<number, Edge>();
    for (const edge of previousEdges) previousByMove.set(edge.move, edge);
    for (const edge of policyNode.edges) {
      const previous = previousByMove.get(edge.move);
      if (!previous) continue;
      edge.child = previous.child;
      edge.visits = previous.visits;
      edge.pvCache = previous.pvCache;
    }
  }

  const recentScoreCenter = computeRecentScoreCenter(-rootEval.blackScoreMean);
  const rootValue = 2 * rootEval.blackWinProb - 1;
  const rootUtility = computeBlackUtilityFromEval({
    blackWinProb: rootEval.blackWinProb,
    blackNoResultProb: rootEval.blackNoResultProb,
    blackScoreMean: rootEval.blackScoreMean,
    blackScoreStdev: rootEval.blackScoreStdev,
    recentScoreCenter,
  });
  const rootScoreMeanSq = rootEval.blackScoreStdev * rootEval.blackScoreStdev + rootEval.blackScoreMean * rootEval.blackScoreMean;

  return {
    rootSymmetries,
    roiMask,
    rootNnWeight: computeWeightFromEval({
      blackScoreMean: rootEval.blackScoreMean,
      shorttermWinlossError: rootEval.shorttermWinlossError ?? -1,
      shorttermScoreError: rootEval.shorttermScoreError ?? -1,
      recentScoreCenter,
    }),
    rootLibertyMap,
    rootOwnership,
    rootPolicy,
    rootValue,
    rootScoreLead: rootEval.blackScoreLead,
    rootScoreMean: rootEval.blackScoreMean,
    rootScoreMeanSq,
    rootUtility,
    recentScoreCenter,
    rawWinRate: rootEval.blackWinProb,
    rawScoreLead: rootEval.blackScoreLead,
    rawScoreSelfplay: rootEval.blackScoreMean,
    rawScoreSelfplayStdev: rootEval.blackScoreStdev,
    rawNoResultProb: rootEval.blackNoResultProb,
    rawStWrError: rootEval.shorttermWinlossError,
    rawStScoreError: rootEval.shorttermScoreError,
  };
}

// Mirrors KataGo config "Internal params" defaults (see cpp/configs/*_example.cfg).
const WIN_LOSS_UTILITY_FACTOR: number = 1.0;
const STATIC_SCORE_UTILITY_FACTOR: number = 0.1;
const DYNAMIC_SCORE_UTILITY_FACTOR: number = 0.3;
const DYNAMIC_SCORE_CENTER_ZERO_WEIGHT: number = 0.2;
const DYNAMIC_SCORE_CENTER_SCALE: number = 0.75;
const NO_RESULT_UTILITY_FOR_WHITE: number = 0.0;

function computeRecentScoreCenter(expectedWhiteScore: number): number {
  let recentScoreCenter = expectedWhiteScore * (1.0 - DYNAMIC_SCORE_CENTER_ZERO_WEIGHT);
  const cap = getSqrtBoardArea() * DYNAMIC_SCORE_CENTER_SCALE;
  if (recentScoreCenter > expectedWhiteScore + cap) recentScoreCenter = expectedWhiteScore + cap;
  if (recentScoreCenter < expectedWhiteScore - cap) recentScoreCenter = expectedWhiteScore - cap;
  return recentScoreCenter;
}

function computeBlackUtilityFromEval(args: {
  blackWinProb: number;
  blackNoResultProb: number;
  blackScoreMean: number;
  blackScoreStdev: number;
  recentScoreCenter: number; // white score center
}): number {
  const sqrtBoardArea = getSqrtBoardArea();
  const blackLossProb = 1.0 - args.blackWinProb - args.blackNoResultProb;
  const whiteWinLossValue = blackLossProb - args.blackWinProb;
  const whiteScoreMean = -args.blackScoreMean;
  const whiteScoreStdev = args.blackScoreStdev;

  const staticScoreValue = expectedWhiteScoreValue({
    whiteScoreMean,
    whiteScoreStdev,
    center: 0.0,
    scale: 2.0,
    sqrtBoardArea,
  });

  const dynamicScoreValue =
    DYNAMIC_SCORE_UTILITY_FACTOR === 0.0
      ? 0.0
      : expectedWhiteScoreValue({
          whiteScoreMean,
          whiteScoreStdev,
          center: args.recentScoreCenter,
          scale: DYNAMIC_SCORE_CENTER_SCALE,
          sqrtBoardArea,
        });

  const whiteUtility =
    whiteWinLossValue * WIN_LOSS_UTILITY_FACTOR +
    args.blackNoResultProb * NO_RESULT_UTILITY_FOR_WHITE +
    staticScoreValue * STATIC_SCORE_UTILITY_FACTOR +
    dynamicScoreValue * DYNAMIC_SCORE_UTILITY_FACTOR;

  return -whiteUtility;
}

const VALUE_WEIGHT_EXPONENT: number = 0.25;
const USE_NOISE_PRUNING = true;
const NOISE_PRUNE_UTILITY_SCALE = 0.15;
const NOISE_PRUNING_CAP = 1e50;

type ChildWeightStats = {
  weightAdjusted: number;
  selfUtility: number;
  policy: number;
  value: number;
  scoreLead: number;
  scoreMean: number;
  scoreMeanSq: number;
  rawWeight?: number; // the child's own weightSum, before reweighting
  weightSqSum?: number;
  utility?: number;
  utilitySq?: number;
};

const SQRT_3 = Math.sqrt(3);

function tDistCdf3(z: number): number {
  const u = z / SQRT_3;
  const term = u / (1 + u * u);
  return 0.5 + (Math.atan(u) + term) / Math.PI;
}

function pruneNoiseWeight(stats: ChildWeightStats[]): number {
  if (stats.length <= 1) return stats.reduce((acc, s) => acc + s.weightAdjusted, 0);
  stats.sort((a, b) => b.policy - a.policy);

  let utilitySumSoFar = 0;
  let weightSumSoFar = 0;
  let rawPolicySumSoFar = 0;

  for (const s of stats) {
    const utility = s.selfUtility;
    const oldWeight = s.weightAdjusted;
    const rawPolicy = Math.max(1e-30, s.policy);
    let newWeight = oldWeight;

    if (weightSumSoFar > 0 && rawPolicySumSoFar > 0) {
      const avgUtilitySoFar = utilitySumSoFar / weightSumSoFar;
      const utilityGap = avgUtilitySoFar - utility;
      if (utilityGap > 0) {
        const weightShareFromRawPolicy = (weightSumSoFar * rawPolicy) / rawPolicySumSoFar;
        const lenientWeightShareFromRawPolicy = 2.0 * weightShareFromRawPolicy;
        if (oldWeight > lenientWeightShareFromRawPolicy) {
          const excessWeight = oldWeight - lenientWeightShareFromRawPolicy;
          let weightToSubtract = excessWeight * (1.0 - Math.exp(-utilityGap / NOISE_PRUNE_UTILITY_SCALE));
          if (weightToSubtract > NOISE_PRUNING_CAP) weightToSubtract = NOISE_PRUNING_CAP;
          newWeight = oldWeight - weightToSubtract;
          s.weightAdjusted = newWeight;
        }
      }
    }

    utilitySumSoFar += utility * newWeight;
    weightSumSoFar += newWeight;
    rawPolicySumSoFar += rawPolicy;
  }

  return weightSumSoFar;
}

function downweightBadChildrenAndNormalizeWeight(args: {
  stats: ChildWeightStats[];
  currentTotalWeight: number;
  desiredTotalWeight: number;
  amountToSubtract: number;
  amountToPrune: number;
}): void {
  const stats = args.stats;
  const desiredTotalWeight = args.desiredTotalWeight;
  if (stats.length === 0 || args.currentTotalWeight <= 0) return;

  if (VALUE_WEIGHT_EXPONENT === 0) {
    let currentTotalWeight = args.currentTotalWeight;
    for (const s of stats) {
      if (s.weightAdjusted < args.amountToPrune) {
        currentTotalWeight -= s.weightAdjusted;
        s.weightAdjusted = 0;
        continue;
      }
      const newWeight = s.weightAdjusted - args.amountToSubtract;
      if (newWeight <= 0) {
        currentTotalWeight -= s.weightAdjusted;
        s.weightAdjusted = 0;
      } else {
        currentTotalWeight -= args.amountToSubtract;
        s.weightAdjusted = newWeight;
      }
    }

    if (currentTotalWeight > 0 && currentTotalWeight !== desiredTotalWeight) {
      const factor = desiredTotalWeight / currentTotalWeight;
      for (const s of stats) s.weightAdjusted *= factor;
    }
    return;
  }

  const stdevs: number[] = new Array(stats.length);
  let simpleValueSum = 0;
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i]!;
    const weight = s.weightAdjusted;
    if (weight <= 0) continue;
    const precision = 1.5 * Math.sqrt(weight);
    stdevs[i] = Math.sqrt(1e-8 + 1.0 / precision);
    simpleValueSum += s.selfUtility * weight;
  }

  const simpleValue = simpleValueSum / args.currentTotalWeight;
  let totalNewUnnormWeight = 0;

  for (let i = 0; i < stats.length; i++) {
    const s = stats[i]!;
    if (s.weightAdjusted < args.amountToPrune) {
      s.weightAdjusted = 0;
      continue;
    }
    const newWeight = s.weightAdjusted - args.amountToSubtract;
    if (newWeight <= 0) {
      s.weightAdjusted = 0;
      continue;
    }
    s.weightAdjusted = newWeight;

    const stdev = stdevs[i];
    if (!stdev || stdev <= 0) continue;
    const z = (s.selfUtility - simpleValue) / stdev;
    const p = tDistCdf3(z) + 0.0001;
    s.weightAdjusted *= Math.pow(p, VALUE_WEIGHT_EXPONENT);
    totalNewUnnormWeight += s.weightAdjusted;
  }

  if (totalNewUnnormWeight <= 0) return;
  const factor = desiredTotalWeight / totalNewUnnormWeight;
  for (const s of stats) s.weightAdjusted *= factor;
}

// KataGo subtreeValueBias defaults (cpp/program/setup.cpp): factor 0.45, weight
// exponent 0.85. The idea is that if the search keeps finding a node's own network
// evaluation too optimistic, positions that look locally the same are probably
// getting the same error, so correct them all by the average of what was found.
const SUBTREE_VALUE_BIAS_FACTOR: number = 0.45;
const SUBTREE_VALUE_BIAS_WEIGHT_EXPONENT = 0.85;
const SUBTREE_BIAS_PATTERN_RADIUS = 2; // KataGo hashes a 5x5 window

/** How many of the human net's favourite moves to guarantee a place in the report. */
const DEFAULT_HUMAN_MOVE_COUNT = 5;
/**
 * Visits every such move gets before normal selection takes over. Being a child is
 * not enough: a move a strong net dislikes would otherwise sit at zero visits and
 * the report could not say what it costs, which is the whole point of showing it.
 */
const HUMAN_MOVE_MIN_VISITS = 2;

type SubtreeBiasEntry = { deltaUtilitySum: number; weightSum: number };

/**
 * KataGo's SubtreeValueBiasTable, keyed the same way: the move that led here, the
 * move before that, the local 5x5 pattern (with atari marked) on the board before
 * the move, whose turn it is, and any ko ban.
 */
class SubtreeBiasTable {
  private entries = new Map<string, SubtreeBiasEntry>();
  epoch = 0;

  get(key: string): SubtreeBiasEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { deltaUtilitySum: 0, weightSum: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  /** Drops everything, e.g. when the search re-roots and old nodes fall away. */
  reset(): void {
    this.entries.clear();
    this.epoch++;
  }
}

function buildSubtreeBiasKey(args: {
  stones: Uint8Array; // board BEFORE the move
  libertyMap: Uint8Array;
  move: number;
  parentMove: number;
  koPoint: number;
  pla: StoneColor;
}): string {
  const { stones, libertyMap, move, parentMove, koPoint, pla } = args;
  let key = `${pla}|${parentMove}|${move}|${koPoint}`;
  if (move === PASS_MOVE) return key;

  const x = move % BOARD_SIZE;
  const y = (move / BOARD_SIZE) | 0;
  const r = SUBTREE_BIAS_PATTERN_RADIUS;
  const dxMin = Math.max(-r, -x);
  const dxMax = Math.min(r, BOARD_SIZE - 1 - x);
  const dyMin = Math.max(-r, -y);
  const dyMax = Math.min(r, BOARD_SIZE - 1 - y);
  key += '|';
  for (let dy = dyMin; dy <= dyMax; dy++) {
    for (let dx = dxMin; dx <= dxMax; dx++) {
      const pos = (y + dy) * BOARD_SIZE + (x + dx);
      const color = stones[pos] as StoneColor;
      key += color === EMPTY ? '.' : color === BLACK ? (libertyMap[pos] === 1 ? 'b' : 'B') : libertyMap[pos] === 1 ? 'w' : 'W';
    }
    key += '/';
  }
  return key;
}

// KataGo useUncertainty defaults (cpp/program/setup.cpp): on, coeff 0.25, exponent 1,
// max weight 8. Only nets from model version 10 on predict the shortterm errors this
// needs; with older nets every visit keeps weight 1, exactly as in KataGo.
const USE_UNCERTAINTY = true;
const UNCERTAINTY_COEFF = 0.25;
const UNCERTAINTY_EXPONENT = 1.0;
const UNCERTAINTY_MAX_WEIGHT = 8.0;

/** KataGo Search::getApproxScoreUtilityDerivative. */
function approxScoreUtilityDerivative(whiteScoreMean: number, recentScoreCenter: number): number {
  const sqrtBoardArea = getSqrtBoardArea();
  const staticDerivative = whiteDScoreValueDScoreSmoothNoDrawAdjust({
    finalWhiteMinusBlackScore: whiteScoreMean,
    center: 0.0,
    scale: 2.0,
    sqrtBoardArea,
  });
  const dynamicDerivative = whiteDScoreValueDScoreSmoothNoDrawAdjust({
    finalWhiteMinusBlackScore: whiteScoreMean,
    center: recentScoreCenter,
    scale: DYNAMIC_SCORE_CENTER_SCALE,
    sqrtBoardArea,
  });
  return staticDerivative * STATIC_SCORE_UTILITY_FACTOR + dynamicDerivative * DYNAMIC_SCORE_UTILITY_FACTOR;
}

/**
 * KataGo Search::computeWeightFromNNOutput: a visit counts for less when the network
 * says its own judgement of this position is still moving around a lot.
 */
export function computeWeightFromEval(args: {
  blackScoreMean: number;
  shorttermWinlossError: number;
  shorttermScoreError: number;
  recentScoreCenter: number;
}): number {
  if (!USE_UNCERTAINTY) return 1.0;
  // Nets before model version 10 do not predict these and report -1.
  if (!(args.shorttermWinlossError >= 0) || !(args.shorttermScoreError >= 0)) return 1.0;

  const whiteScoreMean = -args.blackScoreMean;
  const utilityUncertaintyWL = WIN_LOSS_UTILITY_FACTOR * args.shorttermWinlossError;
  const utilityUncertaintyScore =
    approxScoreUtilityDerivative(whiteScoreMean, args.recentScoreCenter) * args.shorttermScoreError;
  const utilityUncertainty = utilityUncertaintyWL + utilityUncertaintyScore;

  const poweredUncertainty =
    UNCERTAINTY_EXPONENT === 1.0
      ? utilityUncertainty
      : UNCERTAINTY_EXPONENT === 0.5
        ? Math.sqrt(utilityUncertainty)
        : Math.pow(utilityUncertainty, UNCERTAINTY_EXPONENT);

  const baselineUncertainty = UNCERTAINTY_COEFF / UNCERTAINTY_MAX_WEIGHT;
  return UNCERTAINTY_COEFF / (poweredUncertainty + baselineUncertainty);
}

/**
 * KataGo Search::recomputeNodeStats: rebuild a node's stats from its children plus
 * its own evaluation, reweighting the children by noise pruning and by how bad they
 * look relative to their siblings. Visits are counted separately by the caller.
 */
// Recomputing runs once per node per playout, so the child stats are pooled rather
// than allocated each time (KataGo keeps the same buffer per search thread).
const recomputeStatsPool: ChildWeightStats[] = [];
const recomputeStatsWork: ChildWeightStats[] = [];

function recomputeNodeStats(node: Node): void {
  const edges = node.edges;
  const stats = recomputeStatsWork;
  stats.length = 0;
  let origTotalChildWeight = 0;

  if (edges) {
    for (const e of edges) {
      const child = e.child;
      if (!child || child.visits <= 0 || child.weightSum <= 0 || e.visits <= 0) continue;
      const edgeWeight = edgeChildWeight(e);
      const childUtility = child.utilityAvg;
      const idx = stats.length;
      let entry = recomputeStatsPool[idx];
      if (!entry) {
        entry = {
          weightAdjusted: 0,
          rawWeight: 0,
          weightSqSum: 0,
          selfUtility: 0,
          policy: 0,
          value: 0,
          scoreLead: 0,
          scoreMean: 0,
          scoreMeanSq: 0,
          utility: 0,
          utilitySq: 0,
        };
        recomputeStatsPool[idx] = entry;
      }
      entry.weightAdjusted = edgeWeight;
      entry.rawWeight = child.weightSum;
      entry.weightSqSum = child.weightSqSum;
      entry.selfUtility = node.playerToMove === BLACK ? childUtility : -childUtility;
      entry.policy = e.prior;
      entry.value = child.valueAvg;
      entry.scoreLead = child.scoreLeadAvg;
      entry.scoreMean = child.scoreMeanAvg;
      entry.scoreMeanSq = child.scoreMeanSqAvg;
      entry.utility = childUtility;
      entry.utilitySq = child.utilitySqAvg;
      stats.push(entry);
      origTotalChildWeight += edgeWeight;
    }
  }

  let currentTotalChildWeight = origTotalChildWeight;
  if (USE_NOISE_PRUNING && stats.length > 0) currentTotalChildWeight = pruneNoiseWeight(stats);
  if (stats.length > 0) {
    downweightBadChildrenAndNormalizeWeight({
      stats,
      currentTotalWeight: currentTotalChildWeight,
      desiredTotalWeight: currentTotalChildWeight,
      amountToSubtract: 0,
      amountToPrune: 0,
    });
  }

  let valueSum = 0;
  let scoreLeadSum = 0;
  let scoreMeanSum = 0;
  let scoreMeanSqSum = 0;
  let utilitySum = 0;
  let utilitySqSum = 0;
  let weightSqSum = 0;
  let weightSum = currentTotalChildWeight;

  for (const child of stats) {
    const desiredWeight = child.weightAdjusted;
    if (desiredWeight <= 0) continue;
    const rawWeight = child.rawWeight ?? desiredWeight;
    const weightScaling = rawWeight > 0 ? desiredWeight / rawWeight : 0;
    valueSum += desiredWeight * child.value;
    scoreLeadSum += desiredWeight * child.scoreLead;
    scoreMeanSum += desiredWeight * child.scoreMean;
    scoreMeanSqSum += desiredWeight * child.scoreMeanSq;
    utilitySum += desiredWeight * (child.utility ?? 0);
    utilitySqSum += desiredWeight * (child.utilitySq ?? 0);
    weightSqSum += weightScaling * weightScaling * (child.weightSqSum ?? 0);
  }

  // The node's own evaluation is one more weighted term, corrected by whatever the
  // search has learned about positions that look locally like this one.
  const ownWeight = node.nnWeight;
  let ownUtility = node.nnUtility ?? 0;
  const biasEntry = node.biasEntry;
  if (SUBTREE_VALUE_BIAS_FACTOR !== 0 && biasEntry) {
    if (currentTotalChildWeight > 1e-10) {
      const utilityChildren = utilitySum / currentTotalChildWeight;
      const biasWeight = Math.pow(origTotalChildWeight, SUBTREE_VALUE_BIAS_WEIGHT_EXPONENT);
      const biasDeltaSum = (utilityChildren - ownUtility) * biasWeight;
      // Replace this node's previous contribution rather than adding to it.
      biasEntry.deltaUtilitySum += biasDeltaSum - node.lastBiasDeltaSum;
      biasEntry.weightSum += biasWeight - node.lastBiasWeight;
      node.lastBiasDeltaSum = biasDeltaSum;
      node.lastBiasWeight = biasWeight;
    }
    if (biasEntry.weightSum > 0.001) {
      ownUtility += (SUBTREE_VALUE_BIAS_FACTOR * biasEntry.deltaUtilitySum) / biasEntry.weightSum;
    }
  }
  valueSum += ownWeight * node.nnValue;
  scoreLeadSum += ownWeight * node.nnScoreLead;
  scoreMeanSum += ownWeight * node.nnScoreMean;
  scoreMeanSqSum += ownWeight * node.nnScoreMeanSq;
  utilitySum += ownWeight * ownUtility;
  utilitySqSum += ownWeight * ownUtility * ownUtility;
  weightSqSum += ownWeight * ownWeight;
  weightSum += ownWeight;

  if (weightSum <= 0) return;

  node.weightSum = weightSum;
  node.weightSqSum = weightSqSum;
  node.valueAvg = valueSum / weightSum;
  node.scoreLeadAvg = scoreLeadSum / weightSum;
  node.scoreMeanAvg = scoreMeanSum / weightSum;
  node.scoreMeanSqAvg = scoreMeanSqSum / weightSum;
  node.utilityAvg = utilitySum / weightSum;
  node.utilitySqAvg = utilitySqSum / weightSum;
}

/**
 * The final score of a finished game, from black's perspective, under area scoring.
 * This is the ordinary area count: every stone, plus every empty point only one
 * colour can reach. Dead stones still on the board count for their owner, which is
 * exactly how KataGo scores a game that ended by two passes — and why the search
 * learns to capture them before passing.
 */
export function terminalAreaScoreBlack(
  stones: Uint8Array,
  komi: number,
  outOwnership?: Float32Array
): number {
  const area = computeAreaMapV7KataGoInto(stones, new Uint8Array(BOARD_AREA));
  let black = 0;
  let white = 0;
  for (let p = 0; p < BOARD_AREA; p++) {
    const owner = area[p] as StoneColor;
    if (owner === BLACK) black++;
    else if (owner === WHITE) white++;
    if (outOwnership) outOwnership[p] = owner === BLACK ? 1 : owner === WHITE ? -1 : 0;
  }
  return black - white - komi;
}

/**
 * Turns a finished game into a node evaluation: the result is known, so the win
 * value is 1, 0 or a half for a draw, and the score is the real score rather than
 * the network's guess (KataGo's Search::setTerminalValue).
 */
function setNodeTerminalEval(node: Node, args: { stones: Uint8Array; komi: number; recentScoreCenter: number }): void {
  // The ownership map is exact here too, so the territory overlay can show the
  // finished game rather than the network's guess about it.
  const ownership = new Float32Array(BOARD_AREA);
  const score = terminalAreaScoreBlack(args.stones, args.komi, ownership);
  node.ownership = ownership;
  const blackWinProb = score > 0 ? 1 : score < 0 ? 0 : 0.5;
  node.isTerminal = true;
  node.nnValue = 2 * blackWinProb - 1;
  node.nnScoreLead = score;
  node.nnScoreMean = score;
  node.nnScoreMeanSq = score * score;
  node.nnWeight = 1;
  node.nnUtility = computeBlackUtilityFromEval({
    blackWinProb,
    blackNoResultProb: 0,
    blackScoreMean: score,
    blackScoreStdev: 0,
    recentScoreCenter: args.recentScoreCenter,
  });
  recomputeNodeStats(node);
}

/** Records a node's own network evaluation and makes its stats reflect it. */
function setNodeOwnEval(
  node: Node,
  ev: {
    blackWinProb: number;
    blackNoResultProb: number;
    blackScoreLead: number;
    blackScoreMean: number;
    blackScoreStdev: number;
    shorttermWinlossError?: number;
    shorttermScoreError?: number;
  },
  recentScoreCenter: number
): void {
  const utility = computeBlackUtilityFromEval({
    blackWinProb: ev.blackWinProb,
    blackNoResultProb: ev.blackNoResultProb,
    blackScoreMean: ev.blackScoreMean,
    blackScoreStdev: ev.blackScoreStdev,
    recentScoreCenter,
  });
  node.nnValue = 2 * ev.blackWinProb - 1;
  node.nnScoreLead = ev.blackScoreLead;
  node.nnScoreMean = ev.blackScoreMean;
  node.nnScoreMeanSq = ev.blackScoreStdev * ev.blackScoreStdev + ev.blackScoreMean * ev.blackScoreMean;
  node.nnUtility = utility;
  node.nnWeight = computeWeightFromEval({
    blackScoreMean: ev.blackScoreMean,
    shorttermWinlossError: ev.shorttermWinlossError ?? -1,
    shorttermScoreError: ev.shorttermScoreError ?? -1,
    recentScoreCenter,
  });
  recomputeNodeStats(node);
}

/** What the search reports for the position itself: the root node's own stats. */
function rootNodeStats(rootNode: Node): {
  rootWinRate: number;
  rootScoreLead: number;
  rootScoreSelfplay: number;
  rootScoreStdev: number;
} {
  const scoreSelfplay = rootNode.scoreMeanAvg;
  return {
    rootWinRate: (rootNode.valueAvg + 1) * 0.5,
    rootScoreLead: rootNode.scoreLeadAvg,
    rootScoreSelfplay: scoreSelfplay,
    rootScoreStdev: Math.sqrt(Math.max(0, rootNode.scoreMeanSqAvg - scoreSelfplay * scoreSelfplay)),
  };
}

function hasLadderCandidates(libertyMap: Uint8Array): boolean {
  for (let i = 0; i < libertyMap.length; i++) {
    const v = libertyMap[i]!;
    if (v === 1 || v === 2) return true;
  }
  return false;
}

function buildLibertySeeds(args: {
  move: number;
  captureStack: number[];
  captureStart: number;
  out: Int16Array;
}): number {
  let count = 0;
  const push = (pos: number) => {
    if (count < args.out.length) args.out[count++] = pos;
  };
  const pushWithNeighbors = (pos: number) => {
    push(pos);
    const nStart = NEIGHBOR_STARTS[pos]!;
    const nCount = NEIGHBOR_COUNTS[pos]!;
    for (let i = 0; i < nCount; i++) push(NEIGHBOR_LIST[nStart + i]!);
  };

  if (args.move !== PASS_MOVE) pushWithNeighbors(args.move);
  for (let i = args.captureStart; i < args.captureStack.length; i++) {
    pushWithNeighbors(args.captureStack[i]!);
  }
  return count;
}

function averageTreeOwnership(node: Node): { ownership: Float32Array; ownershipStdev: Float32Array } {
  const out = new Float32Array(BOARD_AREA);
  const outSq = new Float32Array(BOARD_AREA);

  const visits = node.visits;
  const minProp = 0.5 / Math.pow(Math.max(1, visits), 0.75);
  const pruneProp = minProp * 0.01;

  const accumulate = (map: Float32Array, prop: number) => {
    for (let i = 0; i < BOARD_AREA; i++) {
      const v = map[i]!;
      out[i] += prop * v;
      outSq[i] += prop * v * v;
    }
  };

  // KataGo carries a set of the nodes on the current branch, because with graph
  // search the same node can be reached again and the walk has to stop there.
  const graphPath = new Set<Node>();

  const traverse = (n: Node, desiredProp: number): boolean => {
    if (!n.ownership) return false;

    if (desiredProp < minProp) {
      accumulate(n.ownership, desiredProp);
      return true;
    }

    const edges = n.edges;
    if (!edges || edges.length === 0) {
      accumulate(n.ownership, desiredProp);
      return true;
    }

    if (graphPath.has(n)) {
      accumulate(n.ownership, desiredProp);
      return true;
    }
    graphPath.add(n);

    let childrenWeightSum = 0;
    let relativeChildrenWeightSum = 0;
    const childWeights: number[] = [];
    const childNodes: Node[] = [];

    for (const e of edges) {
      const child = e.child;
      if (!child || child.visits <= 0) continue;
      const w = edgeChildWeight(e);
      if (w <= 0) continue;
      childWeights.push(w);
      childNodes.push(child);
      childrenWeightSum += w;
      relativeChildrenWeightSum += w * w;
    }

    const parentNNWeight = Math.max(1e-10, n.nnWeight);
    const denom = childrenWeightSum + parentNNWeight;
    const desiredPropFromChildren = denom > 0 ? (desiredProp * childrenWeightSum) / denom : 0;
    let selfProp = denom > 0 ? (desiredProp * parentNNWeight) / denom : desiredProp;

    if (desiredPropFromChildren <= 0 || relativeChildrenWeightSum <= 0) {
      selfProp += desiredPropFromChildren;
    } else {
      for (let i = 0; i < childNodes.length; i++) {
        const w = childWeights[i]!;
        const childProp = (w * w * desiredPropFromChildren) / relativeChildrenWeightSum;
        if (childProp < pruneProp) {
          selfProp += childProp;
          continue;
        }
        const ok = traverse(childNodes[i]!, childProp);
        if (!ok) selfProp += childProp;
      }
    }

    graphPath.delete(n);
    accumulate(n.ownership, selfProp);
    return true;
  };

  traverse(node, 1.0);

  const stdev = new Float32Array(BOARD_AREA);
  for (let i = 0; i < BOARD_AREA; i++) {
    const mean = out[i]!;
    const variance = outSq[i]! - mean * mean;
    stdev[i] = Math.sqrt(Math.max(0, variance));
  }

  return { ownership: out, ownershipStdev: stdev };
}

const CPUCT_EXPLORATION = 1.0;
const CPUCT_EXPLORATION_LOG = 0.45;
const CPUCT_EXPLORATION_BASE = 500;
const CPUCT_UTILITY_STDEV_PRIOR = 0.4;
const CPUCT_UTILITY_STDEV_PRIOR_WEIGHT = 2.0;
const CPUCT_UTILITY_STDEV_SCALE = 0.85;
const FPU_REDUCTION_MAX = 0.2;
const ROOT_FPU_REDUCTION_MAX = 0.1;
const FPU_LOSS_PROP = 0.0;
const ROOT_FPU_LOSS_PROP = 0.0;
const FPU_PARENT_WEIGHT_BY_VISITED_POLICY = true;
const FPU_PARENT_WEIGHT_BY_VISITED_POLICY_POW = 2.0;
const FPU_PARENT_WEIGHT = 0.0;
const NUM_VIRTUAL_LOSSES_PER_THREAD = 1.0;

// KataGo Search::getPlaySelectionValues / getSelfUtilityLCBAndRadius.
// Defaults from cpp/program/setup.cpp for analysis and GTP setups.
const USE_LCB_FOR_SELECTION = true;
const LCB_STDEVS = 5.0;
const MIN_VISIT_PROP_FOR_LCB = 0.15;
const TOTALCHILDWEIGHT_PUCT_OFFSET = 0.01;

function cpuctExploration(totalChildWeight: number): number {
  return (
    CPUCT_EXPLORATION +
    CPUCT_EXPLORATION_LOG * Math.log((totalChildWeight + CPUCT_EXPLORATION_BASE) / CPUCT_EXPLORATION_BASE)
  );
}

function exploreScaling(totalChildWeight: number, parentUtilityStdevFactor: number): number {
  return (
    cpuctExploration(totalChildWeight) *
    Math.sqrt(totalChildWeight + TOTALCHILDWEIGHT_PUCT_OFFSET) *
    parentUtilityStdevFactor
  );
}

// KataGo humanSLCpuctExploration / humanSLCpuctPermanent. Zero by default in
// searchparams.cpp; these are the values its human-bot configs ship
// (cpp/configs/gtp_human9d_search_example.cfg), and they only matter on the
// playouts that actually explore from the human policy.
const HUMAN_SL_CPUCT_EXPLORATION: number = 0.5;
const HUMAN_SL_CPUCT_PERMANENT: number = 2.0;

/**
 * KataGo Search::getExploreScalingHuman. The human policy is not a value estimate,
 * so this drops the utility-stdev factor and grows with sqrt of the weight already
 * spent rather than its log.
 */
export function exploreScalingHuman(totalChildWeight: number): number {
  return (
    (HUMAN_SL_CPUCT_EXPLORATION + HUMAN_SL_CPUCT_PERMANENT * Math.sqrt(totalChildWeight)) *
    Math.sqrt(totalChildWeight + TOTALCHILDWEIGHT_PUCT_OFFSET)
  );
}

/** How often a playout should explore from the human policy instead of the net's. */
export type HumanExploreParams = {
  policy: ArrayLike<number>; // len BOARD_AREA + 1, illegal = -1, pass last
  /** humanSLRootExploreProbWeightless: explore, but do not charge the node for it. */
  weightlessProb: number;
  /** humanSLRootExploreProbWeightful: explore and pay for it like any other visit. */
  weightfulProb: number;
};

class Rand {
  private spare: number | null = null;

  nextBool(p: number): boolean {
    return Math.random() < p;
  }

  nextDouble(): number {
    return Math.random();
  }

  nextGaussian(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }

    let u = 0;
    let v = 0;
    let s = 0;
    while (s === 0 || s >= 1) {
      u = Math.random() * 2 - 1;
      v = Math.random() * 2 - 1;
      s = u * u + v * v;
    }
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * mul;
    return u * mul;
  }
}

/**
 * Parent-side numbers that both edge selection during search and play-selection
 * values after search need: KataGo's getFpuValueForChildrenAssumeVisited plus
 * getExploreScaling (cpp/search/searchexplorehelpers.cpp).
 *
 * Filled into a scratch object so the hot search path allocates nothing.
 */
type ParentSelectionStats = {
  totalChildWeight: number;
  policyProbMassVisited: number;
  parentUtility: number;
  parentUtilityStdevFactor: number;
  parentWeightPerVisit: number;
  fpuValue: number;
  scaling: number;
};

const parentSelectionStatsScratch: ParentSelectionStats = {
  totalChildWeight: 0,
  policyProbMassVisited: 0,
  parentUtility: 0,
  parentUtilityStdevFactor: 1,
  parentWeightPerVisit: 1,
  fpuValue: 0,
  scaling: 0,
};

function computeParentSelectionStats(
  node: Node,
  isRoot: boolean,
  includeInFlight: boolean,
  policyProbMassVisitedOverride: number | null = null,
  out: ParentSelectionStats = parentSelectionStatsScratch,
  /** Set on a playout that explores from the human policy rather than the net's. */
  humanPolicy: ArrayLike<number> | null = null,
  /**
   * False on a weightless playout, where KataGo redoes PUCT against the child's own
   * weight rather than the share this node's edges have paid for.
   */
  countEdgeVisit = true
): ParentSelectionStats {
  const edges = node.edges;
  const pla = node.playerToMove;

  let totalChildWeight = 0;
  let policyProbMassVisited = 0;
  if (edges) {
    for (const e of edges) {
      const child = e.child;
      if (!child) continue;
      const prior = humanPolicy ? (humanPolicy[e.move] ?? -1) : e.prior;
      if (prior < 0) continue;
      const w =
        (countEdgeVisit ? edgeChildWeight(e) : child.weightSum) +
        (includeInFlight ? child.inFlight * NUM_VIRTUAL_LOSSES_PER_THREAD : 0);
      if (w <= 0) continue;
      totalChildWeight += w;
      policyProbMassVisited += prior;
    }
  }
  if (policyProbMassVisitedOverride !== null) policyProbMassVisited = policyProbMassVisitedOverride;

  const visits = node.visits;
  const weightSum = node.weightSum;
  const parentUtility = node.utilityAvg;
  const parentUtilitySqAvg = node.utilitySqAvg;

  const variancePrior = CPUCT_UTILITY_STDEV_PRIOR * CPUCT_UTILITY_STDEV_PRIOR;
  const variancePriorWeight = CPUCT_UTILITY_STDEV_PRIOR_WEIGHT;
  let parentUtilityStdev: number;
  if (visits <= 0 || weightSum <= 1) {
    parentUtilityStdev = CPUCT_UTILITY_STDEV_PRIOR;
  } else {
    const utilitySq = parentUtility * parentUtility;
    let utilitySqAvg = parentUtilitySqAvg;
    if (utilitySqAvg < utilitySq) utilitySqAvg = utilitySq;
    parentUtilityStdev = Math.sqrt(
      Math.max(
        0,
        ((utilitySq + variancePrior) * variancePriorWeight + utilitySqAvg * weightSum) / (variancePriorWeight + weightSum - 1.0) -
          utilitySq
      )
    );
  }

  const parentUtilityStdevFactor =
    1.0 + CPUCT_UTILITY_STDEV_SCALE * (parentUtilityStdev / CPUCT_UTILITY_STDEV_PRIOR - 1.0);

  let parentUtilityForFPU = parentUtility;
  const parentNNUtility = node.nnUtility ?? parentUtility;
  if (FPU_PARENT_WEIGHT_BY_VISITED_POLICY) {
    const avgWeight = Math.min(1.0, Math.pow(policyProbMassVisited, FPU_PARENT_WEIGHT_BY_VISITED_POLICY_POW));
    parentUtilityForFPU = avgWeight * parentUtility + (1.0 - avgWeight) * parentNNUtility;
  } else if (FPU_PARENT_WEIGHT > 0.0) {
    parentUtilityForFPU = FPU_PARENT_WEIGHT * parentNNUtility + (1.0 - FPU_PARENT_WEIGHT) * parentUtility;
  }

  const fpuReductionMax = isRoot ? ROOT_FPU_REDUCTION_MAX : FPU_REDUCTION_MAX;
  const fpuLossProp = isRoot ? ROOT_FPU_LOSS_PROP : FPU_LOSS_PROP;
  const reduction = fpuReductionMax * Math.sqrt(Math.max(0, policyProbMassVisited));
  let fpuValue = pla === BLACK ? parentUtilityForFPU - reduction : parentUtilityForFPU + reduction;

  const utilityRadius = WIN_LOSS_UTILITY_FACTOR + STATIC_SCORE_UTILITY_FACTOR + DYNAMIC_SCORE_UTILITY_FACTOR;
  const lossValue = pla === BLACK ? -utilityRadius : utilityRadius;
  fpuValue = fpuValue + (lossValue - fpuValue) * fpuLossProp;

  out.totalChildWeight = totalChildWeight;
  out.policyProbMassVisited = policyProbMassVisited;
  out.parentUtility = parentUtility;
  out.parentUtilityStdevFactor = parentUtilityStdevFactor;
  out.parentWeightPerVisit = visits > 0 ? weightSum / visits : 1.0;
  out.fpuValue = fpuValue;
  out.scaling = humanPolicy
    ? exploreScalingHuman(totalChildWeight)
    : exploreScaling(totalChildWeight, parentUtilityStdevFactor);
  return out;
}

/** What a descent step chose, and whether the node is being charged for it. */
type EdgeSelection = { edge: Edge; countEdgeVisit: boolean };

const edgeSelectionScratch = { edge: null, countEdgeVisit: true } as unknown as EdgeSelection;

function selectEdge(
  node: Node,
  isRoot: boolean,
  wideRootNoise: number,
  rand: Rand,
  endingBonus: Float64Array | null = null,
  recentScoreCenter = 0,
  forcedRootMoves: Uint8Array | null = null,
  humanExplore: HumanExploreParams | null = null,
  out: EdgeSelection = edgeSelectionScratch
): EdgeSelection {
  const edges = node.edges;
  if (!edges || edges.length === 0) throw new Error('selectEdge called on unexpanded node');

  const pla = node.playerToMove;
  const sign = pla === BLACK ? 1 : -1;

  // KataGo rolls once per playout for whether to descend by the human policy, and
  // a weightless roll additionally means the node is not charged for the visit.
  let humanPolicy: ArrayLike<number> | null = null;
  out.countEdgeVisit = true;
  if (humanExplore) {
    const totalHumanProb = humanExplore.weightlessProb + humanExplore.weightfulProb;
    if (totalHumanProb > 0) {
      const r = rand.nextDouble();
      if (r < humanExplore.weightlessProb) {
        humanPolicy = humanExplore.policy;
        out.countEdgeVisit = false;
      } else if (r < totalHumanProb) {
        humanPolicy = humanExplore.policy;
      }
    }
  }
  const countEdgeVisit = out.countEdgeVisit;

  const stats = computeParentSelectionStats(
    node,
    isRoot,
    true,
    null,
    parentSelectionStatsScratch,
    humanPolicy,
    countEdgeVisit
  );
  const fpuValue = stats.fpuValue;
  const scaling = stats.scaling;

  let bestEdge = edges[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;

  const applyWideRootNoise = isRoot && wideRootNoise > 0 && countEdgeVisit;
  const wideRootNoisePolicyExponent = applyWideRootNoise ? 1.0 / (4.0 * wideRootNoise + 1.0) : 1.0;

  if (isRoot && forcedRootMoves) {
    // Give the moves we promised to report their first visits before anything else.
    for (const e of edges) {
      if (e.move === PASS_MOVE || forcedRootMoves[e.move] !== 1) continue;
      const child = e.child;
      const visits = child ? child.visits + child.inFlight : 0;
      if (visits < HUMAN_MOVE_MIN_VISITS) {
        out.edge = e;
        return out;
      }
    }
  }

  const rootEndingBonus = isRoot ? endingBonus : null;
  const utilityRadiusForVirtualLoss = WIN_LOSS_UTILITY_FACTOR + STATIC_SCORE_UTILITY_FACTOR + DYNAMIC_SCORE_UTILITY_FACTOR;

  for (const e of edges) {
    const child = e.child;
    let prior = humanPolicy ? (humanPolicy[e.move] ?? -1) : e.prior;
    // KataGo treats a negative policy entry as an illegal move and skips it.
    if (prior < 0) continue;
    const edgeWeight = child ? (countEdgeVisit ? edgeChildWeight(e) : child.weightSum) : 0;
    const hasStats = child !== null && child.visits > 0 && edgeWeight > 0;
    let childWeight = hasStats ? edgeWeight : 0;
    let childUtility = hasStats ? child!.utilityAvg : fpuValue;

    if (rootEndingBonus && hasStats) {
      // Tiny adjustment that keeps the endgame tidy: settled points and premature
      // passes are worth slightly fewer points than the network thinks.
      const bonus = rootEndingBonus[e.move]!;
      if (bonus !== 0) {
        childUtility += scoreUtilityDiffBlack(child!.scoreMeanAvg, child!.scoreMeanSqAvg, bonus, recentScoreCenter);
      }
    }

    // Virtual losses steer the other in-flight evaluations of this batch elsewhere.
    const virtualLosses = child ? child.inFlight : 0;
    if (virtualLosses > 0) {
      const virtualLossWeight = virtualLosses * NUM_VIRTUAL_LOSSES_PER_THREAD;
      const virtualLossUtility = pla === BLACK ? -utilityRadiusForVirtualLoss : utilityRadiusForVirtualLoss;
      const virtualLossWeightFrac = virtualLossWeight / (virtualLossWeight + Math.max(0.25, childWeight));
      childUtility = childUtility + (virtualLossUtility - childUtility) * virtualLossWeightFrac;
      childWeight += virtualLossWeight;
    }

    if (applyWideRootNoise) {
      // Mirrors KataGo's wideRootNoise: smooth policy and add random utility bonuses (root only).
      prior = Math.pow(prior, wideRootNoisePolicyExponent);
      if (rand.nextBool(0.5)) {
        const bonus = wideRootNoise * Math.abs(rand.nextGaussian());
        // Utility is stored from black's perspective in this port; adjust so that
        // the player's-perspective selection value (explore + sign*utility) gets +bonus.
        childUtility += pla === BLACK ? bonus : -bonus;
      }
    }

    const explore = (scaling * prior) / (1.0 + childWeight);
    const score = explore + sign * childUtility;
    if (score > bestScore) {
      bestScore = score;
      bestEdge = e;
    }
  }

  out.edge = bestEdge;
  return out;
}

// KataGo rootEndingBonusPoints, default 0.5 for the analysis and GTP setups.
const ROOT_ENDING_BONUS_POINTS: number = 0.5;

// KataGo enableMorePassingHacks, default true for the analysis and GTP setups.
const ENABLE_MORE_PASSING_HACKS: boolean = true;

// KataGo enablePassingHacks, likewise default true for analysis and GTP.
const ENABLE_PASSING_HACKS: boolean = true;

// KataGo fillDameBeforePass. Its own example configs leave this off, but its
// basicDecentParams turns it on, and this app follows the same GUI-shaped choice it
// already makes for conservativePass: under territory scoring a bot that passes with
// dame still open leaves the human to tidy up after it.
const FILL_DAME_BEFORE_PASS: boolean = true;

// KataGo chosenMoveTemperatureHalflife, which also paces rootPolicyTemperature.
const CHOSEN_MOVE_TEMPERATURE_HALFLIFE = 19;

// KataGo useGraphSearch, on for every setup except distributed training: positions
// the search reaches more than one way share a node, so their visits pool instead
// of being split between copies.
const USE_GRAPH_SEARCH: boolean = true;

// A cycle cannot form while only positions whose last move had a large local region
// are shared, but a descent that never ended would hang the worker, so there is a
// hard floor under it as well.
const MAX_DESCENT_DEPTH = 512;

/**
 * KataGo Search::getEndingWhiteScoreBonus (cpp/search/searchhelpers.cpp),
 * precomputed for every root move. Values are extra points for white, so they
 * combine with the score the same way a real score difference would.
 *
 * The point is cosmetic-but-important endgame behaviour: don't play inside
 * territory that is already settled, don't pass while dame are left.
 */
export function computeEndingScoreBonuses(args: {
  stones: Uint8Array;
  libertyMap: Uint8Array;
  koPoint: number;
  ownership: Float32Array | null; // black perspective
  currentPlayer: Player;
  rules: GameRules;
}): Float64Array | null {
  if (ROOT_ENDING_BONUS_POINTS === 0) return null;
  const ownership = args.ownership;
  if (!ownership || ownership.length < BOARD_AREA) return null;

  const rootPla = playerToColor(args.currentPlayer);
  const opp = opponentOf(rootPla);
  const isAreaIsh = args.rules === 'chinese';
  const hasButton = false; // none of the rulesets this app offers use a button
  const extreme = 0.95;
  const tail = 0.05;

  const passAliveArea = computePassAliveAreaInto(args.stones, new Uint8Array(BOARD_AREA), false);
  const bonuses = new Float64Array(BOARD_AREA + 1);
  let any = false;

  const setBonus = (move: number, extraRootPoints: number) => {
    if (extraRootPoints === 0) return;
    // Stored from white's perspective, like KataGo's return value.
    bonuses[move] = rootPla === WHITE ? extraRootPoints : -extraRootPoints;
    any = true;
  };

  if (isAreaIsh) {
    // Area scoring: discourage moves in settled territory, but never discourage
    // cleanup, dame filling, or connections of groups that are not pass-alive yet.
    if (args.koPoint < 0) {
      for (let p = 0; p < BOARD_AREA; p++) {
        if ((args.stones[p] as StoneColor) !== EMPTY) continue;
        const plaOwnership = rootPla === BLACK ? ownership[p]! : -ownership[p]!;
        if (plaOwnership <= -extreme) {
          if (!wouldBeCapture(args.stones, args.libertyMap, p, rootPla)) {
            setBonus(p, -ROOT_ENDING_BONUS_POINTS * ((-extreme - plaOwnership) / tail));
          }
        } else if (plaOwnership >= extreme) {
          if (
            !isAdjacentToColor(args.stones, p, opp) &&
            !isNonPassAliveSelfConnection(args.stones, p, rootPla, passAliveArea)
          ) {
            setBonus(p, -ROOT_ENDING_BONUS_POINTS * ((plaOwnership - extreme) / tail));
          }
        }
      }
    }
    if (hasButton) setBonus(PASS_MOVE, -ROOT_ENDING_BONUS_POINTS * 0.5);
  } else {
    // Territory scoring: discourage passing so that dame get filled first, and
    // discourage pointless threats inside settled territory just the same.
    setBonus(PASS_MOVE, -ROOT_ENDING_BONUS_POINTS * (2.0 / 3.0));
    if (args.koPoint < 0) {
      for (let p = 0; p < BOARD_AREA; p++) {
        if ((args.stones[p] as StoneColor) !== EMPTY) continue;
        const plaOwnership = rootPla === BLACK ? ownership[p]! : -ownership[p]!;
        if (plaOwnership <= -extreme) {
          setBonus(p, -ROOT_ENDING_BONUS_POINTS * ((-extreme - plaOwnership) / tail));
        } else if (plaOwnership >= extreme) {
          if (
            !isAdjacentToColor(args.stones, p, opp) &&
            !isNonPassAliveSelfConnection(args.stones, p, rootPla, passAliveArea)
          ) {
            setBonus(p, -ROOT_ENDING_BONUS_POINTS * ((plaOwnership - extreme) / tail));
          }
        }
      }
    }
  }

  return any ? bonuses : null;
}

/**
 * KataGo Search::getScoreUtilityDiff: what pretending white scored `whiteDelta`
 * more points does to the utility. Returned black-perspective, since that is the
 * frame utilities live in here.
 */
function scoreUtilityDiffBlack(
  blackScoreMean: number,
  blackScoreMeanSq: number,
  whiteDelta: number,
  recentScoreCenter: number
): number {
  if (whiteDelta === 0) return 0;
  const whiteScoreMean = -blackScoreMean;
  const whiteScoreStdev = getScoreStdev(whiteScoreMean, blackScoreMeanSq);
  const sqrtBoardArea = getSqrtBoardArea();

  const staticDiff =
    expectedWhiteScoreValue({
      whiteScoreMean: whiteScoreMean + whiteDelta,
      whiteScoreStdev,
      center: 0.0,
      scale: 2.0,
      sqrtBoardArea,
    }) -
    expectedWhiteScoreValue({ whiteScoreMean, whiteScoreStdev, center: 0.0, scale: 2.0, sqrtBoardArea });

  const dynamicDiff =
    DYNAMIC_SCORE_UTILITY_FACTOR === 0
      ? 0
      : expectedWhiteScoreValue({
          whiteScoreMean: whiteScoreMean + whiteDelta,
          whiteScoreStdev,
          center: recentScoreCenter,
          scale: DYNAMIC_SCORE_CENTER_SCALE,
          sqrtBoardArea,
        }) -
        expectedWhiteScoreValue({
          whiteScoreMean,
          whiteScoreStdev,
          center: recentScoreCenter,
          scale: DYNAMIC_SCORE_CENTER_SCALE,
          sqrtBoardArea,
        });

  const whiteDiff = staticDiff * STATIC_SCORE_UTILITY_FACTOR + dynamicDiff * DYNAMIC_SCORE_UTILITY_FACTOR;
  return -whiteDiff;
}

/**
 * KataGo Search::getExploreSelectionValue and getExploreSelectionValueInverse
 * (cpp/search/searchexplorehelpers.cpp). Utility is black-perspective in this
 * port where KataGo's is white-perspective, so the player sign is flipped.
 */
function exploreSelectionValue(
  scaling: number,
  prior: number,
  childWeight: number,
  childUtility: number,
  pla: StoneColor
): number {
  const explore = (scaling * prior) / (1.0 + childWeight);
  return explore + (pla === BLACK ? childUtility : -childUtility);
}

function exploreSelectionValueInverse(
  value: number,
  scaling: number,
  prior: number,
  childUtility: number,
  pla: StoneColor
): number {
  const valueComponent = pla === BLACK ? childUtility : -childUtility;
  const exploreComponent = value - valueComponent;
  if (exploreComponent <= 0) return 1e100;
  const childWeight = (scaling * prior) / exploreComponent - 1;
  return childWeight < 0 ? 0 : childWeight;
}

type PlaySelectionValues = {
  values: Float64Array; // per edge index, KataGo's playSelectionValue
  lcb: Float64Array; // per edge index, from the player-to-move's perspective
  radius: Float64Array; // per edge index
};

/**
 * KataGo Search::getPlaySelectionValues (cpp/search/searchresults.cpp).
 *
 * Every visit carries weight 1 in this port, so weightSum and weightSqSum are
 * both the visit count and the effective sample size is just the visits.
 */
function computePlaySelectionValues(
  node: Node,
  isRoot: boolean,
  endingBonus: Float64Array | null = null,
  recentScoreCenter = 0,
  /** KataGo's shouldSuppressPass: passing is off the table at this node. */
  suppressPass = false
): PlaySelectionValues | null {
  const edges = node.edges;
  if (!edges || edges.length === 0) return null;
  const isSuppressedPass = (i: number): boolean => suppressPass && edges[i]!.move === PASS_MOVE;

  const pla = node.playerToMove;
  const n = edges.length;
  const values = new Float64Array(n);
  const lcb = new Float64Array(n);
  const radius = new Float64Array(n);

  const utilityRangeRadius = WIN_LOSS_UTILITY_FACTOR + STATIC_SCORE_UTILITY_FACTOR + DYNAMIC_SCORE_UTILITY_FACTOR;
  const zeroVisitRadius = 2.0 * utilityRangeRadius * LCB_STDEVS;
  const rootEndingBonus = isRoot ? endingBonus : null;

  /** Child utility including the root ending bonus, as KataGo applies it. */
  const utilityWithBonus = (child: Node, move: number): number => {
    const utility = child.utilityAvg;
    if (!rootEndingBonus) return utility;
    const bonus = rootEndingBonus[move]!;
    if (bonus === 0) return utility;
    return utility + scoreUtilityDiffBlack(child.scoreMeanAvg, child.scoreMeanSqAvg, bonus, recentScoreCenter);
  };

  let anyVisitedChild = false;
  for (let i = 0; i < n; i++) {
    const child = edges[i]!.child;
    const visits = child ? child.visits : 0;
    values[i] = child && visits > 0 && !isSuppressedPass(i) ? edgeChildWeight(edges[i]!) : 0;
    if (visits > 0 && values[i]! > 0) anyVisitedChild = true;
    lcb[i] = -zeroVisitRadius;
    radius[i] = zeroVisitRadius;
  }
  if (!anyVisitedChild) return null;

  // The most stably explored child, before LCB. A little weight on raw policy, and
  // one visit's worth discounted because the most recent visit is overweighted.
  let nonLcbBestIdx = 0;
  let nonLcbBestChildWeight = -1e30;
  {
    let maxGoodness = -1e30;
    for (let i = 0; i < n; i++) {
      if (isSuppressedPass(i)) continue;
      const weight = values[i]!;
      const visits = edges[i]!.child?.visits ?? 0;
      const goodness = (weight * Math.max(0, visits - 1)) / Math.max(1, visits) + 2.0 * edges[i]!.prior;
      if (goodness > maxGoodness) {
        maxGoodness = goodness;
        nonLcbBestChildWeight = weight;
        nonLcbBestIdx = i;
      }
    }
  }

  // Root only: take back weight from children that in retrospect got more visits
  // than the final explore selection values justify.
  if (isRoot) {
    const bestEdge = edges[nonLcbBestIdx]!;
    const bestChild = bestEdge.child;
    if (bestChild && bestChild.visits > 0 && bestEdge.visits > 0) {
      // policyProbMassVisited is irrelevant here: it only feeds the FPU value,
      // which is unused because every child considered below has visits.
      const stats = computeParentSelectionStats(node, true, false, 1.0);
      const scaling = stats.scaling;
      const bestChildUtility = utilityWithBonus(bestChild, bestEdge.move);
      const bestChildExploreSelectionValue = exploreSelectionValue(
        scaling,
        bestEdge.prior,
        edgeChildWeight(bestEdge),
        bestChildUtility,
        pla
      );
      for (let i = 0; i < n; i++) {
        if (i === nonLcbBestIdx) continue;
        const child = edges[i]!.child;
        if (!child || child.visits <= 0 || edges[i]!.visits <= 0 || isSuppressedPass(i)) {
          values[i] = 0;
          continue;
        }
        const childUtility = utilityWithBonus(child, edges[i]!.move);
        const retrospectivelyWanted = exploreSelectionValueInverse(
          bestChildExploreSelectionValue,
          scaling,
          edges[i]!.prior,
          childUtility,
          pla
        );
        const childWeight = edgeChildWeight(edges[i]!);
        values[i] = Math.ceil(childWeight > retrospectivelyWanted ? retrospectivelyWanted : childWeight);
      }
    }
  }

  // KataGo Search::getSelfUtilityLCBAndRadius.
  for (let i = 0; i < n; i++) {
    const child = edges[i]!.child;
    if (!child || child.visits <= 0) continue;

    let weightSum = edgeChildWeight(edges[i]!);
    let weightSqSum = edgeChildWeightSq(edges[i]!);
    if (weightSum <= 0 || weightSqSum <= 0) continue;
    let ess = (weightSum * weightSum) / weightSqSum;

    const utilityAvg = child.utilityAvg;
    let utilitySqAvg = child.utilitySqAvg;

    // A small prior that the variance is as large as it can be, so that the
    // radius stays sane at tiny sample sizes without a T distribution.
    const priorWeight = weightSum / (ess * ess * ess);
    utilitySqAvg = Math.max(utilitySqAvg, utilityAvg * utilityAvg + 1e-8);
    utilitySqAvg =
      (utilitySqAvg * weightSum + (utilitySqAvg + utilityRangeRadius * utilityRangeRadius) * priorWeight) /
      (weightSum + priorWeight);
    weightSum += priorWeight;
    weightSqSum += priorWeight * priorWeight;
    ess = (weightSum * weightSum) / weightSqSum;

    const utilityForSelf = utilityWithBonus(child, edges[i]!.move);
    const selfUtility = pla === BLACK ? utilityForSelf : -utilityForSelf;
    const utilityVariance = utilitySqAvg - utilityAvg * utilityAvg;
    const estimateStdev = Math.sqrt(Math.max(0, utilityVariance / ess));
    const childRadius = estimateStdev * LCB_STDEVS;

    radius[i] = childRadius;
    lcb[i] = selfUtility - childRadius;
  }

  if (USE_LCB_FOR_SELECTION) {
    let bestLcb = -1e10;
    let bestLcbIndex = -1;
    for (let i = 0; i < n; i++) {
      const weight = values[i]!;
      if (weight > 0 && weight >= MIN_VISIT_PROP_FOR_LCB * nonLcbBestChildWeight) {
        if (lcb[i]! > bestLcb) {
          bestLcb = lcb[i]!;
          bestLcbIndex = i;
        }
      }
    }
    if (bestLcbIndex >= 0) {
      // The best-LCB move gets enough weight to beat every other child.
      let adjustedWeight = values[bestLcbIndex]!;
      for (let i = 0; i < n; i++) {
        if (i === bestLcbIndex) continue;
        const excessValue = bestLcb - lcb[i]!;
        if (excessValue < 0) continue;
        const childRadius = radius[i]!;
        // How many times wider would the radius have to be before this move's LCB
        // would win? Capped so no move can gain more than a factor of 5.
        const radiusFactor = (childRadius + excessValue) / (childRadius + 0.2 * excessValue);
        const lbound = radiusFactor * radiusFactor * values[i]!;
        if (lbound > adjustedWeight) adjustedWeight = lbound;
      }
      values[bestLcbIndex] = adjustedWeight;
    }
  }

  return { values, lcb, radius };
}

/**
 * KataGo's winrate-scale LCB hack (PlayUtils::getHackedLCBForWinrate): the real
 * LCB is on utility, so the radius is rescaled by how much winrate matters in it.
 */
const LCB_WINRATE_RADIUS_SCALE =
  0.5 * (WIN_LOSS_UTILITY_FACTOR / (WIN_LOSS_UTILITY_FACTOR + STATIC_SCORE_UTILITY_FACTOR + DYNAMIC_SCORE_UTILITY_FACTOR + 1e-20));

/**
 * Test seam: aggregates a parent's stats from plain child numbers through the real
 * recompute path, so the weighting can be checked without a network.
 */
export function recomputeNodeStatsForTest(args: {
  playerToMove: 'black' | 'white';
  own: { value: number; scoreLead: number; scoreMean: number; scoreMeanSq: number; utility: number; weight?: number };
  children: Array<{
    prior: number;
    visits: number;
    /** The parent's edge visits, which default to the child's own visit count. */
    edgeVisits?: number;
    weightSum?: number;
    weightSqSum?: number;
    value: number;
    scoreLead: number;
    scoreMean: number;
    scoreMeanSq: number;
    utility: number;
    utilitySq?: number;
  }>;
}): {
  weightSum: number;
  weightSqSum: number;
  valueAvg: number;
  scoreLeadAvg: number;
  scoreMeanAvg: number;
  scoreMeanSqAvg: number;
  utilityAvg: number;
  utilitySqAvg: number;
} {
  const pla = args.playerToMove === 'black' ? BLACK : WHITE;
  const node = new Node(pla);
  node.nnValue = args.own.value;
  node.nnScoreLead = args.own.scoreLead;
  node.nnScoreMean = args.own.scoreMean;
  node.nnScoreMeanSq = args.own.scoreMeanSq;
  node.nnUtility = args.own.utility;
  node.nnWeight = args.own.weight ?? 1;
  node.edges = args.children.map((c, i) => {
    const child = new Node(pla === BLACK ? WHITE : BLACK);
    child.visits = c.visits;
    child.weightSum = c.weightSum ?? c.visits;
    child.weightSqSum = c.weightSqSum ?? c.visits;
    child.valueAvg = c.value;
    child.scoreLeadAvg = c.scoreLead;
    child.scoreMeanAvg = c.scoreMean;
    child.scoreMeanSqAvg = c.scoreMeanSq;
    child.utilityAvg = c.utility;
    child.utilitySqAvg = c.utilitySq ?? c.utility * c.utility;
    return { move: i, prior: c.prior, child, visits: c.edgeVisits ?? c.visits } as Edge;
  });
  node.visits = 1 + args.children.reduce((n, c) => n + c.visits, 0);
  recomputeNodeStats(node);
  return {
    weightSum: node.weightSum,
    weightSqSum: node.weightSqSum,
    valueAvg: node.valueAvg,
    scoreLeadAvg: node.scoreLeadAvg,
    scoreMeanAvg: node.scoreMeanAvg,
    scoreMeanSqAvg: node.scoreMeanSqAvg,
    utilityAvg: node.utilityAvg,
    utilitySqAvg: node.utilitySqAvg,
  };
}

/**
 * Test seam: builds a throwaway node/edge tree from plain numbers and runs the
 * real play-selection code over it, so the LCB math can be checked without a
 * network. Not used by the engine itself.
 */
export function computePlaySelectionValuesForTest(args: {
  playerToMove: 'black' | 'white';
  parentVisits: number;
  parentUtilitySum: number;
  parentUtilitySqSum: number;
  parentNnUtility?: number;
  isRoot: boolean;
  children: Array<{
    prior: number;
    visits: number;
    /** The parent's edge visits, which default to the child's own visit count. */
    edgeVisits?: number;
    utilitySum: number;
    utilitySqSum: number;
    scoreMeanSum?: number;
    scoreMeanSqSum?: number;
  }>;
  endingBonus?: Float64Array | null;
  recentScoreCenter?: number;
}): { values: number[]; lcb: number[]; radius: number[] } | null {
  const pla = args.playerToMove === 'black' ? BLACK : WHITE;
  const node = new Node(pla);
  node.visits = args.parentVisits;
  node.weightSum = args.parentVisits;
  node.weightSqSum = args.parentVisits;
  node.utilityAvg = args.parentVisits > 0 ? args.parentUtilitySum / args.parentVisits : 0;
  node.utilitySqAvg = args.parentVisits > 0 ? args.parentUtilitySqSum / args.parentVisits : 0;
  node.nnUtility = args.parentNnUtility ?? null;
  node.edges = args.children.map((c, i) => {
    const child = new Node(pla === BLACK ? WHITE : BLACK);
    child.visits = c.visits;
    child.weightSum = c.visits;
    child.weightSqSum = c.visits;
    child.utilityAvg = c.visits > 0 ? c.utilitySum / c.visits : 0;
    child.utilitySqAvg = c.visits > 0 ? c.utilitySqSum / c.visits : 0;
    child.scoreMeanAvg = c.visits > 0 ? (c.scoreMeanSum ?? 0) / c.visits : 0;
    child.scoreMeanSqAvg = c.visits > 0 ? (c.scoreMeanSqSum ?? 0) / c.visits : 0;
    return { move: i, prior: c.prior, child, visits: c.edgeVisits ?? c.visits } as Edge;
  });
  const result = computePlaySelectionValues(
    node,
    args.isRoot,
    args.endingBonus ?? null,
    args.recentScoreCenter ?? 0
  );
  if (!result) return null;
  return {
    values: Array.from(result.values),
    lcb: Array.from(result.lcb),
    radius: Array.from(result.radius),
  };
}

type CandidateRow = {
  edge: Edge;
  move: number;
  visits: number;
  winRate: number;
  scoreLead: number;
  scoreSelfplay: number;
  scoreStdev: number;
  prior: number;
  playSelectionValue: number;
  edgeVisits: number; // what this parent paid for, which visits can exceed
  weight: number; // the child's own weight
  edgeWeight: number; // the share of it this edge bought
  utility: number; // child utilityAvg, from black's perspective
  lcbSelf: number; // utility LCB from the player-to-move's perspective
  radius: number;
};

export type AnalysisPayloadMove = {
  x: number;
  y: number;
  winRate: number;
  winRateLost: number;
  scoreLead: number;
  scoreSelfplay: number;
  scoreStdev: number;
  visits: number;
  /**
   * KataGo's edgeVisits: what the parent invested in this move. `visits` counts the
   * child node itself, which can be more when human SL exploration or a graph search
   * transposition brought other lines to the same position.
   */
  edgeVisits: number;
  /** Total weight behind the child, and the share of it this edge bought. */
  weight: number;
  edgeWeight: number;
  pointsLost: number;
  relativePointsLost: number;
  order: number;
  prior: number;
  pv: string[];
  pvVisits: number[];
  /** Visits this line paid for, which unlike pvVisits never rises along the PV. */
  pvEdgeVisits: number[];
  lcb: number;
  utilityLcb: number;
  playSelectionValue: number;
  /** KataGo's utilityAvg for this child, from black's perspective. */
  utility: number;
  /** Set when this move is a symmetric copy of the move that was actually searched. */
  isSymmetryOf?: { x: number; y: number };
  /** How likely a human of the configured rank is to play this move, if known. */
  humanPrior?: number;
  ownership?: FloatArray;
};

/**
 * Per-child stats plus KataGo play selection values for a searched root, sorted
 * the way KataGo sorts analysis data.
 */
function collectRootCandidateRows(
  rootNode: Node,
  endingBonus: Float64Array | null = null,
  recentScoreCenter = 0,
  suppressPass = false
): CandidateRow[] {
  const edges = rootNode.edges ?? [];
  const selection = computePlaySelectionValues(rootNode, true, endingBonus, recentScoreCenter, suppressPass);
  const rows: CandidateRow[] = [];

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    const child = e.child;
    if (!child || child.visits <= 0) continue;
    const q = child.valueAvg;
    const winRate = (q + 1) * 0.5;
    const scoreLead = child.scoreLeadAvg;
    const scoreSelfplay = child.scoreMeanAvg;
    const scoreMeanSq = child.scoreMeanSqAvg;
    const scoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreSelfplay * scoreSelfplay));
    rows.push({
      edge: e,
      move: e.move,
      visits: child.visits,
      winRate,
      scoreLead,
      scoreSelfplay,
      scoreStdev,
      prior: e.prior,
      playSelectionValue: selection ? selection.values[i]! : child.visits,
      edgeVisits: e.visits,
      weight: child.weightSum,
      edgeWeight: edgeChildWeight(e),
      utility: child.utilityAvg,
      lcbSelf: selection ? selection.lcb[i]! : 0,
      radius: selection ? selection.radius[i]! : 0,
    });
  }

  rows.sort(compareCandidateRows);
  return rows;
}

/** Turns sorted candidate rows into the analysis payload's move list. */
function buildAnalysisMoves(args: {
  rows: CandidateRow[];
  topK: number;
  pvDepth: number;
  currentPlayer: Player;
  rootWinRate: number;
  rootScoreLead: number;
  includeMovesOwnership: boolean;
  cloneBuffers: boolean;
  rootSymmetries?: number[];
  roiMask?: Uint8Array | null;
}): AnalysisPayloadMove[] {
  const { rows, rootWinRate, rootScoreLead } = args;
  const topRows = rows.length > args.topK ? rows.slice(0, args.topK) : rows;
  const best = topRows[0] ?? null;
  const bestScoreLead = best ? best.scoreLead : rootScoreLead;
  const sign = args.currentPlayer === 'black' ? 1 : -1;

  const built = topRows.map((m, i) => {
    const pointsLost = sign * (rootScoreLead - m.scoreLead);
    const relativePointsLost = sign * (bestScoreLead - m.scoreLead);
    const winRateLost = sign * (rootWinRate - m.winRate);

    const x = m.move === PASS_MOVE ? -1 : m.move % BOARD_SIZE;
    const y = m.move === PASS_MOVE ? -1 : (m.move / BOARD_SIZE) | 0;

    const pv = getPvForEdge(m.edge, args.pvDepth);
    const pvMoves = pv.moves;
    // KataGo reports lcb on the winrate scale and utilityLcb on the utility scale;
    // both are black-perspective here, like every other number in this payload.
    const lcb = m.winRate - sign * m.radius * LCB_WINRATE_RADIUS_SCALE;
    const utilityLcb = sign * m.lcbSelf;

    return {
      x,
      y,
      winRate: m.winRate,
      winRateLost,
      scoreLead: m.scoreLead,
      scoreSelfplay: m.scoreSelfplay,
      scoreStdev: m.scoreStdev,
      visits: m.visits,
      edgeVisits: m.edgeVisits,
      weight: m.weight,
      edgeWeight: m.edgeWeight,
      pointsLost,
      relativePointsLost,
      order: i,
      prior: m.prior,
      move: m.move,
      pvMoves,
      pv: pvMoves.map(moveToGtp),
      pvVisits: pv.pvVisits,
      pvEdgeVisits: pv.pvEdgeVisits,
      lcb,
      utilityLcb,
      playSelectionValue: m.playSelectionValue,
      utility: m.utility,
      ownership:
        args.includeMovesOwnership && m.edge.child?.ownership
          ? args.cloneBuffers
            ? new Float32Array(m.edge.child.ownership)
            : m.edge.child.ownership
          : undefined,
    };
  });

  const symmetries = args.rootSymmetries ?? [0];
  if (symmetries.length <= 1) {
    return built.map((row) => {
      const { move, pvMoves, ...rest } = row;
      void move;
      void pvMoves;
      return rest;
    });
  }

  // KataGo's duplicateForSymmetries: the search only looked at one copy of each
  // symmetric move, so put the copies back with their variations mapped over.
  const map = getSymPosMap();
  const roiMask = args.roiMask ?? null;
  const seen = new Set<number>();
  const out: AnalysisPayloadMove[] = [];
  for (const row of built) {
    const { move, pvMoves, ...base } = row;
    for (const sym of symmetries) {
      const symMove = move === PASS_MOVE ? PASS_MOVE : map[sym * BOARD_AREA + move]!;
      if (seen.has(symMove)) continue;
      if (roiMask && symMove !== PASS_MOVE && roiMask[symMove] === 0) continue;
      seen.add(symMove);
      const symPv = sym === 0 ? pvMoves : pvMoves.map((mv) => (mv === PASS_MOVE ? mv : map[sym * BOARD_AREA + mv]!));
      out.push({
        ...base,
        x: symMove === PASS_MOVE ? -1 : symMove % BOARD_SIZE,
        y: symMove === PASS_MOVE ? -1 : (symMove / BOARD_SIZE) | 0,
        pv: sym === 0 ? base.pv : symPv.map(moveToGtp),
        isSymmetryOf:
          sym === 0 || move === PASS_MOVE
            ? undefined
            : { x: move % BOARD_SIZE, y: (move / BOARD_SIZE) | 0 },
      });
    }
  }
  out.forEach((m, i) => (m.order = i));
  return out;
}

/** KataGo AnalysisData operator< (cpp/search/analysisdata.cpp). Negative = a first. */
function compareCandidateRows(
  a: { visits: number; playSelectionValue: number; prior: number },
  b: { visits: number; playSelectionValue: number; prior: number }
): number {
  if (a.visits > 0 && b.visits === 0) return -1;
  if (b.visits > 0 && a.visits === 0) return 1;
  if (a.playSelectionValue !== b.playSelectionValue) return b.playSelectionValue - a.playSelectionValue;
  if (a.visits !== b.visits) return b.visits - a.visits;
  return b.prior - a.prior;
}

function moveToGtp(move: number): string {
  if (move === PASS_MOVE) return 'pass';
  const x = move % BOARD_SIZE;
  const y = (move / BOARD_SIZE) | 0;
  const col = x >= 8 ? x + 1 : x; // Skip 'I'
  const letter = String.fromCharCode(65 + col);
  return `${letter}${BOARD_SIZE - y}`;
}

/**
 * KataGo's appendPV reports two counts per PV move: the node's own visits, which
 * under graph search can exceed its parent's because other lines reached it too,
 * and the edge visits this line actually paid for, which cannot.
 */
function buildPv(edge: Edge, maxDepth: number): { moves: number[]; pvVisits: number[]; pvEdgeVisits: number[] } {
  const pvMoves: number[] = [edge.move];
  const pvVisits: number[] = [edge.child?.visits ?? 0];
  const pvEdgeVisits: number[] = [edge.visits];
  let node = edge.child;
  let depth = 1;

  // KataGo's appendPV walks play selection values, not raw visits, so the PV
  // agrees with the LCB-adjusted move it reports at every depth.
  while (node && node.edges && node.edges.length > 0 && depth < maxDepth) {
    const selection = computePlaySelectionValues(node, false);
    if (!selection) break;
    let best: Edge | null = null;
    let bestValue = 0;
    for (let i = 0; i < node.edges.length; i++) {
      const value = selection.values[i]!;
      if (value > bestValue) {
        bestValue = value;
        best = node.edges[i]!;
      }
    }
    if (!best || bestValue <= 0) break;
    pvMoves.push(best.move);
    pvVisits.push(best.child?.visits ?? 0);
    pvEdgeVisits.push(best.visits);
    node = best.child;
    depth++;
  }

  return { moves: pvMoves, pvVisits, pvEdgeVisits };
}

function getPvForEdge(
  edge: Edge,
  maxDepth: number
): { moves: number[]; pvVisits: number[]; pvEdgeVisits: number[] } {
  const visits = edge.child?.visits ?? 0;
  const cache = edge.pvCache;
  if (cache && cache.visits === visits && cache.depth === maxDepth) return cache;
  const built = buildPv(edge, maxDepth);
  const cached = {
    visits,
    depth: maxDepth,
    moves: built.moves,
    pvVisits: built.pvVisits,
    pvEdgeVisits: built.pvEdgeVisits,
  };
  edge.pvCache = cached;
  return cached;
}

const NUM_SYMMETRIES = 8;
let symPosMapBoardArea = 0;
let SYM_POS_MAP: Int16Array<ArrayBufferLike> = new Int16Array(0);

const buildSymPosMap = (): Int16Array<ArrayBufferLike> => {
  const n = BOARD_SIZE;
  const map = new Int16Array(NUM_SYMMETRIES * BOARD_AREA);
  for (let sym = 0; sym < NUM_SYMMETRIES; sym++) {
    const symOff = sym * BOARD_AREA;
    const mirror = sym >= 4;
    const rot = sym & 3;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const sx = mirror ? n - 1 - x : x;
        const sy = y;
        let tx: number;
        let ty: number;
        if (rot === 0) {
          tx = sx;
          ty = sy;
        } else if (rot === 1) {
          tx = sy;
          ty = n - 1 - sx;
        } else if (rot === 2) {
          tx = n - 1 - sx;
          ty = n - 1 - sy;
        } else {
          tx = n - 1 - sy;
          ty = sx;
        }
        map[symOff + y * n + x] = ty * n + tx;
      }
    }
  }
  return map;
};

const getSymPosMap = (): Int16Array<ArrayBufferLike> => {
  const expectedSize = NUM_SYMMETRIES * BOARD_AREA;
  if (symPosMapBoardArea !== BOARD_AREA || SYM_POS_MAP.length !== expectedSize) {
    SYM_POS_MAP = buildSymPosMap();
    symPosMapBoardArea = BOARD_AREA;
  }
  return SYM_POS_MAP;
};

function clampRootSymmetrySamples(samples?: number): number {
  if (typeof samples !== 'number' || !Number.isFinite(samples)) return 1;
  return Math.max(1, Math.min(NUM_SYMMETRIES, Math.floor(samples)));
}

/**
 * How many symmetries to average at the root.
 *
 * The net is only approximately symmetry-equivariant, so a single view of a position
 * carries real noise -- on the shipped 6-block net that is worth up to ~0.25 of ownership
 * on a point. Averaging several views cancels most of it. It costs one extra batched
 * evaluation per position, which is small next to the hundreds a search does, so it is
 * only skipped on the pure-JS 'cpu' fallback where a single forward pass already
 * dominates.
 */
export function rootSymmetrySamplesForBackend(backend: string): number {
  if (backend === 'webgpu') return NUM_SYMMETRIES;
  if (backend === 'wasm') return 4;
  return 1;
}

function averageRootEvals(evals: NeuralEval[], outputScaleMultiplier: number): NeuralEval {
  const first = evals[0];
  if (!first) throw new Error('No root evaluations to average');
  if (evals.length === 1) return first;

  const inv = 1.0 / evals.length;
  const symPosMap = getSymPosMap();
  const policyProbSums = new Float64Array(BOARD_AREA);
  const ownershipSums = first.ownership ? new Float64Array(BOARD_AREA) : null;
  let passProbSum = 0;
  let blackWinProb = 0;
  let blackScoreLead = 0;
  let blackScoreMean = 0;
  let blackScoreMeanSq = 0;
  let blackNoResultProb = 0;
  let shorttermWinlossError = 0;
  let shorttermScoreError = 0;

  for (const ev of evals) {
    const sym = ev.symmetry;
    const symOff = sym * BOARD_AREA;
    let maxLogit = ev.passLogit;
    for (let p = 0; p < BOARD_AREA; p++) {
      const logit = ev.policy[p]!;
      if (logit > maxLogit) maxLogit = logit;
    }

    let probSum = Math.exp(ev.passLogit - maxLogit);
    for (let p = 0; p < BOARD_AREA; p++) probSum += Math.exp(ev.policy[p]! - maxLogit);
    const probScale = inv / probSum;
    passProbSum += Math.exp(ev.passLogit - maxLogit) * probScale;

    for (let p = 0; p < BOARD_AREA; p++) {
      const symPos = sym === 0 ? p : symPosMap[symOff + p]!;
      policyProbSums[p] += Math.exp(ev.policy[symPos]! - maxLogit) * probScale;
      if (ownershipSums) {
        if (!ev.ownership) throw new Error('Missing ownership output');
        // KataGo averages ownership after the tanh, not before, so do the same here.
        ownershipSums[p] += activatedOwnership(ev, symPos, outputScaleMultiplier) * inv;
      }
    }

    blackWinProb += ev.blackWinProb * inv;
    blackScoreLead += ev.blackScoreLead * inv;
    blackScoreMean += ev.blackScoreMean * inv;
    blackScoreMeanSq += (ev.blackScoreStdev * ev.blackScoreStdev + ev.blackScoreMean * ev.blackScoreMean) * inv;
    blackNoResultProb += ev.blackNoResultProb * inv;
    if (ev.shorttermWinlossError >= 0) shorttermWinlossError += ev.shorttermWinlossError * inv;
    if (ev.shorttermScoreError >= 0) shorttermScoreError += ev.shorttermScoreError * inv;
  }

  const minPolicyProb = 1e-30;
  const policy = new Float32Array(BOARD_AREA);
  for (let p = 0; p < BOARD_AREA; p++) policy[p] = Math.log(Math.max(minPolicyProb, policyProbSums[p]!));

  let ownership: Float32Array | undefined;
  if (ownershipSums) {
    ownership = new Float32Array(BOARD_AREA);
    for (let p = 0; p < BOARD_AREA; p++) ownership[p] = ownershipSums[p]!;
  }

  return {
    policy,
    symmetry: 0,
    passLogit: Math.log(Math.max(minPolicyProb, passProbSum)),
    blackWinProb,
    blackScoreLead,
    blackScoreMean,
    blackScoreStdev: Math.sqrt(Math.max(0, blackScoreMeanSq - blackScoreMean * blackScoreMean)),
    blackNoResultProb,
    // Averaged over the symmetries that reported them; -1 if the net has no such head.
    shorttermWinlossError: first.shorttermWinlossError >= 0 ? shorttermWinlossError : -1,
    shorttermScoreError: first.shorttermScoreError >= 0 ? shorttermScoreError : -1,
    libertyMap: new Uint8Array(first.libertyMap),
    areaMap: new Uint8Array(first.areaMap),
    ownership,
    ownershipIsActivated: ownership ? true : undefined,
  };
}

/**
 * Evaluates the root position. Unlike leaf evaluations this never randomizes the
 * symmetry: either one fixed view, or a fixed set of views averaged together. The root
 * is evaluated once and its numbers are what the user reads, so randomizing it would
 * only add noise to the reported win rate, score and ownership map.
 */
async function evaluateRootEval(args: {
  model: KataGoModelV8Tf;
  includeOwnership?: boolean;
  rules: GameRules;
  rootSymmetrySamples?: number;
  policyOptimism: number;
  komi: number;
  outputScaleMultiplier: number;
  state: EvalState;
}): Promise<NeuralEval> {
  const rootSymmetrySamples = clampRootSymmetrySamples(args.rootSymmetrySamples);
  if (rootSymmetrySamples <= 1) {
    return (
      await evaluateBatch({
        model: args.model,
        includeOwnership: args.includeOwnership,
        rules: args.rules,
        nnRandomize: false,
        policyOptimism: args.policyOptimism,
        komi: args.komi,
        states: [{ ...args.state, symmetry: 0 }],
      })
    )[0]!;
  }

  const states = new Array<EvalState>(rootSymmetrySamples);
  for (let symmetry = 0; symmetry < rootSymmetrySamples; symmetry++) {
    states[symmetry] = { ...args.state, symmetry };
  }

  return averageRootEvals(
    await evaluateBatch({
      model: args.model,
      includeOwnership: args.includeOwnership,
      rules: args.rules,
      nnRandomize: false,
      policyOptimism: args.policyOptimism,
      komi: args.komi,
      states,
    }),
    args.outputScaleMultiplier
  );
}

type EvalBatchScratch = {
  spatialBatch: Float32Array;
  globalBatch: Float32Array;
  libertyMapScratch: Uint8Array;
  areaMapScratch: Uint8Array | null;
  ladderedStonesScratch: Uint8Array;
  ladderWorkingMovesScratch: Uint8Array;
  prevLadderedStonesScratch: Uint8Array;
  prevPrevLadderedStonesScratch: Uint8Array;
  symmetries: Uint8Array;
  spatialScratch: Float32Array;
  globalScratch: Float32Array;
  policyScratch: Float32Array;
  passScratch: Float32Array;
};

let EMPTY_AREA_MAP = new Uint8Array(BOARD_AREA);

let evalScratchNoArea: EvalBatchScratch | null = null;
let evalScratchWithArea: EvalBatchScratch | null = null;
let evalScratchBoardArea = BOARD_AREA;

function getEvalScratch(args: { batch: number; includeAreaFeature: boolean }): EvalBatchScratch {
  const { batch, includeAreaFeature } = args;
  if (evalScratchBoardArea !== BOARD_AREA) {
    evalScratchNoArea = null;
    evalScratchWithArea = null;
    evalScratchBoardArea = BOARD_AREA;
    EMPTY_AREA_MAP = new Uint8Array(BOARD_AREA);
  }
  const neededSpatial = batch * BOARD_AREA * 22;
  const neededGlobal = batch * 19;
  const neededMaps = batch * BOARD_AREA;
  const neededPolicy = batch * BOARD_AREA;

  const existing = includeAreaFeature ? evalScratchWithArea : evalScratchNoArea;
  if (
    existing &&
    existing.spatialBatch.length >= neededSpatial &&
    existing.globalBatch.length >= neededGlobal &&
    existing.libertyMapScratch.length >= neededMaps &&
    existing.symmetries.length >= batch &&
    existing.policyScratch.length >= neededPolicy &&
    existing.passScratch.length >= batch &&
    (!includeAreaFeature || (existing.areaMapScratch && existing.areaMapScratch.length >= neededMaps))
  ) {
    return existing;
  }

  const scratch: EvalBatchScratch = {
    spatialBatch: new Float32Array(neededSpatial),
    globalBatch: new Float32Array(neededGlobal),
    libertyMapScratch: new Uint8Array(neededMaps),
    areaMapScratch: includeAreaFeature ? new Uint8Array(neededMaps) : null,
    ladderedStonesScratch: new Uint8Array(BOARD_AREA),
    ladderWorkingMovesScratch: new Uint8Array(BOARD_AREA),
    prevLadderedStonesScratch: new Uint8Array(BOARD_AREA),
    prevPrevLadderedStonesScratch: new Uint8Array(BOARD_AREA),
    symmetries: new Uint8Array(batch),
    spatialScratch: new Float32Array(BOARD_AREA * 22),
    globalScratch: new Float32Array(19),
    policyScratch: new Float32Array(neededPolicy),
    passScratch: new Float32Array(batch),
  };

  if (includeAreaFeature) evalScratchWithArea = scratch;
  else evalScratchNoArea = scratch;
  return scratch;
}

type EvalState = {
  stones: Uint8Array;
  koPoint: number;
  prevStones: Uint8Array;
  prevKoPoint: number;
  prevPrevStones: Uint8Array;
  prevPrevKoPoint: number;
  currentPlayer: Player;
  recentMoves: RecentMove[];
  libertyMap?: Uint8Array;
  prevLibertyMap?: Uint8Array;
  prevPrevLibertyMap?: Uint8Array;
  komi?: number;
  conservativePassAndIsRoot?: boolean;
  symmetry?: number;
  /** KataGo maxHistory: how far back the history planes may look. Defaults to 5. */
  maxHistory?: number;
  /** KataGo enablePassingHacks: hide the end of the game from a side that is losing. */
  enablePassingHacks?: boolean;
};

type NeuralEval = {
  policy: Float32Array; // len 361, in symmetry space if symmetry != 0
  symmetry: number; // 0..7, where 0 is identity
  passLogit: number;
  blackWinProb: number;
  blackScoreLead: number;
  blackScoreMean: number;
  blackScoreStdev: number;
  blackNoResultProb: number;
  // -1 when the net is older than model version 10 and does not predict them.
  shorttermWinlossError: number;
  shorttermScoreError: number;
  libertyMap: Uint8Array;
  areaMap: Uint8Array;
  ownership?: Float32Array; // len 361, raw logits (player-to-move perspective, symmetry space if symmetry != 0)
  // Set when `ownership` already holds tanh-activated values rather than raw logits,
  // which is the case once several symmetries have been averaged together.
  ownershipIsActivated?: boolean;
};

/** Ownership as tanh-activated values, whatever form the eval carries it in. */
function activatedOwnership(ev: NeuralEval, pos: number, outputScaleMultiplier: number): number {
  const raw = ev.ownership![pos]!;
  return ev.ownershipIsActivated ? raw : Math.tanh(raw * outputScaleMultiplier);
}

async function evaluateBatch(args: {
  model: KataGoModelV8Tf;
  includeOwnership?: boolean;
  rules: GameRules;
  nnRandomize: boolean;
  policyOptimism: number;
  komi: number;
  states: EvalState[];
}): Promise<NeuralEval[]> {
  const { model, states } = args;
  const includeOwnership = args.includeOwnership === true;
  const rules = args.rules;
  const nnRandomize = args.nnRandomize;
  const policyOptimism = Math.max(0, Math.min(args.policyOptimism, 1));
  const includeAreaFeature = rules === 'chinese';
  const batch = states.length;
  const scratch = getEvalScratch({ batch, includeAreaFeature });
  const spatialBatch = scratch.spatialBatch.subarray(0, batch * BOARD_AREA * 22);
  const globalBatch = scratch.globalBatch.subarray(0, batch * 19);
  const libertyMapScratch = scratch.libertyMapScratch.subarray(0, batch * BOARD_AREA);
  const areaMapScratch = includeAreaFeature ? scratch.areaMapScratch!.subarray(0, batch * BOARD_AREA) : null;
  const symmetries = scratch.symmetries.subarray(0, batch);
  const spatialScratch = scratch.spatialScratch;
  const globalScratch = scratch.globalScratch;

  for (let i = 0; i < batch; i++) {
    const state = states[i]!;
    const libertyMap = libertyMapScratch.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA);
    if (state.libertyMap) libertyMap.set(state.libertyMap);
    else computeLibertyMapInto(state.stones, libertyMap);
    const areaMap = includeAreaFeature
      ? computeAreaMapV7KataGoInto(state.stones, areaMapScratch!.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA))
      : EMPTY_AREA_MAP;
    if (hasLadderCandidates(libertyMap)) {
      computeLadderFeaturesV7KataGoInto({
        stones: state.stones,
        koPoint: state.koPoint,
        currentPlayer: playerToColor(state.currentPlayer),
        outLadderedStones: scratch.ladderedStonesScratch,
        outLadderWorkingMoves: scratch.ladderWorkingMovesScratch,
      });
    } else {
      scratch.ladderedStonesScratch.fill(0);
      scratch.ladderWorkingMovesScratch.fill(0);
    }

    const recentMoves = state.recentMoves;
    const lastRecentMove = recentMoves.length > 0 ? recentMoves[recentMoves.length - 1] : null;
    const passWouldEndGame = lastRecentMove?.move === PASS_MOVE;
    const suppressHistory = state.conservativePassAndIsRoot === true && passWouldEndGame;

    const pla = state.currentPlayer;
    const opp = pla === 'black' ? 'white' : 'black';
    const expectedPlayers: Player[] = [opp, pla, opp, pla, opp];

    const maxTurnsOfHistoryToInclude = Math.max(0, Math.min(5, state.maxHistory ?? 5));
    let numTurnsOfHistoryIncluded = 0;
    if (!suppressHistory) {
      for (let h = 0; h < maxTurnsOfHistoryToInclude; h++) {
        const m = recentMoves[recentMoves.length - 1 - h];
        if (!m) break;
        if (m.player !== expectedPlayers[h]) break;
        numTurnsOfHistoryIncluded++;
      }
    }

    const prevLadderStones = numTurnsOfHistoryIncluded < 1 ? state.stones : state.prevStones;
    const prevLadderKoPoint = numTurnsOfHistoryIncluded < 1 ? state.koPoint : state.prevKoPoint;
    const prevPrevLadderStones = numTurnsOfHistoryIncluded < 2 ? prevLadderStones : state.prevPrevStones;
    const prevPrevLadderKoPoint = numTurnsOfHistoryIncluded < 2 ? prevLadderKoPoint : state.prevPrevKoPoint;

    const prevLibertyMap = prevLadderStones === state.stones ? libertyMap : state.prevLibertyMap;
    if (prevLibertyMap && !hasLadderCandidates(prevLibertyMap)) {
      scratch.prevLadderedStonesScratch.fill(0);
    } else {
      computeLadderedStonesV7KataGoInto({
        stones: prevLadderStones,
        koPoint: prevLadderKoPoint,
        outLadderedStones: scratch.prevLadderedStonesScratch,
      });
    }
    const prevPrevLibertyMap =
      prevPrevLadderStones === prevLadderStones ? prevLibertyMap : state.prevPrevLibertyMap;
    if (prevPrevLibertyMap && !hasLadderCandidates(prevPrevLibertyMap)) {
      scratch.prevPrevLadderedStonesScratch.fill(0);
    } else {
      computeLadderedStonesV7KataGoInto({
        stones: prevPrevLadderStones,
        koPoint: prevPrevLadderKoPoint,
        outLadderedStones: scratch.prevPrevLadderedStonesScratch,
      });
    }

    fillInputsV7Fast({
      stones: state.stones,
      koPoint: state.koPoint,
      currentPlayer: state.currentPlayer,
      recentMoves,
      komi: state.komi ?? args.komi,
      rules,
      conservativePassAndIsRoot: state.conservativePassAndIsRoot,
      maxHistory: maxTurnsOfHistoryToInclude,
      enablePassingHacks: state.enablePassingHacks,
      libertyMap,
      areaMap: includeAreaFeature ? areaMap : undefined,
      ladderedStones: scratch.ladderedStonesScratch,
      ladderWorkingMoves: scratch.ladderWorkingMovesScratch,
      prevLadderedStones: scratch.prevLadderedStonesScratch,
      prevPrevLadderedStones: scratch.prevPrevLadderedStonesScratch,
      outSpatial: spatialScratch,
      outGlobal: globalScratch,
    });

    const requestedSymmetry = state.symmetry;
    const sym =
      typeof requestedSymmetry === 'number' && Number.isFinite(requestedSymmetry)
        ? Math.max(0, Math.min(NUM_SYMMETRIES - 1, Math.floor(requestedSymmetry)))
        : nnRandomize
          ? ((Math.random() * NUM_SYMMETRIES) | 0)
          : 0;
    symmetries[i] = sym;
    const spatialOffset = i * BOARD_AREA * 22;
    if (sym === 0) {
      spatialBatch.set(spatialScratch, spatialOffset);
    } else {
      const symOff = sym * BOARD_AREA;
      const symPosMap = getSymPosMap();
      const src = spatialScratch;
      for (let pos = 0; pos < BOARD_AREA; pos++) {
        const dstPos = symPosMap[symOff + pos]!;
        const srcBase = pos * 22;
        const dstBase = spatialOffset + dstPos * 22;
        for (let c = 0; c < 22; c++) {
          spatialBatch[dstBase + c] = src[srcBase + c]!;
        }
      }
    }

    globalBatch.set(globalScratch, i * 19);
  }

  const spatialTensor = tf.tensor4d(spatialBatch, [batch, BOARD_SIZE, BOARD_SIZE, 22]);
  const globalTensor = tf.tensor2d(globalBatch, [batch, 19]);
  const out = includeOwnership ? model.forward(spatialTensor, globalTensor) : model.forwardPolicyValue(spatialTensor, globalTensor);

  const ownershipPromise = includeOwnership && hasOwnership(out) ? out.ownership.data() : Promise.resolve(null);
  const [policyArr, passArr, valueArr, scoreArr, ownershipArr] = await Promise.all([
    out.policy.data(),
    out.policyPass.data(),
    out.value.data(),
    out.scoreValue.data(),
    ownershipPromise,
  ]);

  spatialTensor.dispose();
  globalTensor.dispose();
  out.policy.dispose();
  out.policyPass.dispose();
  out.value.dispose();
  out.scoreValue.dispose();
  if (hasOwnership(out)) out.ownership.dispose();

  const policyChannels = model.policyOutChannels;
  const usePolicyOptimism = policyChannels === 2 || (policyChannels === 4 && model.modelVersion >= 16);
  const mix = usePolicyOptimism ? policyOptimism : 0;
  let policyLogits = policyArr as Float32Array;
  let passLogits = passArr as Float32Array;

  if (policyChannels > 1) {
    const mixedPolicy = scratch.policyScratch.subarray(0, batch * BOARD_AREA);
    const mixedPass = scratch.passScratch.subarray(0, batch);
    for (let i = 0; i < batch; i++) {
      const baseOff = i * BOARD_AREA * policyChannels;
      const outOff = i * BOARD_AREA;
      for (let p = 0; p < BOARD_AREA; p++) {
        const src = baseOff + p * policyChannels;
        const base = policyArr[src]!;
        const opt = policyArr[src + 1]!;
        mixedPolicy[outOff + p] = base + (opt - base) * mix;
      }
      const passBase = passArr[i * policyChannels]!;
      const passOpt = passArr[i * policyChannels + 1]!;
      mixedPass[i] = passBase + (passOpt - passBase) * mix;
    }
    policyLogits = mixedPolicy;
    passLogits = mixedPass;
  }

  const results: NeuralEval[] = [];
  for (let i = 0; i < batch; i++) {
    const pOff = i * BOARD_AREA;
    const sym = symmetries[i]!;
    const policy = policyLogits.subarray(pOff, pOff + BOARD_AREA);
    const ownership = includeOwnership ? (ownershipArr as Float32Array).subarray(pOff, pOff + BOARD_AREA) : undefined;

    const passLogit = passLogits[i]!;
    const vOff = i * 3;
    const scoreChannels = model.scoreValueChannels;
    const sOff = i * scoreChannels;
    const evaled = postprocessKataGoV8({
      nextPlayer: states[i]!.currentPlayer,
      valueLogits: valueArr.subarray(vOff, vOff + 3),
      scoreValue: scoreArr.subarray(sOff, sOff + scoreChannels),
      postProcessParams: model.postProcessParams,
      modelVersion: model.modelVersion,
    });

    results.push({
      policy,
      symmetry: sym,
      passLogit,
      shorttermWinlossError: evaled.shorttermWinlossError,
      shorttermScoreError: evaled.shorttermScoreError,
      blackWinProb: evaled.blackWinProb,
      blackScoreLead: evaled.blackScoreLead,
      blackScoreMean: evaled.blackScoreMean,
      blackScoreStdev: evaled.blackScoreStdev,
      blackNoResultProb: evaled.blackNoResultProb,
      libertyMap: libertyMapScratch.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA),
      areaMap: includeAreaFeature ? areaMapScratch!.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA) : EMPTY_AREA_MAP,
      ownership,
    });
  }

  return results;
}

export class MctsSearch {
  readonly model: KataGoModelV8Tf;
  readonly ownershipMode: OwnershipMode;
  readonly maxChildren: number;
  private currentPlayer: Player;
  readonly komi: number;
  readonly rules: GameRules;
  readonly nnRandomize: boolean;
  readonly conservativePass: boolean;
  readonly wideRootNoise: number;
  readonly rootSymmetrySamples: number;
  private readonly outputScaleMultiplier: number;

  private rootStones: Uint8Array<ArrayBuffer>;
  private rootKoPoint: number;
  private rootPrevStones: Uint8Array<ArrayBuffer>;
  private rootPrevKoPoint: number;
  private rootMoves: RecentMove[];
  private rootLibertyMap: Uint8Array;
  private rootPrevLibertyMap: Uint8Array;

  private rootNode: Node;
  private rootPolicy: Float32Array; // len 362
  private rootOwnership: Float32Array; // len 361
  private recentScoreCenter: number;
  private readonly rand: Rand;

  private jobStonesScratch = new Uint8Array(0);
  private jobPrevStonesScratch = new Uint8Array(0);
  private jobPrevPrevStonesScratch = new Uint8Array(0);
  private jobLibertyMapScratch = new Uint8Array(0);
  private jobPrevLibertyMapScratch = new Uint8Array(0);
  private jobPrevPrevLibertyMapScratch = new Uint8Array(0);
  private jobRecentMovesScratch: RecentMove[][] = [];
  private libertyMapStack: Uint8Array[] = [];
  private libertySeedsScratch = new Int16Array(BOARD_AREA * 5);
  private treeOwnershipCache: { visits: number; ownership: Float32Array; ownershipStdev: Float32Array; timestamp: number } | null = null;
  private rootSymmetries: number[];
  private roiMask: Uint8Array | null;
  private rootEndingBonus: Float64Array | null;
  private forcedRootMoves: Uint8Array | null;
  /**
   * KataGo humanSLRootExploreProb*: how often a playout leaves the root by the
   * human policy instead of the net's. Null when the caller asked for neither.
   */
  private humanExplore: HumanExploreParams | null;
  /**
   * KataGo ignorePreRootHistory, which its analysis engine turns on by default: the
   * network sees no moves from before the root, only the ones the search itself
   * played. Analysis then judges the position rather than the path that reached it.
   */
  private readonly ignorePreRootHistory: boolean;
  /**
   * KataGo enablePassingHacks, on by default for its analysis setup: a side that is
   * losing is not told that passing would end the game, so it keeps looking for
   * something better instead of conceding the score it stands to lose by.
   */
  private readonly enablePassingHacks: boolean;
  /**
   * KataGo's node table: the position hash of every node in the tree, so a position
   * the search reaches a second way is recognised instead of duplicated.
   */
  private readonly useGraphSearch: boolean = USE_GRAPH_SEARCH;
  /** KataGo rootPolicyTemperature and rootPolicyTemperatureEarly, before interpolation. */
  private readonly fillDameBeforePass: boolean;
  private readonly rootPolicyTemperature: number;
  private readonly rootPolicyTemperatureEarly: number;
  private readonly transpositionTable = new Map<number, Node>();
  private readonly rootGraphHash = new Int32Array(2);
  private readonly graphHashScratch = new Int32Array(2);
  private rootConsecutivePasses = 0;
  /** KataGo rootInfo's raw* fields: the network's own read of the root, unsearched. */
  private rootRaw = {
    winRate: 0.5,
    scoreLead: 0,
    scoreSelfplay: 0,
    scoreSelfplayStdev: 0,
    noResultProb: 0,
    stWrError: -1,
    stScoreError: -1,
  };
  /** How often a transposition was found. Reported for tests and diagnostics. */
  private transpositionHits = 0;
  /**
   * Whether a game that ends inside the search gets its real score. Only area
   * scoring can be counted straight off the board; territory rules need the dead
   * stones agreed first, which is what KataGo's encore is for, so under those the
   * network keeps judging the position as it does today.
   */
  private readonly scoreTerminalNodes: boolean;
  private readonly subtreeBiasTable = new SubtreeBiasTable();
  private readonly rootSymmetryPruning: boolean;

  private constructor(args: {
    model: KataGoModelV8Tf;
    ownershipMode: OwnershipMode;
    maxChildren: number;
    currentPlayer: Player;
    komi: number;
    rules: GameRules;
    nnRandomize: boolean;
    conservativePass: boolean;
    wideRootNoise: number;
    rootSymmetrySamples: number;
    rootStones: Uint8Array<ArrayBuffer>;
    rootKoPoint: number;
    rootPrevStones: Uint8Array<ArrayBuffer>;
    rootPrevKoPoint: number;
    rootMoves: RecentMove[];
    rootNode: Node;
    rootLibertyMap: Uint8Array;
    rootPrevLibertyMap: Uint8Array;
    rootPolicy: Float32Array;
    rootOwnership: Float32Array;
    recentScoreCenter: number;
    rand: Rand;
    outputScaleMultiplier: number;
    rootSymmetries: number[];
    roiMask: Uint8Array | null;
    rootSymmetryPruning: boolean;
    rootEndingBonus: Float64Array | null;
    forcedRootMoves: Uint8Array | null;
    humanExplore: HumanExploreParams | null;
    ignorePreRootHistory: boolean;
    enablePassingHacks: boolean;
    useGraphSearch: boolean;
    fillDameBeforePass: boolean;
    rootRaw: {
      winRate: number;
      scoreLead: number;
      scoreSelfplay: number;
      scoreSelfplayStdev: number;
      noResultProb: number;
      stWrError: number;
      stScoreError: number;
    };
    rootPolicyTemperature: number;
    rootPolicyTemperatureEarly: number;
  }) {
    this.model = args.model;
    this.ownershipMode = args.ownershipMode;
    this.maxChildren = args.maxChildren;
    this.currentPlayer = args.currentPlayer;
    this.komi = args.komi;
    this.rules = args.rules;
    this.nnRandomize = args.nnRandomize;
    this.conservativePass = args.conservativePass;
    this.wideRootNoise = args.wideRootNoise;
    this.rootSymmetrySamples = args.rootSymmetrySamples;

    this.rootStones = args.rootStones;
    this.rootKoPoint = args.rootKoPoint;
    this.rootPrevStones = args.rootPrevStones;
    this.rootPrevKoPoint = args.rootPrevKoPoint;
    this.rootMoves = args.rootMoves;

    this.rootNode = args.rootNode;
    this.rootLibertyMap = args.rootLibertyMap;
    this.rootPrevLibertyMap = args.rootPrevLibertyMap;
    this.rootPolicy = args.rootPolicy;
    this.rootOwnership = args.rootOwnership;
    this.recentScoreCenter = args.recentScoreCenter;
    this.rand = args.rand;
    this.outputScaleMultiplier = args.outputScaleMultiplier;
    this.rootSymmetries = args.rootSymmetries;
    this.roiMask = args.roiMask;
    this.rootSymmetryPruning = args.rootSymmetryPruning;
    this.rootEndingBonus = args.rootEndingBonus;
    this.forcedRootMoves = args.forcedRootMoves;
    this.humanExplore = args.humanExplore;
    this.ignorePreRootHistory = args.ignorePreRootHistory;
    this.enablePassingHacks = args.enablePassingHacks;
    this.useGraphSearch = args.useGraphSearch;
    this.fillDameBeforePass = args.fillDameBeforePass;
    this.rootRaw = args.rootRaw;
    this.rootPolicyTemperature = args.rootPolicyTemperature;
    this.rootPolicyTemperatureEarly = args.rootPolicyTemperatureEarly;
    this.resetGraphSearchState();
    this.scoreTerminalNodes = args.rules === 'chinese';
  }

  /**
   * Start the node table over and re-hash the root. Everything in the table belongs
   * to the tree that hangs off the current root, so re-rooting has to clear it or a
   * stale entry could graft a position that is no longer reachable back in.
   */
  private resetGraphSearchState(): void {
    this.transpositionTable.clear();
    this.transpositionHits = 0;
    this.rootConsecutivePasses = countConsecutiveEndingPasses(this.rootMoves);
    computeStateHash(
      this.rootStones,
      this.rootKoPoint,
      this.rootNode.playerToMove,
      this.rootConsecutivePasses,
      this.rootGraphHash
    );
  }

  /** How many times the search found a position it had already reached another way. */
  getTranspositionHits(): number {
    return this.transpositionHits;
  }

  /**
   * KataGo Search::shouldSuppressPass (cpp/search/searchhelpers.cpp). Under territory
   * scoring, passing is taken off the table while some move that is not deep in the
   * opponent's territory still costs nothing to play, so dame get filled instead of
   * left for the opponent to tidy up.
   */
  private shouldSuppressPass(): boolean {
    if (!this.fillDameBeforePass) return false;
    if (this.rules !== 'japanese' && this.rules !== 'korean') return false;
    const ownership = this.ownershipMode === 'none' ? null : this.rootOwnership;
    if (!ownership) return false;
    const edges = this.rootNode.edges;
    if (!edges) return false;

    const pla = this.rootNode.playerToMove;
    const sign = pla === BLACK ? 1 : -1;

    let passEdge: Edge | null = null;
    for (const e of edges) {
      if (e.move === PASS_MOVE && e.child) {
        passEdge = e;
        break;
      }
    }
    if (!passEdge?.child) return false;
    const passWeight = edgeChildWeight(passEdge);
    if (passEdge.child.visits <= 0 || passWeight <= 1e-10) return false;
    const passUtility = sign * passEdge.child.utilityAvg;
    const passScoreMean = sign * passEdge.child.scoreMeanAvg;
    const passLead = sign * passEdge.child.scoreLeadAvg;

    // Ownership is stored from black's perspective, so flip it for white.
    const extreme = 0.95;
    const ownedByPla = (pos: number): number => sign * ownership[pos]!;

    for (const e of edges) {
      const child = e.child;
      if (!child || e.move === PASS_MOVE) continue;

      // A point the opponent all but owns is not dame, unless it touches something
      // this player owns, in which case it is still worth playing.
      const oppOwned = ownedByPla(e.move) < -extreme;
      if (oppOwned) {
        let adjToPlaOwned = false;
        const nStart = NEIGHBOR_STARTS[e.move]!;
        const nCount = NEIGHBOR_COUNTS[e.move]!;
        for (let i = 0; i < nCount; i++) {
          if (ownedByPla(NEIGHBOR_LIST[nStart + i]!) > extreme) {
            adjToPlaOwned = true;
            break;
          }
        }
        if (!adjToPlaOwned) continue;
      }

      const childWeight = edgeChildWeight(e);
      // Too little of the search behind it to trust the comparison.
      if ((e.visits <= 500 && childWeight <= 2 * Math.sqrt(passWeight)) || childWeight <= 1e-10) continue;

      if (
        sign * child.utilityAvg > passUtility - 0.1 &&
        sign * child.scoreMeanAvg > passScoreMean - 0.5 &&
        sign * child.scoreLeadAvg > passLead - 0.5
      ) {
        return true;
      }
    }
    return false;
  }

  /** rootPolicyTemperature for the root's turn number, KataGo's interpolateEarly. */
  private effectiveRootPolicyTemperature(turnNumber: number): number {
    if (this.rootPolicyTemperature === 1 && this.rootPolicyTemperatureEarly === 1) return 1;
    return interpolateEarly({
      halflife: CHOSEN_MOVE_TEMPERATURE_HALFLIFE,
      earlyValue: this.rootPolicyTemperatureEarly,
      value: this.rootPolicyTemperature,
      turnNumber,
      boardWidth: BOARD_SIZE,
      boardHeight: BOARD_SIZE,
    });
  }

  static async create(args: {
    model: KataGoModelV8Tf;
    board: BoardState;
    previousBoard?: BoardState;
    previousPreviousBoard?: BoardState;
    currentPlayer: Player;
    moveHistory: Move[];
    komi: number;
    rules: GameRules;
    nnRandomize: boolean;
    conservativePass: boolean;
    maxChildren: number;
    ownershipMode: OwnershipMode;
    wideRootNoise: number;
    rootSymmetrySamples?: number;
    regionOfInterest?: RegionOfInterest | null;
    rootSymmetryPruning?: boolean;
    /** Human SL policy for the root position, used to widen the candidate list. */
    humanPolicy?: ArrayLike<number> | null;
    humanMoveCount?: number;
    /**
     * KataGo humanSLRootExploreProbWeightless / Weightful. Both default to 0, as
     * KataGo's do; its human-bot config sets the weightless one to 0.8.
     */
    humanSlRootExploreProbWeightless?: number;
    humanSlRootExploreProbWeightful?: number;
    /**
     * KataGo ignorePreRootHistory. Defaults to true, as it does for KataGo's
     * analysis engine (Setup::DEFAULT_ANALYSIS_IGNORE_PRE_ROOT_HISTORY).
     */
    ignorePreRootHistory?: boolean;
    /** KataGo enablePassingHacks. Defaults to true, as it does for analysis and GTP. */
    enablePassingHacks?: boolean;
    /** KataGo useGraphSearch. Defaults to true, as it does for everything but distributed. */
    useGraphSearch?: boolean;
    /** KataGo fillDameBeforePass. Only ever bites under territory scoring. */
    fillDameBeforePass?: boolean;
    /**
     * KataGo rootPolicyTemperature: above 1 the root policy is flattened, so the
     * search spreads over more moves. `Early` is the value on move 0, decaying to
     * the other over KataGo's chosenMoveTemperatureHalflife. Both default to 1.
     */
    rootPolicyTemperature?: number;
    rootPolicyTemperatureEarly?: number;
    /** Moves the search may not play at the root, KataGo's avoidMoves. */
    avoidRootMoves?: Uint8Array | null;
  }): Promise<MctsSearch> {
    const outputScaleMultiplier = args.model.postProcessParams?.outputScaleMultiplier ?? 1.0;
    const rootSymmetrySamples = clampRootSymmetrySamples(args.rootSymmetrySamples);
    const rootStones = boardStateToStones(args.board);
    const rootKoPoint = computeKoPointFromPrevious({ board: args.board, previousBoard: args.previousBoard, moveHistory: args.moveHistory });

    const rootPrevStones = args.previousBoard ? boardStateToStones(args.previousBoard) : rootStones;
    const rootPrevKoPoint = computeKoPointAfterMove(
      args.previousPreviousBoard,
      args.moveHistory.length >= 2 ? args.moveHistory[args.moveHistory.length - 2]! : null
    );
    const rootPrevPrevStones = args.previousPreviousBoard ? boardStateToStones(args.previousPreviousBoard) : rootPrevStones;
    const rootPrevPrevKoPoint = -1;

    const rootMoves: RecentMove[] = args.moveHistory.map((m) => ({
      move: m.x < 0 || m.y < 0 ? PASS_MOVE : m.y * BOARD_SIZE + m.x,
      player: m.player,
    }));

    const forcedRootMoves = topHumanMovesMask(args.humanPolicy, args.humanMoveCount ?? DEFAULT_HUMAN_MOVE_COUNT);
    const ignorePreRootHistory = args.ignorePreRootHistory !== false;
    const enablePassingHacks = args.enablePassingHacks ?? ENABLE_PASSING_HACKS;
    const useGraphSearch = args.useGraphSearch ?? USE_GRAPH_SEARCH;
    const fillDameBeforePass = args.fillDameBeforePass ?? FILL_DAME_BEFORE_PASS;
    const rootPolicyTemperature = Math.max(0.01, Math.min(100, args.rootPolicyTemperature ?? 1));
    const rootPolicyTemperatureEarly = Math.max(
      0.01,
      Math.min(100, args.rootPolicyTemperatureEarly ?? rootPolicyTemperature)
    );
    const effectiveRootPolicyTemperature =
      rootPolicyTemperature === 1 && rootPolicyTemperatureEarly === 1
        ? 1
        : interpolateEarly({
            halflife: CHOSEN_MOVE_TEMPERATURE_HALFLIFE,
            earlyValue: rootPolicyTemperatureEarly,
            value: rootPolicyTemperature,
            turnNumber: rootMoves.length,
            boardWidth: BOARD_SIZE,
            boardHeight: BOARD_SIZE,
          });
    const weightlessProb = Math.max(0, Math.min(1, args.humanSlRootExploreProbWeightless ?? 0));
    const weightfulProb = Math.max(0, Math.min(1, args.humanSlRootExploreProbWeightful ?? 0));
    const humanExplore: HumanExploreParams | null =
      args.humanPolicy && weightlessProb + weightfulProb > 0
        ? { policy: Float32Array.from(args.humanPolicy), weightlessProb, weightfulProb }
        : null;
    const rootNode = new Node(playerToColor(args.currentPlayer));
    const {
      rootSymmetries,
      roiMask,
      rootNnWeight,
      rootLibertyMap,
      rootOwnership,
      rootPolicy,
      rootValue,
      rootScoreLead,
      rootScoreMean,
      rootScoreMeanSq,
      rootUtility,
      recentScoreCenter,
      rawWinRate,
      rawScoreLead,
      rawScoreSelfplay,
      rawScoreSelfplayStdev,
      rawNoResultProb,
      rawStWrError,
      rawStScoreError,
    } = await buildRootEval({
      model: args.model,
      ownershipMode: args.ownershipMode,
      rules: args.rules,
      rootSymmetrySamples,
      komi: args.komi,
      currentPlayer: args.currentPlayer,
      conservativePass: args.conservativePass,
      rootStones,
      rootKoPoint,
      rootPrevStones,
      rootPrevKoPoint,
      rootPrevPrevStones,
      rootPrevPrevKoPoint,
      rootMoves,
      maxChildren: args.maxChildren,
      regionOfInterest: args.regionOfInterest,
      rootSymmetryPruning: args.rootSymmetryPruning,
      forcedRootMoves,
      avoidRootMoves: args.avoidRootMoves,
      outputScaleMultiplier,
      ignorePreRootHistory,
      enablePassingHacks,
      rootPolicyTemperature: effectiveRootPolicyTemperature,
      node: rootNode,
    });
    rootNode.ownership = rootOwnership;
    rootNode.visits = 1;
    rootNode.nnValue = rootValue;
    rootNode.nnScoreLead = rootScoreLead;
    rootNode.nnScoreMean = rootScoreMean;
    rootNode.nnScoreMeanSq = rootScoreMeanSq;
    rootNode.nnUtility = rootUtility;
    rootNode.nnWeight = rootNnWeight;
    recomputeNodeStats(rootNode);

    const rootPrevLibertyMap =
      rootPrevStones === rootStones ? rootLibertyMap : computeLibertyMapInto(rootPrevStones, new Uint8Array(BOARD_AREA));

    const rootEndingBonus = computeEndingScoreBonuses({
      stones: rootStones,
      libertyMap: rootLibertyMap,
      koPoint: rootKoPoint,
      ownership: args.ownershipMode === 'none' ? null : rootOwnership,
      currentPlayer: args.currentPlayer,
      rules: args.rules,
    });

    return new MctsSearch({
      model: args.model,
      ownershipMode: args.ownershipMode,
      maxChildren: args.maxChildren,
      currentPlayer: args.currentPlayer,
      komi: args.komi,
      rules: args.rules,
      nnRandomize: args.nnRandomize,
      conservativePass: args.conservativePass,
      wideRootNoise: args.wideRootNoise,
      rootSymmetrySamples,
      rootStones,
      rootKoPoint,
      rootPrevStones,
      rootPrevKoPoint,
      rootMoves,
      rootNode,
      rootLibertyMap,
      rootPrevLibertyMap,
      rootPolicy,
      rootOwnership,
      recentScoreCenter,
      rand: new Rand(),
      outputScaleMultiplier,
      rootSymmetries,
      roiMask,
      rootSymmetryPruning: args.rootSymmetryPruning !== false,
      rootEndingBonus,
      forcedRootMoves,
      humanExplore,
      ignorePreRootHistory,
      enablePassingHacks,
      useGraphSearch,
      fillDameBeforePass,
      rootRaw: {
        winRate: rawWinRate,
        scoreLead: rawScoreLead,
        scoreSelfplay: rawScoreSelfplay,
        scoreSelfplayStdev: rawScoreSelfplayStdev,
        noResultProb: rawNoResultProb,
        stWrError: rawStWrError,
        stScoreError: rawStScoreError,
      },
      rootPolicyTemperature,
      rootPolicyTemperatureEarly,
    });
  }

  async reRootToChild(args: {
    move: number;
    board: BoardState;
    previousBoard?: BoardState;
    previousPreviousBoard?: BoardState;
    currentPlayer: Player;
    moveHistory: Move[];
    komi: number;
    rules: GameRules;
    regionOfInterest?: RegionOfInterest | null;
  }): Promise<boolean> {
    const edges = this.rootNode.edges;
    if (!edges || edges.length === 0) return false;
    const target = edges.find((edge) => edge.move === args.move);
    if (!target?.child) return false;
    const child = target.child;
    if (child.playerToMove !== playerToColor(args.currentPlayer)) return false;

    const rootStones = boardStateToStones(args.board);
    const rootKoPoint = computeKoPointFromPrevious({ board: args.board, previousBoard: args.previousBoard, moveHistory: args.moveHistory });

    const rootPrevStones = args.previousBoard ? boardStateToStones(args.previousBoard) : rootStones;
    const rootPrevKoPoint = computeKoPointAfterMove(
      args.previousPreviousBoard,
      args.moveHistory.length >= 2 ? args.moveHistory[args.moveHistory.length - 2]! : null
    );
    const rootPrevPrevStones = args.previousPreviousBoard ? boardStateToStones(args.previousPreviousBoard) : rootPrevStones;
    const rootPrevPrevKoPoint = -1;

    const rootMoves: RecentMove[] = args.moveHistory.map((m) => ({
      move: m.x < 0 || m.y < 0 ? PASS_MOVE : m.y * BOARD_SIZE + m.x,
      player: m.player,
    }));

    const shouldExpandRoot = !child.edges || child.edges.length === 0;
    const {
      rootSymmetries,
      roiMask,
      rootNnWeight,
      rootLibertyMap,
      rootOwnership,
      rootPolicy,
      rootValue,
      rootScoreLead,
      rootScoreMean,
      rootScoreMeanSq,
      rootUtility,
      recentScoreCenter,
      rawWinRate,
      rawScoreLead,
      rawScoreSelfplay,
      rawScoreSelfplayStdev,
      rawNoResultProb,
      rawStWrError,
      rawStScoreError,
    } = await buildRootEval({
      model: this.model,
      ownershipMode: this.ownershipMode,
      rules: args.rules,
      rootSymmetryPruning: this.rootSymmetryPruning,
      rootSymmetrySamples: this.rootSymmetrySamples,
      komi: args.komi,
      currentPlayer: args.currentPlayer,
      conservativePass: this.conservativePass,
      rootStones,
      rootKoPoint,
      rootPrevStones,
      rootPrevKoPoint,
      rootPrevPrevStones,
      rootPrevPrevKoPoint,
      rootMoves,
      maxChildren: this.maxChildren,
      regionOfInterest: args.regionOfInterest,
      outputScaleMultiplier: this.outputScaleMultiplier,
      ignorePreRootHistory: this.ignorePreRootHistory,
      enablePassingHacks: this.enablePassingHacks,
      rootPolicyTemperature: this.effectiveRootPolicyTemperature(rootMoves.length),
      node: child,
      preserveExistingChildren: !shouldExpandRoot,
    });

    const rootPrevLibertyMap =
      rootPrevStones === rootStones ? rootLibertyMap : computeLibertyMapInto(rootPrevStones, new Uint8Array(BOARD_AREA));

    if (shouldExpandRoot) child.visits = 1;
    child.nnValue = rootValue;
    child.nnScoreLead = rootScoreLead;
    child.nnScoreMean = rootScoreMean;
    child.nnScoreMeanSq = rootScoreMeanSq;
    child.nnUtility = rootUtility;
    child.nnWeight = rootNnWeight;
    recomputeNodeStats(child);
    child.pendingEval = false;
    child.inFlight = 0;
    child.ownership = rootOwnership;

    this.rootNode = child;
    this.rootStones = rootStones;
    this.rootKoPoint = rootKoPoint;
    this.rootPrevStones = rootPrevStones;
    this.rootPrevKoPoint = rootPrevKoPoint;
    this.rootMoves = rootMoves;
    this.rootLibertyMap = rootLibertyMap;
    this.rootPrevLibertyMap = rootPrevLibertyMap;
    this.rootPolicy = rootPolicy;
    this.rootOwnership = rootOwnership;
    this.recentScoreCenter = recentScoreCenter;
    this.currentPlayer = args.currentPlayer;
    this.rootSymmetries = rootSymmetries;
    this.roiMask = roiMask;
    // The human moves belonged to the old root; the caller starts a new search when
    // it wants them for the new position.
    this.forcedRootMoves = null;
    this.humanExplore = null;
    this.rootRaw = {
      winRate: rawWinRate,
      scoreLead: rawScoreLead,
      scoreSelfplay: rawScoreSelfplay,
      scoreSelfplayStdev: rawScoreSelfplayStdev,
      noResultProb: rawNoResultProb,
      stWrError: rawStWrError,
      stScoreError: rawStScoreError,
    };
    this.resetGraphSearchState();
    // Nodes outside the new root's subtree are gone, and their contributions to the
    // bias table would linger, so start the table over (KataGo decays them instead).
    this.subtreeBiasTable.reset();
    this.rootEndingBonus = computeEndingScoreBonuses({
      stones: rootStones,
      libertyMap: rootLibertyMap,
      koPoint: rootKoPoint,
      ownership: this.ownershipMode === 'none' ? null : rootOwnership,
      currentPlayer: args.currentPlayer,
      rules: args.rules,
    });
    this.treeOwnershipCache = null;

    return true;
  }

  async run(args: {
    visits: number;
    maxTimeMs: number;
    batchSize: number;
    shouldAbort?: () => boolean;
  }): Promise<boolean> {
    const maxVisits = Math.max(16, Math.min(args.visits, ENGINE_MAX_VISITS));
    const maxTimeMs = Math.max(25, Math.min(args.maxTimeMs, ENGINE_MAX_TIME_MS));
    const batchSize = Math.max(1, Math.min(args.batchSize, 64));
    const shouldAbort = args.shouldAbort;

    if (shouldAbort?.()) return true;
    if (this.rootNode.visits >= maxVisits) return shouldAbort?.() ?? false;

    const neededBoardCapacity = batchSize * BOARD_AREA;
    if (this.jobStonesScratch.length < neededBoardCapacity) this.jobStonesScratch = new Uint8Array(neededBoardCapacity);
    if (this.jobPrevStonesScratch.length < neededBoardCapacity) this.jobPrevStonesScratch = new Uint8Array(neededBoardCapacity);
    if (this.jobPrevPrevStonesScratch.length < neededBoardCapacity) this.jobPrevPrevStonesScratch = new Uint8Array(neededBoardCapacity);
    if (this.jobLibertyMapScratch.length < neededBoardCapacity) this.jobLibertyMapScratch = new Uint8Array(neededBoardCapacity);
    if (this.jobPrevLibertyMapScratch.length < neededBoardCapacity) this.jobPrevLibertyMapScratch = new Uint8Array(neededBoardCapacity);
    if (this.jobPrevPrevLibertyMapScratch.length < neededBoardCapacity)
      this.jobPrevPrevLibertyMapScratch = new Uint8Array(neededBoardCapacity);

    const sim: SimPosition = { stones: this.rootStones.slice(), koPoint: this.rootKoPoint };
    const captureStack: number[] = [];
    const undoMoves: number[] = [];
    const undoPlayers: StoneColor[] = [];
    const undoSnapshots: UndoSnapshot[] = [];
    const pathMoves: RecentMove[] = [];
    const libertyMapStack = this.libertyMapStack;
    libertyMapStack[0] = this.rootLibertyMap;
    const libertySeedsScratch = this.libertySeedsScratch;

    const deadline = getAnimationNow() + maxTimeMs;
    let timeCheckCounter = 0;
    const timeCheckMask = 0x1f;
    const timeExceeded = (): boolean => {
      if ((timeCheckCounter++ & timeCheckMask) !== 0) return false;
      return getAnimationNow() >= deadline;
    };

    // A weightless playout never credits the root, so a search that spends many of
    // them can want far more playouts than visits. KataGo bounds that with
    // maxPlayouts; in a browser we always want some bound, so here is one.
    let playouts = 0;
    const maxPlayouts = maxVisits * 8;

    while (this.rootNode.visits < maxVisits && playouts < maxPlayouts && !timeExceeded()) {
      if (shouldAbort?.()) return true;
      const visitsBeforeBatch = this.rootNode.visits;
      // Weightless playouts do not raise the root's visit count, so they must not
      // count against the batch's estimate of how close the limit is.
      let weightlessJobs = 0;
      const jobs: Array<{
        leaf: Node;
        path: Node[];
        edgePath: Edge[];
        weightlessFrom: number;
        stones: Uint8Array;
        koPoint: number;
        libertyMap: Uint8Array;
        prevStones: Uint8Array;
        prevKoPoint: number;
        prevLibertyMap?: Uint8Array;
        prevPrevStones: Uint8Array;
        prevPrevKoPoint: number;
        prevPrevLibertyMap?: Uint8Array;
        currentPlayer: Player;
        recentMoves: RecentMove[];
        maxHistory: number;
        enablePassingHacks: boolean;
      }> = [];

      let attempts = 0;
      while (
        jobs.length < batchSize &&
        this.rootNode.visits + jobs.length - weightlessJobs < maxVisits &&
        !timeExceeded()
      ) {
        if (shouldAbort?.()) break;
        attempts++;
        if (attempts > batchSize * 8) break;

        undoMoves.length = 0;
        undoPlayers.length = 0;
        undoSnapshots.length = 0;
        pathMoves.length = 0;
        sim.stones.set(this.rootStones);
        sim.koPoint = this.rootKoPoint;
        libertyMapStack[0] = this.rootLibertyMap;
        let depth = 0;

        const path: Node[] = [this.rootNode];
        const edgePath: Edge[] = [];
        let parentGraphH0 = this.rootGraphHash[0]!;
        let parentGraphH1 = this.rootGraphHash[1]!;
        let consecutivePasses = this.rootConsecutivePasses;
        // The path index at which a weightless playout began, or -1. KataGo's
        // countEdgeVisit=false means that edge and every edge above it goes unpaid,
        // so nothing at or above this index is credited with the playout.
        let weightlessFrom = -1;
        let caughtUpEdgeVisits = false;
        let node = this.rootNode;
        let player = this.rootNode.playerToMove;

        while (node.edges && node.edges.length > 0 && depth < MAX_DESCENT_DEPTH) {
          const isRootNode = node === this.rootNode;
          const selection = selectEdge(
            node,
            isRootNode,
            this.wideRootNoise,
            this.rand,
            this.rootEndingBonus,
            this.recentScoreCenter,
            this.forcedRootMoves,
            isRootNode ? this.humanExplore : null
          );
          let e = selection.edge;
          let countEdgeVisit = selection.countEdgeVisit;

          // KataGo enableMorePassingHacks: once a pass would end the game, make sure
          // the search has looked at both passing and not passing, without letting
          // that look cost the node any weight.
          if (
            ENABLE_MORE_PASSING_HACKS &&
            weightlessFrom < 0 &&
            (node !== this.rootNode || this.roiMask === null)
          ) {
            const lastMove =
              pathMoves.length > 0
                ? pathMoves[pathMoves.length - 1]!.move
                : this.rootMoves.length > 0
                  ? this.rootMoves[this.rootMoves.length - 1]!.move
                  : null;
            if (lastMove === PASS_MOVE) {
              let totalChildEdgeVisits = 0;
              let passEdge: Edge | null = null;
              let hasPassChild = false;
              let hasNonPassChild = false;
              let bestNewNonPass: Edge | null = null;
              for (const x of node.edges) {
                if (x.move === PASS_MOVE) passEdge = x;
                if (!x.child) {
                  if (x.move !== PASS_MOVE && (!bestNewNonPass || x.prior > bestNewNonPass.prior)) {
                    bestNewNonPass = x;
                  }
                  continue;
                }
                totalChildEdgeVisits += x.visits;
                if (x.move === PASS_MOVE) hasPassChild = true;
                else hasNonPassChild = true;
              }
              if (totalChildEdgeVisits >= 2) {
                if (!hasPassChild && passEdge && e.move !== PASS_MOVE) {
                  e = passEdge;
                  countEdgeVisit = false;
                } else if (!hasNonPassChild && e.move === PASS_MOVE && bestNewNonPass) {
                  e = bestNewNonPass;
                  countEdgeVisit = false;
                }
              }
            }
          }

          // KataGo maybeCatchUpEdgeVisits: an edge whose child has been visited more
          // often than the edge was paid for can simply pay one back, which is a
          // whole playout without a network call.
          if (countEdgeVisit && e.child && e.visits < e.child.visits) {
            e.visits += 1;
            for (let i = path.length - 1; i >= 0; i--) {
              const n = path[i]!;
              n.visits += 1;
              recomputeNodeStats(n);
            }
            for (const pe of edgePath) pe.visits += 1;
            caughtUpEdgeVisits = true;
            break;
          }

          if (!countEdgeVisit) weightlessFrom = path.length - 1;
          edgePath.push(e);
          const move = e.move;

          // The bias key describes the position BEFORE the move, so build it while
          // the simulated board still shows that position.
          const existingChild = e.child;
          const needsBiasKey =
            SUBTREE_VALUE_BIAS_FACTOR !== 0 &&
            (!existingChild || existingChild.biasEpoch !== this.subtreeBiasTable.epoch);
          const biasKey = needsBiasKey
            ? buildSubtreeBiasKey({
                stones: sim.stones,
                libertyMap: libertyMapStack[depth] ?? this.rootLibertyMap,
                move,
                parentMove: pathMoves.length > 0 ? pathMoves[pathMoves.length - 1]!.move : PASS_MOVE,
                koPoint: sim.koPoint,
                pla: player,
              })
            : null;

          const snapshot = playMove(sim, move, player, captureStack);
          undoMoves.push(move);
          undoPlayers.push(player);
          undoSnapshots.push(snapshot);
          const prevLibertyMap = libertyMapStack[depth] ?? this.rootLibertyMap;
          let nextLibertyMap = libertyMapStack[depth + 1];
          if (!nextLibertyMap) nextLibertyMap = new Uint8Array(BOARD_AREA);
          nextLibertyMap.set(prevLibertyMap);
          const seedCount = buildLibertySeeds({
            move,
            captureStack,
            captureStart: snapshot.captureStart,
            out: libertySeedsScratch,
          });
          if (seedCount > 0) {
            updateLibertyMapForSeeds(sim.stones, libertySeedsScratch, seedCount, nextLibertyMap);
          }
          libertyMapStack[depth + 1] = nextLibertyMap;
          depth++;
          const pathIdx = pathMoves.length;
          const pathPlayer = colorToPlayer(player);
          let pathEntry = pathMoves[pathIdx];
          if (!pathEntry) {
            pathEntry = { move, player: pathPlayer };
            pathMoves[pathIdx] = pathEntry;
          } else {
            pathEntry.move = move;
            pathEntry.player = pathPlayer;
          }
          pathMoves.length = pathIdx + 1;

          // Two passes in a row end the game. Under area scoring the result is then
          // a matter of counting, so the node gets the real score instead of another
          // network guess (KataGo scores such a node as terminal).
          // pathMoves already holds the move just played, so the one before it is
          // either its predecessor on this path or, at the first ply, the last move
          // of the game so far.
          const previousMove =
            pathMoves.length >= 2
              ? pathMoves[pathMoves.length - 2]!.move
              : this.rootMoves.length > 0
                ? this.rootMoves[this.rootMoves.length - 1]!.move
                : null;
          const endsGame = this.scoreTerminalNodes && move === PASS_MOVE && previousMove === PASS_MOVE;

          const childPlayer = opponentOf(player);
          consecutivePasses = move === PASS_MOVE ? consecutivePasses + 1 : 0;
          let childGraphH0 = 0;
          let childGraphH1 = 0;
          if (this.useGraphSearch) {
            const scratch = this.graphHashScratch;
            computeStateHash(sim.stones, sim.koPoint, childPlayer, consecutivePasses, scratch);
            // KataGo only lets a position stand for itself when no short repetition
            // could come back through the move that made it; otherwise the path's
            // own hash goes in too, and only the identical path matches.
            if (!simpleRepetitionBoundGt(sim.stones, move, GRAPH_SEARCH_REP_BOUND)) {
              mixGraphHash(parentGraphH0, parentGraphH1, scratch[0]!, scratch[1]!, scratch);
            }
            childGraphH0 = scratch[0]!;
            childGraphH1 = scratch[1]!;
          }

          if (!e.child) {
            let attached: Node | null = null;
            if (this.useGraphSearch) {
              const key = packHashKey(childGraphH0, childGraphH1);
              const existing = this.transpositionTable.get(key);
              // An ancestor would close a cycle, which the repetition bound is
              // meant to rule out, but it costs one scan to be certain.
              if (existing && existing.playerToMove === childPlayer && !path.includes(existing)) {
                attached = existing;
                this.transpositionHits++;
              }
              if (!attached) {
                attached = new Node(childPlayer);
                this.transpositionTable.set(key, attached);
              }
            } else {
              attached = new Node(childPlayer);
            }
            e.child = attached;
          }
          if (biasKey !== null && e.child.biasEpoch !== this.subtreeBiasTable.epoch) {
            e.child.biasEntry = this.subtreeBiasTable.get(biasKey);
            e.child.biasEpoch = this.subtreeBiasTable.epoch;
            e.child.lastBiasDeltaSum = 0;
            e.child.lastBiasWeight = 0;
          }
          parentGraphH0 = childGraphH0;
          parentGraphH1 = childGraphH1;
          node = e.child;
          player = node.playerToMove;
          path.push(node);

          if (endsGame && !node.isTerminal && !node.edges) {
            setNodeTerminalEval(node, {
              stones: sim.stones,
              komi: this.komi,
              recentScoreCenter: this.recentScoreCenter,
            });
          }

          if (!node.edges) break;
        }

        // The playout was spent paying an edge back its visits, so nothing else
        // is owed: unwind and start the next one.
        if (caughtUpEdgeVisits) {
          playouts++;
          for (let i = undoMoves.length - 1; i >= 0; i--) {
            undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
          }
          continue;
        }

        // The descent ran into its depth floor without reaching a leaf. Nothing
        // should get here; abandoning the playout beats re-evaluating a node that
        // already has children.
        if (node.edges && node.edges.length > 0) {
          for (let i = undoMoves.length - 1; i >= 0; i--) {
            undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
          }
          continue;
        }

        // A finished game needs no evaluation: count the visit and unwind.
        if (node.isTerminal) {
          playouts++;
          for (let i = path.length - 1; i >= 0; i--) {
            if (i <= weightlessFrom) break;
            const n = path[i]!;
            n.visits += 1;
            recomputeNodeStats(n);
          }
          for (let i = edgePath.length - 1; i > weightlessFrom; i--) edgePath[i]!.visits += 1;
          for (let i = undoMoves.length - 1; i >= 0; i--) {
            undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
          }
          continue;
        }

        if (node.pendingEval) {
          for (let i = undoMoves.length - 1; i >= 0; i--) {
            undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
          }
          continue;
        }

        node.pendingEval = true;
        for (const n of path) n.inFlight++;

        const jobIdx = jobs.length;
        const leafStones = this.jobStonesScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
        leafStones.set(sim.stones);
        const leafKoPoint = sim.koPoint;
        let prevStones = leafStones;
        let prevKoPoint = leafKoPoint;
        let prevPrevStones = leafStones;
        let prevPrevKoPoint = leafKoPoint;
        const leafPlayer = colorToPlayer(player);
        const leafDepth = depth;
        const leafLibertyMap = libertyMapStack[leafDepth] ?? this.rootLibertyMap;
        const leafLibertyBuf = this.jobLibertyMapScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
        leafLibertyBuf.set(leafLibertyMap);
        let prevLibertyMap: Uint8Array | undefined;
        let prevPrevLibertyMap: Uint8Array | undefined;
        if (leafDepth >= 1) {
          const prevLiberty = libertyMapStack[leafDepth - 1] ?? this.rootLibertyMap;
          const prevLibertyBuf = this.jobPrevLibertyMapScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
          prevLibertyBuf.set(prevLiberty);
          prevLibertyMap = prevLibertyBuf;
          if (leafDepth >= 2) {
            const prevPrevLiberty = libertyMapStack[leafDepth - 2];
            if (prevPrevLiberty) {
              const prevPrevLibertyBuf = this.jobPrevPrevLibertyMapScratch.subarray(
                jobIdx * BOARD_AREA,
                (jobIdx + 1) * BOARD_AREA
              );
              prevPrevLibertyBuf.set(prevPrevLiberty);
              prevPrevLibertyMap = prevPrevLibertyBuf;
            }
          } else {
            const prevPrevLibertyBuf = this.jobPrevPrevLibertyMapScratch.subarray(
              jobIdx * BOARD_AREA,
              (jobIdx + 1) * BOARD_AREA
            );
            prevPrevLibertyBuf.set(this.rootPrevLibertyMap);
            prevPrevLibertyMap = prevPrevLibertyBuf;
          }
        }

        if (undoMoves.length >= 1) {
          const lastIdx = undoMoves.length - 1;
          undoMove(sim, undoMoves[lastIdx]!, undoPlayers[lastIdx]!, undoSnapshots[lastIdx]!, captureStack);

          if (lastIdx === 0) {
            // Leaf is a child of the root: prev state is the root, and prev-prev is the pre-root position.
            prevStones = this.rootStones;
            prevKoPoint = this.rootKoPoint;
            prevPrevStones = this.rootPrevStones;
            prevPrevKoPoint = this.rootPrevKoPoint;
          } else {
            const prevBuf = this.jobPrevStonesScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
            prevBuf.set(sim.stones);
            prevStones = prevBuf;
            prevKoPoint = sim.koPoint;

            const secondIdx = undoMoves.length - 2;
            undoMove(sim, undoMoves[secondIdx]!, undoPlayers[secondIdx]!, undoSnapshots[secondIdx]!, captureStack);

            if (secondIdx === 0) {
              // Leaf is depth 2: prev-prev is the root.
              prevPrevStones = this.rootStones;
              prevPrevKoPoint = this.rootKoPoint;
            } else {
              const prevPrevBuf = this.jobPrevPrevStonesScratch.subarray(jobIdx * BOARD_AREA, (jobIdx + 1) * BOARD_AREA);
              prevPrevBuf.set(sim.stones);
              prevPrevStones = prevPrevBuf;
              prevPrevKoPoint = sim.koPoint;
            }

            for (let i = secondIdx - 1; i >= 0; i--) {
              undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
            }
          }
        }

        const recentMovesScratch = this.jobRecentMovesScratch[jobIdx] ?? (this.jobRecentMovesScratch[jobIdx] = []);
        playouts++;
        if (weightlessFrom >= 0) weightlessJobs++;
        jobs.push({
          leaf: node,
          path,
          edgePath,
          weightlessFrom,
          stones: leafStones,
          koPoint: leafKoPoint,
          libertyMap: leafLibertyBuf,
          prevStones,
          prevKoPoint,
          prevLibertyMap,
          prevPrevStones,
          prevPrevKoPoint,
          prevPrevLibertyMap,
          currentPlayer: leafPlayer,
          recentMoves: takeRecentMoves(this.rootMoves, pathMoves, 5, recentMovesScratch),
          // With pre-root history ignored, only the moves the search itself played
          // reach the history planes: KataGo's maxHistory of depth-below-the-root.
          maxHistory: this.ignorePreRootHistory ? pathMoves.length : 5,
          enablePassingHacks: this.enablePassingHacks,
        });
      }

      if (jobs.length === 0) {
        // A batch can come back empty because every playout ended in a finished
        // game, which needs no evaluation. That is progress, so keep going; only
        // a batch that achieved nothing at all means the search is stuck.
        if (this.rootNode.visits > visitsBeforeBatch) continue;
        break;
      }

      const includeOwnership = this.ownershipMode === 'tree';
      const evals = await evaluateBatch({
        model: this.model,
        includeOwnership,
        rules: this.rules,
        nnRandomize: this.nnRandomize,
        policyOptimism: POLICY_OPTIMISM,
        komi: this.komi,
        states: jobs,
      });
      timeCheckCounter = 0;

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]!;
        const ev = evals[i]!;

        if (includeOwnership) {
          if (!ev.ownership) throw new Error('Missing ownership output');
          const ownershipSign = job.currentPlayer === 'black' ? 1 : -1;
          const own = new Float32Array(BOARD_AREA);
          const sym = ev.symmetry;
          const symOff = sym * BOARD_AREA;
          const symPosMap = sym === 0 ? null : getSymPosMap();
          for (let p = 0; p < BOARD_AREA; p++) {
            const symPos = sym === 0 ? p : symPosMap![symOff + p]!;
            own[p] = ownershipSign * Math.tanh(ev.ownership[symPos]! * this.outputScaleMultiplier);
          }
          job.leaf.ownership = own;
        }

        expandNode({
          node: job.leaf,
          stones: job.stones,
          koPoint: job.koPoint,
          policyLogits: ev.policy,
          policyLogitsSymmetry: ev.symmetry,
          passLogit: ev.passLogit,
          maxChildren: this.maxChildren,
          libertyMap: ev.libertyMap,
          policyOutputScaling: this.outputScaleMultiplier,
        });

        setNodeOwnEval(job.leaf, ev, this.recentScoreCenter);
        // KataGo recomputes each node on the path from its children after every
        // playout, deepest first, because the reweighting depends on the siblings.
        // A weightless playout stops crediting at the node that asked for it.
        for (let i = job.path.length - 1; i >= 0; i--) {
          const n = job.path[i]!;
          n.inFlight -= 1;
          if (i <= job.weightlessFrom) continue;
          n.visits += 1;
          if (n !== job.leaf) recomputeNodeStats(n);
        }
        for (let i = job.edgePath.length - 1; i > job.weightlessFrom; i--) job.edgePath[i]!.visits += 1;
        job.leaf.pendingEval = false;
      }
      if (shouldAbort?.()) return true;
    }
    return shouldAbort?.() ?? false;
  }

  getAnalysis(args: {
    topK: number;
    analysisPvLen: number;
    includeMovesOwnership?: boolean;
    cloneBuffers?: boolean;
    ownershipRefreshIntervalMs?: number;
  }): {
    rootWinRate: number;
    rootScoreLead: number;
    rootScoreSelfplay: number;
    rootScoreStdev: number;
    rootVisits: number;
    /** What the network alone said about the root, before any search. */
    rawWinRate: number;
    rawScoreLead: number;
    rawScoreSelfplay: number;
    rawScoreSelfplayStdev: number;
    rawNoResultProb: number;
    /** -1 when the net is older than model version 10 and does not predict them. */
    rawStWrError: number;
    rawStScoreError: number;
    ownership: FloatArray;
    ownershipStdev: FloatArray;
    policy: FloatArray;
    // Filled in by the worker when a human SL profile was requested.
    humanPolicy?: FloatArray;
    moves: AnalysisPayloadMove[];
  } {
    const topK = Math.max(1, Math.min(args.topK, 50));
    const includeMovesOwnership = args.includeMovesOwnership === true;
    const cloneBuffers = args.cloneBuffers !== false;
    const analysisPvLen = Math.max(0, Math.min(args.analysisPvLen, 60));
    const pvDepth = 1 + analysisPvLen;

    const rows = collectRootCandidateRows(
      this.rootNode,
      this.rootEndingBonus,
      this.recentScoreCenter,
      this.shouldSuppressPass()
    );

    const rootStats = rootNodeStats(this.rootNode);
    const rootWinRate = rootStats.rootWinRate;
    const rootScoreLead = rootStats.rootScoreLead;
    const rootScoreSelfplay = rootStats.rootScoreSelfplay;
    const rootScoreStdev = rootStats.rootScoreStdev;

    const moves = buildAnalysisMoves({
      rows,
      topK,
      pvDepth,
      currentPlayer: this.currentPlayer,
      rootWinRate,
      rootScoreLead,
      includeMovesOwnership,
      cloneBuffers,
      rootSymmetries: this.rootSymmetries,
      roiMask: this.roiMask,
    });

    let ownership: Float32Array;
    let ownershipStdev: Float32Array;
    if (this.ownershipMode === 'tree') {
      const visits = this.rootNode.visits;
      let cached = this.treeOwnershipCache;
      const refreshIntervalMs = args.ownershipRefreshIntervalMs ?? 0;
      const now = getAnimationNow();
      if (!cached) {
        cached = { visits, timestamp: now, ...averageTreeOwnership(this.rootNode) };
        this.treeOwnershipCache = cached;
      } else if (cached.visits !== visits && (refreshIntervalMs <= 0 || now - cached.timestamp >= refreshIntervalMs)) {
        cached = { visits, timestamp: now, ...averageTreeOwnership(this.rootNode) };
        this.treeOwnershipCache = cached;
      }
      ownership = cloneBuffers ? new Float32Array(cached.ownership) : cached.ownership;
      ownershipStdev = cloneBuffers ? new Float32Array(cached.ownershipStdev) : cached.ownershipStdev;
    } else {
      ownership = cloneBuffers ? new Float32Array(this.rootOwnership) : this.rootOwnership;
      ownershipStdev = new Float32Array(BOARD_AREA);
    }
    const policyOut = cloneBuffers ? new Float32Array(this.rootPolicy) : this.rootPolicy;

    return {
      rootWinRate,
      rootScoreLead,
      rootScoreSelfplay,
      rootScoreStdev,
      rootVisits: this.rootNode.visits,
      rawWinRate: this.rootRaw.winRate,
      rawScoreLead: this.rootRaw.scoreLead,
      rawScoreSelfplay: this.rootRaw.scoreSelfplay,
      rawScoreSelfplayStdev: this.rootRaw.scoreSelfplayStdev,
      rawNoResultProb: this.rootRaw.noResultProb,
      rawStWrError: this.rootRaw.stWrError,
      rawStScoreError: this.rootRaw.stScoreError,
      ownership,
      ownershipStdev,
      policy: policyOut,
      moves,
    };
  }
}

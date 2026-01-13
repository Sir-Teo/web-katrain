import * as tf from '@tensorflow/tfjs';
import type { BoardState, FloatArray, GameRules, Move, Player } from '../../types';
import { postprocessKataGoV8 } from './evalV8';
import type { KataGoModelV8Tf } from './modelV8';
import { expectedWhiteScoreValue, SQRT_BOARD_AREA } from './scoreValue';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from './limits';
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
  computeLibertyMap,
  computeLibertyMapInto,
  type SimPosition,
  type StoneColor,
  type UndoSnapshot,
} from './fastBoard';
import { fillInputsV7Fast, type RecentMove } from './featuresV7Fast';
import { POLICY_OPTIMISM, ROOT_POLICY_OPTIMISM } from './searchParams';

export type OwnershipMode = 'root' | 'tree';

type Edge = {
  move: number; // 0..360 or PASS_MOVE
  prior: number;
  child: Node | null;
};

type ExpandScratch = {
  moves: Int16Array;
  logits: Float32Array;
  priors: Float64Array;
  topMoves: Int16Array;
  topPriors: Float64Array;
  order: number[];
};

// Reuse buffers in the tight expansion loop to reduce GC churn.
const EXPAND_SCRATCH: ExpandScratch = {
  moves: new Int16Array(BOARD_AREA),
  logits: new Float32Array(BOARD_AREA),
  priors: new Float64Array(BOARD_AREA),
  topMoves: new Int16Array(BOARD_AREA),
  topPriors: new Float64Array(BOARD_AREA),
  order: [],
};

class Node {
  readonly playerToMove: StoneColor;
  visits = 0;
  valueSum = 0; // [-1,1] where +1 is black win
  scoreLeadSum = 0; // black lead
  scoreMeanSum = 0; // black score mean
  scoreMeanSqSum = 0; // sum of (stdev^2 + mean^2) for mixture stdev
  utilitySum = 0; // from black perspective
  utilitySqSum = 0; // from black perspective
  nnUtility: number | null = null; // direct NN eval utility, from black perspective
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

function takeRecentMoves(rootMoves: RecentMove[], pathMoves: RecentMove[], max: number): RecentMove[] {
  const out: RecentMove[] = [];
  for (let i = pathMoves.length - 1; i >= 0 && out.length < max; i--) out.push(pathMoves[i]!);
  for (let i = rootMoves.length - 1; i >= 0 && out.length < max; i--) out.push(rootMoves[i]!);
  out.reverse();
  return out;
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
  policyOut?: Float32Array; // len 362, illegal = -1, pass at index 361
  policyOutputScaling?: number;
}): void {
  const { node, stones, koPoint, policyLogits, passLogit, maxChildren } = args;
  const policyScale = args.policyOutputScaling ?? 1.0;
  const pla = node.playerToMove;
  const opp = opponentOf(pla);
  const sym = args.policyLogitsSymmetry ?? 0;
  const symOff = sym * BOARD_AREA;

  const libs = args.libertyMap ?? computeLibertyMap(stones);

  const scratch = EXPAND_SCRATCH;
  const movesScratch = scratch.moves;
  const logitsScratch = scratch.logits;
  const priorsScratch = scratch.priors;
  let moveCount = 0;
  const passLogitScaled = passLogit * policyScale;
  let maxLogit = passLogitScaled;
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
    }

    if (!hasEmptyNeighbor) {
      for (let i = 0; i < nCount; i++) {
        const n = NEIGHBOR_LIST[nStart + i]!;
        const c = stones[n] as StoneColor;
        if (c === opp && libs[n] === 1) {
          captures = true;
          break;
        }
      }
      if (!captures) {
        for (let i = 0; i < nCount; i++) {
          const n = NEIGHBOR_LIST[nStart + i]!;
          const c = stones[n] as StoneColor;
          if (c === pla && libs[n] > 1) {
            connectsToSafeGroup = true;
            break;
          }
        }
      }
    }

    if (!hasEmptyNeighbor && !captures && !connectsToSafeGroup) continue;
    const symPos = sym === 0 ? p : SYM_POS_MAP[symOff + p]!;
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
  const passPrior = passPriorRaw * invSum;

  if (args.policyOut) {
    const out = args.policyOut;
    out.fill(-1);
    for (let i = 0; i < moveCount; i++) out[movesScratch[i]!] = priorsScratch[i]! as number;
    out[PASS_MOVE] = passPrior as number;
  }

  const topMoves = scratch.topMoves;
  const topPriors = scratch.topPriors;
  const maxKids = Math.max(0, maxChildren);
  let topCount = 0;
  let minIdx = 0;
  for (let i = 0; i < moveCount; i++) {
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

  const edges: Edge[] = new Array(topCount + 1);
  let edgeIdx = 0;
  for (let i = 0; i < order.length; i++) {
    const idx = order[i]!;
    edges[edgeIdx++] = { move: topMoves[idx]!, prior: topPriors[idx]!, child: null };
  }
  edges[edgeIdx++] = { move: PASS_MOVE, prior: passPrior, child: null };

  node.edges = edges;
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
  const cap = SQRT_BOARD_AREA * DYNAMIC_SCORE_CENTER_SCALE;
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
  const blackLossProb = 1.0 - args.blackWinProb - args.blackNoResultProb;
  const whiteWinLossValue = blackLossProb - args.blackWinProb;
  const whiteScoreMean = -args.blackScoreMean;
  const whiteScoreStdev = args.blackScoreStdev;

  const staticScoreValue = expectedWhiteScoreValue({
    whiteScoreMean,
    whiteScoreStdev,
    center: 0.0,
    scale: 2.0,
    sqrtBoardArea: SQRT_BOARD_AREA,
  });

  const dynamicScoreValue =
    DYNAMIC_SCORE_UTILITY_FACTOR === 0.0
      ? 0.0
      : expectedWhiteScoreValue({
          whiteScoreMean,
          whiteScoreStdev,
          center: args.recentScoreCenter,
          scale: DYNAMIC_SCORE_CENTER_SCALE,
          sqrtBoardArea: SQRT_BOARD_AREA,
        });

  const whiteUtility =
    whiteWinLossValue * WIN_LOSS_UTILITY_FACTOR +
    args.blackNoResultProb * NO_RESULT_UTILITY_FOR_WHITE +
    staticScoreValue * STATIC_SCORE_UTILITY_FACTOR +
    dynamicScoreValue * DYNAMIC_SCORE_UTILITY_FACTOR;

  return -whiteUtility;
}

const VALUE_WEIGHT_EXPONENT = 0.25;
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
};

type RootSelfStats = {
  value: number;
  scoreLead: number;
  scoreMean: number;
  scoreMeanSq: number;
  utility: number;
  weight: number;
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

function computeWeightedRootStats(args: { children: ChildWeightStats[]; rootSelf: RootSelfStats }): {
  rootValue: number;
  rootWinRate: number;
  rootScoreLead: number;
  rootScoreSelfplay: number;
  rootScoreStdev: number;
} {
  const stats = args.children;
  if (stats.length === 0) {
    const rootValue = args.rootSelf.value;
    const rootScoreSelfplay = args.rootSelf.scoreMean;
    const rootScoreMeanSq = args.rootSelf.scoreMeanSq;
    const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));
    return {
      rootValue,
      rootWinRate: (rootValue + 1) * 0.5,
      rootScoreLead: args.rootSelf.scoreLead,
      rootScoreSelfplay,
      rootScoreStdev,
    };
  }

  let totalWeight = 0;
  for (const s of stats) totalWeight += s.weightAdjusted;
  if (USE_NOISE_PRUNING) totalWeight = pruneNoiseWeight(stats);

  downweightBadChildrenAndNormalizeWeight({
    stats,
    currentTotalWeight: totalWeight,
    desiredTotalWeight: totalWeight,
    amountToSubtract: 0,
    amountToPrune: 0,
  });

  let weightSum = 0;
  let valueSum = 0;
  let scoreMeanSum = 0;
  let scoreMeanSqSum = 0;
  let scoreLeadSum = 0;

  for (const s of stats) {
    if (s.weightAdjusted <= 0) continue;
    weightSum += s.weightAdjusted;
    valueSum += s.weightAdjusted * s.value;
    scoreMeanSum += s.weightAdjusted * s.scoreMean;
    scoreMeanSqSum += s.weightAdjusted * s.scoreMeanSq;
    scoreLeadSum += s.weightAdjusted * s.scoreLead;
  }

  weightSum += args.rootSelf.weight;
  valueSum += args.rootSelf.weight * args.rootSelf.value;
  scoreMeanSum += args.rootSelf.weight * args.rootSelf.scoreMean;
  scoreMeanSqSum += args.rootSelf.weight * args.rootSelf.scoreMeanSq;
  scoreLeadSum += args.rootSelf.weight * args.rootSelf.scoreLead;

  if (weightSum <= 0) {
    const rootValue = args.rootSelf.value;
    const rootScoreSelfplay = args.rootSelf.scoreMean;
    const rootScoreMeanSq = args.rootSelf.scoreMeanSq;
    const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));
    return {
      rootValue,
      rootWinRate: (rootValue + 1) * 0.5,
      rootScoreLead: args.rootSelf.scoreLead,
      rootScoreSelfplay,
      rootScoreStdev,
    };
  }

  const rootValue = valueSum / weightSum;
  const rootScoreSelfplay = scoreMeanSum / weightSum;
  const rootScoreMeanSq = scoreMeanSqSum / weightSum;
  const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));
  return {
    rootValue,
    rootWinRate: (rootValue + 1) * 0.5,
    rootScoreLead: scoreLeadSum / weightSum,
    rootScoreSelfplay,
    rootScoreStdev,
  };
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

    let childrenWeightSum = 0;
    let relativeChildrenWeightSum = 0;
    const childWeights: number[] = [];
    const childNodes: Node[] = [];

    for (const e of edges) {
      const child = e.child;
      if (!child || child.visits <= 0) continue;
      const w = child.visits;
      childWeights.push(w);
      childNodes.push(child);
      childrenWeightSum += w;
      relativeChildrenWeightSum += w * w;
    }

    const parentNNWeight = 1.0;
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

class Rand {
  private spare: number | null = null;

  nextBool(p: number): boolean {
    return Math.random() < p;
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

function selectEdge(node: Node, isRoot: boolean, wideRootNoise: number, rand: Rand): Edge {
  const edges = node.edges;
  if (!edges || edges.length === 0) throw new Error('selectEdge called on unexpanded node');

  const pla = node.playerToMove;
  const sign = pla === BLACK ? 1 : -1;

  let totalChildWeight = 0;
  let policyProbMassVisited = 0;

  for (const e of edges) {
    const child = e.child;
    if (!child) continue;
    const w = child.visits + child.inFlight;
    if (w <= 0) continue;
    totalChildWeight += w;
    policyProbMassVisited += e.prior;
  }

  const visits = node.visits;
  const weightSum = visits;
  const parentUtility = visits > 0 ? node.utilitySum / visits : 0;
  const parentUtilitySqAvg = visits > 0 ? node.utilitySqSum / visits : parentUtility * parentUtility;

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

  const scaling = exploreScaling(totalChildWeight, parentUtilityStdevFactor);

  let bestEdge = edges[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;

  const applyWideRootNoise = isRoot && wideRootNoise > 0;
  const wideRootNoisePolicyExponent = applyWideRootNoise ? 1.0 / (4.0 * wideRootNoise + 1.0) : 1.0;

  for (const e of edges) {
    const child = e.child;
    const childWeight = child ? child.visits + child.inFlight : 0;
    let childUtility = child && child.visits > 0 ? child.utilitySum / child.visits : fpuValue;
    let prior = e.prior;

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

  return bestEdge;
}

function moveToGtp(move: number): string {
  if (move === PASS_MOVE) return 'pass';
  const x = move % BOARD_SIZE;
  const y = (move / BOARD_SIZE) | 0;
  const col = x >= 8 ? x + 1 : x; // Skip 'I'
  const letter = String.fromCharCode(65 + col);
  return `${letter}${BOARD_SIZE - y}`;
}

function buildPv(edge: Edge, maxDepth: number): string[] {
  const pvMoves: number[] = [edge.move];
  let node = edge.child;
  let depth = 1;

  while (node && node.edges && node.edges.length > 0 && depth < maxDepth) {
    let best: Edge | null = null;
    let bestVisits = 0;
    for (const e of node.edges) {
      const v = e.child ? e.child.visits : 0;
      if (v > bestVisits) {
        bestVisits = v;
        best = e;
      }
    }
    if (!best || bestVisits <= 0) break;
    pvMoves.push(best.move);
    node = best.child;
    depth++;
  }

  return pvMoves.map(moveToGtp);
}

const NUM_SYMMETRIES = 8;
const SYM_POS_MAP: Int16Array = (() => {
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
})();

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

const EMPTY_AREA_MAP = new Uint8Array(BOARD_AREA);

let evalScratchNoArea: EvalBatchScratch | null = null;
let evalScratchWithArea: EvalBatchScratch | null = null;

function getEvalScratch(args: { batch: number; includeAreaFeature: boolean }): EvalBatchScratch {
  const { batch, includeAreaFeature } = args;
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

async function evaluateBatch(args: {
  model: KataGoModelV8Tf;
  includeOwnership?: boolean;
  rules: GameRules;
  nnRandomize: boolean;
  policyOptimism: number;
  states: Array<{
    stones: Uint8Array;
    koPoint: number;
    prevStones: Uint8Array;
    prevKoPoint: number;
    prevPrevStones: Uint8Array;
    prevPrevKoPoint: number;
    currentPlayer: Player;
    recentMoves: RecentMove[];
    komi: number;
    conservativePassAndIsRoot?: boolean;
  }>;
}): Promise<
  Array<{
    policy: Float32Array; // len 361, in symmetry space if symmetry != 0
    symmetry: number; // 0..7, where 0 is identity
    passLogit: number;
    blackWinProb: number;
    blackScoreLead: number;
    blackScoreMean: number;
    blackScoreStdev: number;
    blackNoResultProb: number;
    libertyMap: Uint8Array;
    areaMap: Uint8Array;
    ownership?: Float32Array; // len 361, raw logits (player-to-move perspective, symmetry space if symmetry != 0)
  }>
> {
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
    const libertyMap = libertyMapScratch.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA);
    computeLibertyMapInto(states[i]!.stones, libertyMap);
    const areaMap = includeAreaFeature
      ? computeAreaMapV7KataGoInto(states[i]!.stones, areaMapScratch!.subarray(i * BOARD_AREA, (i + 1) * BOARD_AREA))
      : EMPTY_AREA_MAP;
	    computeLadderFeaturesV7KataGoInto({
	      stones: states[i]!.stones,
	      koPoint: states[i]!.koPoint,
	      currentPlayer: playerToColor(states[i]!.currentPlayer),
	      outLadderedStones: scratch.ladderedStonesScratch,
	      outLadderWorkingMoves: scratch.ladderWorkingMovesScratch,
	    });

	    const recentMoves = states[i]!.recentMoves;
	    const lastRecentMove = recentMoves.length > 0 ? recentMoves[recentMoves.length - 1] : null;
	    const passWouldEndGame = lastRecentMove?.move === PASS_MOVE;
	    const suppressHistory = states[i]!.conservativePassAndIsRoot === true && passWouldEndGame;

	    const pla = states[i]!.currentPlayer;
	    const opp = pla === 'black' ? 'white' : 'black';
	    const expectedPlayers: Player[] = [opp, pla, opp, pla, opp];

	    let numTurnsOfHistoryIncluded = 0;
	    if (!suppressHistory) {
	      for (let h = 0; h < 5; h++) {
	        const m = recentMoves[recentMoves.length - 1 - h];
	        if (!m) break;
	        if (m.player !== expectedPlayers[h]) break;
	        numTurnsOfHistoryIncluded++;
	      }
	    }

	    const prevLadderStones = numTurnsOfHistoryIncluded < 1 ? states[i]!.stones : states[i]!.prevStones;
	    const prevLadderKoPoint = numTurnsOfHistoryIncluded < 1 ? states[i]!.koPoint : states[i]!.prevKoPoint;
	    const prevPrevLadderStones = numTurnsOfHistoryIncluded < 2 ? prevLadderStones : states[i]!.prevPrevStones;
	    const prevPrevLadderKoPoint = numTurnsOfHistoryIncluded < 2 ? prevLadderKoPoint : states[i]!.prevPrevKoPoint;

	    computeLadderedStonesV7KataGoInto({
	      stones: prevLadderStones,
	      koPoint: prevLadderKoPoint,
	      outLadderedStones: scratch.prevLadderedStonesScratch,
	    });
	    computeLadderedStonesV7KataGoInto({
	      stones: prevPrevLadderStones,
	      koPoint: prevPrevLadderKoPoint,
	      outLadderedStones: scratch.prevPrevLadderedStonesScratch,
	    });

	    fillInputsV7Fast({
	      stones: states[i]!.stones,
	      koPoint: states[i]!.koPoint,
	      currentPlayer: states[i]!.currentPlayer,
	      recentMoves,
	      komi: states[i]!.komi,
	      rules,
	      conservativePassAndIsRoot: states[i]!.conservativePassAndIsRoot,
      libertyMap,
      areaMap: includeAreaFeature ? areaMap : undefined,
      ladderedStones: scratch.ladderedStonesScratch,
      ladderWorkingMoves: scratch.ladderWorkingMovesScratch,
      prevLadderedStones: scratch.prevLadderedStonesScratch,
      prevPrevLadderedStones: scratch.prevPrevLadderedStonesScratch,
      outSpatial: spatialScratch,
      outGlobal: globalScratch,
    });

    const sym = nnRandomize ? ((Math.random() * NUM_SYMMETRIES) | 0) : 0;
    symmetries[i] = sym;
    const spatialOffset = i * BOARD_AREA * 22;
    if (sym === 0) {
      spatialBatch.set(spatialScratch, spatialOffset);
    } else {
      const symOff = sym * BOARD_AREA;
      const src = spatialScratch;
      for (let pos = 0; pos < BOARD_AREA; pos++) {
        const dstPos = SYM_POS_MAP[symOff + pos]!;
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

  const ownershipPromise = includeOwnership && 'ownership' in out ? out.ownership.data() : Promise.resolve(null);
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
  if ('ownership' in out) out.ownership.dispose();

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

  const results: Array<{
    policy: Float32Array;
    symmetry: number;
    passLogit: number;
    blackWinProb: number;
    blackScoreLead: number;
    blackScoreMean: number;
    blackScoreStdev: number;
    blackNoResultProb: number;
    libertyMap: Uint8Array;
    areaMap: Uint8Array;
    ownership?: Float32Array;
  }> = [];
  for (let i = 0; i < batch; i++) {
    const pOff = i * BOARD_AREA;
    const sym = symmetries[i]!;
    const policy = policyLogits.subarray(pOff, pOff + BOARD_AREA);
    const ownership = includeOwnership ? (ownershipArr as Float32Array).subarray(pOff, pOff + BOARD_AREA) : undefined;

    const passLogit = passLogits[i]!;
    const vOff = i * 3;
    const sOff = i * 4;
    const evaled = postprocessKataGoV8({
      nextPlayer: states[i]!.currentPlayer,
      valueLogits: valueArr.subarray(vOff, vOff + 3),
      scoreValue: scoreArr.subarray(sOff, sOff + 4),
      postProcessParams: model.postProcessParams,
    });

    results.push({
      policy,
      symmetry: sym,
      passLogit,
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
  readonly currentPlayer: Player;
  readonly komi: number;
  readonly rules: GameRules;
  readonly nnRandomize: boolean;
  readonly conservativePass: boolean;
  readonly wideRootNoise: number;
  private readonly outputScaleMultiplier: number;

  private readonly rootStones: Uint8Array<ArrayBuffer>;
  private readonly rootKoPoint: number;
  private readonly rootPrevStones: Uint8Array<ArrayBuffer>;
  private readonly rootPrevKoPoint: number;
  private readonly rootMoves: RecentMove[];

  private readonly rootNode: Node;
  private readonly rootPolicy: Float32Array; // len 362
  private readonly rootOwnership: Float32Array; // len 361
  private readonly recentScoreCenter: number;
  private readonly rand: Rand;
  private readonly rootSelfValue: number;
  private readonly rootSelfScoreLead: number;
  private readonly rootSelfScoreMean: number;
  private readonly rootSelfScoreMeanSq: number;
  private readonly rootSelfUtility: number;

  private jobStonesScratch = new Uint8Array(0);
  private jobPrevStonesScratch = new Uint8Array(0);
  private jobPrevPrevStonesScratch = new Uint8Array(0);

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
    rootStones: Uint8Array<ArrayBuffer>;
    rootKoPoint: number;
    rootPrevStones: Uint8Array<ArrayBuffer>;
    rootPrevKoPoint: number;
    rootMoves: RecentMove[];
    rootNode: Node;
    rootPolicy: Float32Array;
    rootOwnership: Float32Array;
    recentScoreCenter: number;
    rand: Rand;
    outputScaleMultiplier: number;
    rootSelfValue: number;
    rootSelfScoreLead: number;
    rootSelfScoreMean: number;
    rootSelfScoreMeanSq: number;
    rootSelfUtility: number;
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

    this.rootStones = args.rootStones;
    this.rootKoPoint = args.rootKoPoint;
    this.rootPrevStones = args.rootPrevStones;
    this.rootPrevKoPoint = args.rootPrevKoPoint;
    this.rootMoves = args.rootMoves;

    this.rootNode = args.rootNode;
    this.rootPolicy = args.rootPolicy;
    this.rootOwnership = args.rootOwnership;
    this.recentScoreCenter = args.recentScoreCenter;
    this.rand = args.rand;
    this.outputScaleMultiplier = args.outputScaleMultiplier;
    this.rootSelfValue = args.rootSelfValue;
    this.rootSelfScoreLead = args.rootSelfScoreLead;
    this.rootSelfScoreMean = args.rootSelfScoreMean;
    this.rootSelfScoreMeanSq = args.rootSelfScoreMeanSq;
    this.rootSelfUtility = args.rootSelfUtility;
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
  }): Promise<MctsSearch> {
    const outputScaleMultiplier = args.model.postProcessParams?.outputScaleMultiplier ?? 1.0;
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

    const rootPos: SimPosition = { stones: rootStones.slice(), koPoint: rootKoPoint };
    const rootNode = new Node(playerToColor(args.currentPlayer));

    const rootEval = (
      await evaluateBatch({
        model: args.model,
        includeOwnership: true,
        rules: args.rules,
        nnRandomize: args.nnRandomize,
        policyOptimism: ROOT_POLICY_OPTIMISM,
        states: [
          {
            stones: rootPos.stones,
            koPoint: rootPos.koPoint,
            prevStones: rootPrevStones,
            prevKoPoint: rootPrevKoPoint,
            prevPrevStones: rootPrevPrevStones,
            prevPrevKoPoint: rootPrevPrevKoPoint,
            currentPlayer: args.currentPlayer,
            recentMoves: takeRecentMoves(rootMoves, [], 5),
            komi: args.komi,
            conservativePassAndIsRoot: args.conservativePass,
          },
        ],
      })
    )[0]!;
    if (!rootEval.ownership) throw new Error('Missing ownership output');

    const rootOwnershipSign = args.currentPlayer === 'black' ? 1 : -1;
    const rootOwnership = new Float32Array(BOARD_AREA);
    const rootSym = rootEval.symmetry;
    const rootSymOff = rootSym * BOARD_AREA;
    for (let i = 0; i < BOARD_AREA; i++) {
      const symPos = rootSym === 0 ? i : SYM_POS_MAP[rootSymOff + i]!;
      rootOwnership[i] = rootOwnershipSign * Math.tanh(rootEval.ownership[symPos]! * outputScaleMultiplier);
    }

    const rootPolicy = new Float32Array(BOARD_AREA + 1);
    expandNode({
      node: rootNode,
      stones: rootPos.stones,
      koPoint: rootPos.koPoint,
      policyLogits: rootEval.policy,
      policyLogitsSymmetry: rootSym,
      passLogit: rootEval.passLogit,
      maxChildren: args.maxChildren,
      libertyMap: rootEval.libertyMap,
      policyOut: rootPolicy,
      policyOutputScaling: outputScaleMultiplier,
    });
    rootNode.ownership = rootOwnership;

    const recentScoreCenter = computeRecentScoreCenter(-rootEval.blackScoreMean);

    const rootValue = 2 * rootEval.blackWinProb - 1;
    const rootUtility = computeBlackUtilityFromEval({
      blackWinProb: rootEval.blackWinProb,
      blackNoResultProb: rootEval.blackNoResultProb,
      blackScoreMean: rootEval.blackScoreMean,
      blackScoreStdev: rootEval.blackScoreStdev,
      recentScoreCenter,
    });
    rootNode.visits = 1;
    rootNode.valueSum = rootValue;
    rootNode.scoreLeadSum = rootEval.blackScoreLead;
    rootNode.scoreMeanSum = rootEval.blackScoreMean;
    const rootScoreMeanSq = rootEval.blackScoreStdev * rootEval.blackScoreStdev + rootEval.blackScoreMean * rootEval.blackScoreMean;
    rootNode.scoreMeanSqSum = rootScoreMeanSq;
    rootNode.utilitySum = rootUtility;
    rootNode.utilitySqSum = rootUtility * rootUtility;
    rootNode.nnUtility = rootUtility;

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
      rootStones,
      rootKoPoint,
      rootPrevStones,
      rootPrevKoPoint,
      rootMoves,
      rootNode,
      rootPolicy,
      rootOwnership,
      recentScoreCenter,
      rand: new Rand(),
      outputScaleMultiplier,
      rootSelfValue: rootValue,
      rootSelfScoreLead: rootEval.blackScoreLead,
      rootSelfScoreMean: rootEval.blackScoreMean,
      rootSelfScoreMeanSq: rootScoreMeanSq,
      rootSelfUtility: rootUtility,
    });
  }

  async run(args: { visits: number; maxTimeMs: number; batchSize: number }): Promise<void> {
    const maxVisits = Math.max(16, Math.min(args.visits, ENGINE_MAX_VISITS));
    const maxTimeMs = Math.max(25, Math.min(args.maxTimeMs, ENGINE_MAX_TIME_MS));
    const batchSize = Math.max(1, Math.min(args.batchSize, 64));

    if (this.rootNode.visits >= maxVisits) return;

    const neededBoardCapacity = batchSize * BOARD_AREA;
    if (this.jobStonesScratch.length < neededBoardCapacity) this.jobStonesScratch = new Uint8Array(neededBoardCapacity);
    if (this.jobPrevStonesScratch.length < neededBoardCapacity) this.jobPrevStonesScratch = new Uint8Array(neededBoardCapacity);
    if (this.jobPrevPrevStonesScratch.length < neededBoardCapacity) this.jobPrevPrevStonesScratch = new Uint8Array(neededBoardCapacity);

    const sim: SimPosition = { stones: this.rootStones.slice(), koPoint: this.rootKoPoint };
    const captureStack: number[] = [];
    const undoMoves: number[] = [];
    const undoPlayers: StoneColor[] = [];
    const undoSnapshots: UndoSnapshot[] = [];
    const pathMoves: RecentMove[] = [];

    const deadline = performance.now() + maxTimeMs;
    let timeCheckCounter = 0;
    const timeCheckMask = 0x1f;
    const timeExceeded = (): boolean => {
      if ((timeCheckCounter++ & timeCheckMask) !== 0) return false;
      return performance.now() >= deadline;
    };

    while (this.rootNode.visits < maxVisits && !timeExceeded()) {
      const jobs: Array<{
        leaf: Node;
        path: Node[];
        stones: Uint8Array;
        koPoint: number;
        prevStones: Uint8Array;
        prevKoPoint: number;
        prevPrevStones: Uint8Array;
        prevPrevKoPoint: number;
        currentPlayer: Player;
        recentMoves: RecentMove[];
      }> = [];

      let attempts = 0;
      while (jobs.length < batchSize && this.rootNode.visits + jobs.length < maxVisits && !timeExceeded()) {
        attempts++;
        if (attempts > batchSize * 8) break;

        undoMoves.length = 0;
        undoPlayers.length = 0;
        undoSnapshots.length = 0;
        pathMoves.length = 0;
        sim.stones.set(this.rootStones);
        sim.koPoint = this.rootKoPoint;

        const path: Node[] = [this.rootNode];
        let node = this.rootNode;
        let player = this.rootNode.playerToMove;

        while (node.edges && node.edges.length > 0) {
          const e = selectEdge(node, node === this.rootNode, this.wideRootNoise, this.rand);
          const move = e.move;

          const snapshot = playMove(sim, move, player, captureStack);
          undoMoves.push(move);
          undoPlayers.push(player);
          undoSnapshots.push(snapshot);
          pathMoves.push({ move, player: colorToPlayer(player) });

          if (!e.child) e.child = new Node(opponentOf(player));
          node = e.child;
          player = node.playerToMove;
          path.push(node);

          if (!node.edges) break;
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

        jobs.push({
          leaf: node,
          path,
          stones: leafStones,
          koPoint: leafKoPoint,
          prevStones,
          prevKoPoint,
          prevPrevStones,
          prevPrevKoPoint,
          currentPlayer: leafPlayer,
          recentMoves: takeRecentMoves(this.rootMoves, pathMoves, 5),
        });
      }

      if (jobs.length === 0) break;

      const includeOwnership = this.ownershipMode === 'tree';
      const evals = await evaluateBatch({
        model: this.model,
        includeOwnership,
        rules: this.rules,
        nnRandomize: this.nnRandomize,
        policyOptimism: POLICY_OPTIMISM,
        states: jobs.map((j) => ({
          stones: j.stones,
          koPoint: j.koPoint,
          prevStones: j.prevStones,
          prevKoPoint: j.prevKoPoint,
          prevPrevStones: j.prevPrevStones,
          prevPrevKoPoint: j.prevPrevKoPoint,
          currentPlayer: j.currentPlayer,
          recentMoves: j.recentMoves,
          komi: this.komi,
        })),
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
          for (let p = 0; p < BOARD_AREA; p++) {
            const symPos = sym === 0 ? p : SYM_POS_MAP[symOff + p]!;
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

        const leafValue = 2 * ev.blackWinProb - 1;
        const leafUtility = computeBlackUtilityFromEval({
          blackWinProb: ev.blackWinProb,
          blackNoResultProb: ev.blackNoResultProb,
          blackScoreMean: ev.blackScoreMean,
          blackScoreStdev: ev.blackScoreStdev,
          recentScoreCenter: this.recentScoreCenter,
        });
        job.leaf.nnUtility = leafUtility;
        for (const n of job.path) {
          n.visits += 1;
          n.valueSum += leafValue;
          n.scoreLeadSum += ev.blackScoreLead;
          n.scoreMeanSum += ev.blackScoreMean;
          n.scoreMeanSqSum += ev.blackScoreStdev * ev.blackScoreStdev + ev.blackScoreMean * ev.blackScoreMean;
          n.utilitySum += leafUtility;
          n.utilitySqSum += leafUtility * leafUtility;
          n.inFlight -= 1;
        }
        job.leaf.pendingEval = false;
      }
    }
  }

  getAnalysis(args: { topK: number; analysisPvLen: number; includeMovesOwnership?: boolean }): {
    rootWinRate: number;
    rootScoreLead: number;
    rootScoreSelfplay: number;
    rootScoreStdev: number;
    ownership: FloatArray;
    ownershipStdev: FloatArray;
    policy: FloatArray;
    moves: Array<{
      x: number;
      y: number;
      winRate: number;
      winRateLost: number;
      scoreLead: number;
      scoreSelfplay: number;
      scoreStdev: number;
      visits: number;
      pointsLost: number;
      relativePointsLost: number;
      order: number;
      prior: number;
      pv: string[];
      ownership?: FloatArray;
    }>;
  } {
    const topK = Math.max(1, Math.min(args.topK, 50));
    const includeMovesOwnership = args.includeMovesOwnership === true;
    const analysisPvLen = Math.max(0, Math.min(args.analysisPvLen, 60));
    const pvDepth = 1 + analysisPvLen;

    const edges = this.rootNode.edges ?? [];
    const EMPTY_PV: string[] = [];
    const childStats: ChildWeightStats[] = [];
    const topMoves: Array<{
      edge: Edge;
      move: number;
      visits: number;
      winRate: number;
      scoreLead: number;
      scoreSelfplay: number;
      scoreStdev: number;
      prior: number;
      pv: string[];
      orderIndex: number;
    }> = [];
    let orderIndex = 0;
    let minIdx = -1;

    const isBetter = (a: (typeof topMoves)[number], b: (typeof topMoves)[number]) =>
      a.visits > b.visits || (a.visits === b.visits && a.orderIndex < b.orderIndex);
    const isWorse = (a: (typeof topMoves)[number], b: (typeof topMoves)[number]) =>
      a.visits < b.visits || (a.visits === b.visits && a.orderIndex > b.orderIndex);

    const updateMinIdx = () => {
      minIdx = 0;
      for (let i = 1; i < topMoves.length; i++) {
        if (isWorse(topMoves[i]!, topMoves[minIdx]!)) minIdx = i;
      }
    };

    for (const e of edges) {
      const child = e.child;
      if (!child || child.visits <= 0) continue;
      const q = child.valueSum / child.visits;
      const winRate = (q + 1) * 0.5;
      const scoreLead = child.scoreLeadSum / child.visits;
      const scoreSelfplay = child.scoreMeanSum / child.visits;
      const scoreMeanSq = child.scoreMeanSqSum / child.visits;
      const scoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreSelfplay * scoreSelfplay));
      const utility = child.utilitySum / child.visits;
      childStats.push({
        weightAdjusted: child.visits,
        selfUtility: utility,
        policy: e.prior,
        value: q,
        scoreLead,
        scoreMean: scoreSelfplay,
        scoreMeanSq,
      });
      const row = {
        edge: e,
        move: e.move,
        visits: child.visits,
        winRate,
        scoreLead,
        scoreSelfplay,
        scoreStdev,
        prior: e.prior,
        pv: EMPTY_PV,
        orderIndex: orderIndex++,
      };
      if (topMoves.length < topK) {
        topMoves.push(row);
        if (topMoves.length === topK) updateMinIdx();
      } else if (minIdx >= 0 && isBetter(row, topMoves[minIdx]!)) {
        topMoves[minIdx] = row;
        updateMinIdx();
      }
    }

    topMoves.sort((a, b) => {
      const diff = b.visits - a.visits;
      if (diff !== 0) return diff;
      return a.orderIndex - b.orderIndex;
    });
    for (const row of topMoves) row.pv = buildPv(row.edge, pvDepth);

    const rootStats = computeWeightedRootStats({
      children: childStats,
      rootSelf: {
        value: this.rootSelfValue,
        scoreLead: this.rootSelfScoreLead,
        scoreMean: this.rootSelfScoreMean,
        scoreMeanSq: this.rootSelfScoreMeanSq,
        utility: this.rootSelfUtility,
        weight: 1,
      },
    });
    const rootWinRate = rootStats.rootWinRate;
    const rootScoreLead = rootStats.rootScoreLead;
    const rootScoreSelfplay = rootStats.rootScoreSelfplay;
    const rootScoreStdev = rootStats.rootScoreStdev;

    const best = topMoves[0] ?? null;
    const bestScoreLead = best ? best.scoreLead : rootScoreLead;
    const sign = this.currentPlayer === 'black' ? 1 : -1;

    const moves = topMoves.map((m, i) => {
      const pointsLost = sign * (rootScoreLead - m.scoreLead);
      const relativePointsLost = sign * (bestScoreLead - m.scoreLead);
      const winRateLost = sign * (rootWinRate - m.winRate);

      const x = m.move === PASS_MOVE ? -1 : m.move % BOARD_SIZE;
      const y = m.move === PASS_MOVE ? -1 : (m.move / BOARD_SIZE) | 0;

      return {
        x,
        y,
        winRate: m.winRate,
        winRateLost,
        scoreLead: m.scoreLead,
        scoreSelfplay: m.scoreSelfplay,
        scoreStdev: m.scoreStdev,
        visits: m.visits,
        pointsLost,
        relativePointsLost,
        order: i,
        prior: m.prior,
        pv: m.pv,
        ownership:
          includeMovesOwnership && m.edge.child?.ownership ? new Float32Array(m.edge.child.ownership) : undefined,
      };
    });

    const { ownership, ownershipStdev } =
      this.ownershipMode === 'tree'
        ? averageTreeOwnership(this.rootNode)
        : { ownership: this.rootOwnership, ownershipStdev: new Float32Array(BOARD_AREA) };
    const ownershipOut = this.ownershipMode === 'tree' ? ownership : new Float32Array(ownership);
    const policyOut = new Float32Array(this.rootPolicy);

    return {
      rootWinRate,
      rootScoreLead,
      rootScoreSelfplay,
      rootScoreStdev,
      ownership: ownershipOut,
      ownershipStdev,
      policy: policyOut,
      moves,
    };
  }
}

export async function analyzeMcts(args: {
  model: KataGoModelV8Tf;
  board: BoardState;
  previousBoard?: BoardState;
  previousPreviousBoard?: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  topK?: number;
  analysisPvLen?: number;
  wideRootNoise?: number;
  rules?: GameRules;
  nnRandomize?: boolean;
  visits?: number;
  maxTimeMs?: number;
  batchSize?: number;
  maxChildren?: number;
}): Promise<{
  rootWinRate: number;
  rootScoreLead: number;
  rootScoreSelfplay: number;
  rootScoreStdev: number;
  ownership: FloatArray; // len 361, +1 black owns, -1 white owns (tree-averaged)
  ownershipStdev: FloatArray; // len 361 (tree stdev)
  policy: FloatArray; // len 362, illegal = -1, pass at index 361
  moves: Array<{
    x: number;
    y: number;
    winRate: number;
    winRateLost: number;
    scoreLead: number;
    scoreSelfplay: number;
    scoreStdev: number;
    visits: number;
    pointsLost: number;
    relativePointsLost: number;
    order: number;
    prior: number;
    pv: string[];
  }>;
}> {
  const outputScaleMultiplier = args.model.postProcessParams?.outputScaleMultiplier ?? 1.0;
  const maxVisits = Math.max(16, Math.min(args.visits ?? 256, ENGINE_MAX_VISITS));
  const maxTimeMs = Math.max(25, Math.min(args.maxTimeMs ?? 800, ENGINE_MAX_TIME_MS));
  const batchSize = Math.max(1, Math.min(args.batchSize ?? (tf.getBackend() === 'webgpu' ? 16 : 4), 64));
  const maxChildren = Math.max(4, Math.min(args.maxChildren ?? 64, 361));
  const topK = Math.max(1, Math.min(args.topK ?? 10, 50));
  const analysisPvLen = Math.max(0, Math.min(args.analysisPvLen ?? 15, 60));
  const wideRootNoise = Math.max(0, Math.min(args.wideRootNoise ?? 0.04, 5));
  const rules: GameRules = args.rules ?? 'japanese';
  const nnRandomize = args.nnRandomize !== false;
  const pvDepth = 1 + analysisPvLen;
  const rand = new Rand();

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

  const rootPos: SimPosition = { stones: rootStones.slice(), koPoint: rootKoPoint };
  const rootNode = new Node(playerToColor(args.currentPlayer));

  const rootEval = (
    await evaluateBatch({
      model: args.model,
      includeOwnership: true,
      rules,
      nnRandomize,
      policyOptimism: ROOT_POLICY_OPTIMISM,
      states: [
        {
          stones: rootPos.stones,
          koPoint: rootPos.koPoint,
          prevStones: rootPrevStones,
          prevKoPoint: rootPrevKoPoint,
          prevPrevStones: rootPrevPrevStones,
          prevPrevKoPoint: rootPrevPrevKoPoint,
          currentPlayer: args.currentPlayer,
          recentMoves: takeRecentMoves(rootMoves, [], 5),
          komi: args.komi,
        },
      ],
    })
  )[0]!;
  if (!rootEval.ownership) throw new Error('Missing ownership output');

  const rootOwnershipSign = args.currentPlayer === 'black' ? 1 : -1;
  const rootOwnership = new Float32Array(BOARD_AREA);
  const rootSym = rootEval.symmetry;
  const rootSymOff = rootSym * BOARD_AREA;
  for (let i = 0; i < BOARD_AREA; i++) {
    const symPos = rootSym === 0 ? i : SYM_POS_MAP[rootSymOff + i]!;
    rootOwnership[i] = rootOwnershipSign * Math.tanh(rootEval.ownership[symPos]! * outputScaleMultiplier);
  }

  const rootPolicy = new Float32Array(BOARD_AREA + 1);
  expandNode({
    node: rootNode,
    stones: rootPos.stones,
    koPoint: rootPos.koPoint,
    policyLogits: rootEval.policy,
    policyLogitsSymmetry: rootSym,
    passLogit: rootEval.passLogit,
    maxChildren,
    libertyMap: rootEval.libertyMap,
    policyOut: rootPolicy,
    policyOutputScaling: outputScaleMultiplier,
  });
  rootNode.ownership = rootOwnership;

  const recentScoreCenter = computeRecentScoreCenter(-rootEval.blackScoreMean);

  const rootValue = 2 * rootEval.blackWinProb - 1;
  const rootUtility = computeBlackUtilityFromEval({
    blackWinProb: rootEval.blackWinProb,
    blackNoResultProb: rootEval.blackNoResultProb,
    blackScoreMean: rootEval.blackScoreMean,
    blackScoreStdev: rootEval.blackScoreStdev,
    recentScoreCenter,
  });
		  rootNode.visits = 1;
		  rootNode.valueSum = rootValue;
		  rootNode.scoreLeadSum = rootEval.blackScoreLead;
		  rootNode.scoreMeanSum = rootEval.blackScoreMean;
		  const rootScoreMeanSq = rootEval.blackScoreStdev * rootEval.blackScoreStdev + rootEval.blackScoreMean * rootEval.blackScoreMean;
		  rootNode.scoreMeanSqSum = rootScoreMeanSq;
		  rootNode.utilitySum = rootUtility;
		  rootNode.utilitySqSum = rootUtility * rootUtility;
		  rootNode.nnUtility = rootUtility;

  const sim: SimPosition = { stones: rootStones.slice(), koPoint: rootKoPoint };
  const captureStack: number[] = [];
  const undoMoves: number[] = [];
  const undoPlayers: StoneColor[] = [];
  const undoSnapshots: UndoSnapshot[] = [];
  const pathMoves: RecentMove[] = [];

	  const deadline = performance.now() + maxTimeMs;
	  let timeCheckCounter = 0;
	  const timeCheckMask = 0x1f;
	  const timeExceeded = (): boolean => {
	    if ((timeCheckCounter++ & timeCheckMask) !== 0) return false;
	    return performance.now() >= deadline;
	  };

  while (rootNode.visits < maxVisits && !timeExceeded()) {
    const jobs: Array<{
      leaf: Node;
      path: Node[];
      stones: Uint8Array;
      koPoint: number;
      prevStones: Uint8Array;
      prevKoPoint: number;
      prevPrevStones: Uint8Array;
      prevPrevKoPoint: number;
      currentPlayer: Player;
      recentMoves: RecentMove[];
    }> = [];

    let attempts = 0;
    while (jobs.length < batchSize && rootNode.visits + jobs.length < maxVisits && !timeExceeded()) {
      attempts++;
      if (attempts > batchSize * 8) break;

      undoMoves.length = 0;
      undoPlayers.length = 0;
      undoSnapshots.length = 0;
      pathMoves.length = 0;
      sim.stones.set(rootStones);
      sim.koPoint = rootKoPoint;

      const path: Node[] = [rootNode];
      let node = rootNode;
      let player = rootNode.playerToMove;

		      while (node.edges && node.edges.length > 0) {
		        const e = selectEdge(node, node === rootNode, wideRootNoise, rand);
		        const move = e.move;

        const snapshot = playMove(sim, move, player, captureStack);
        undoMoves.push(move);
        undoPlayers.push(player);
        undoSnapshots.push(snapshot);
        pathMoves.push({ move, player: colorToPlayer(player) });

        if (!e.child) e.child = new Node(opponentOf(player));
        node = e.child;
        player = node.playerToMove;
        path.push(node);

        if (!node.edges) break;
      }

      if (node.pendingEval) {
        for (let i = undoMoves.length - 1; i >= 0; i--) {
          undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
        }
        continue;
      }

      node.pendingEval = true;
      for (const n of path) n.inFlight++;

      const leafStones = sim.stones.slice();
      const leafKoPoint = sim.koPoint;
      let prevStones = leafStones;
      let prevKoPoint = leafKoPoint;
      let prevPrevStones = leafStones;
      let prevPrevKoPoint = leafKoPoint;
      const leafPlayer = colorToPlayer(player);

      if (undoMoves.length >= 1) {
        const lastIdx = undoMoves.length - 1;
        undoMove(sim, undoMoves[lastIdx]!, undoPlayers[lastIdx]!, undoSnapshots[lastIdx]!, captureStack);

        if (lastIdx === 0) {
          prevStones = rootStones;
          prevKoPoint = rootKoPoint;
          prevPrevStones = rootPrevStones;
          prevPrevKoPoint = rootPrevKoPoint;
        } else {
          prevStones = sim.stones.slice();
          prevKoPoint = sim.koPoint;

          const secondIdx = undoMoves.length - 2;
          undoMove(sim, undoMoves[secondIdx]!, undoPlayers[secondIdx]!, undoSnapshots[secondIdx]!, captureStack);

          if (secondIdx === 0) {
            prevPrevStones = rootStones;
            prevPrevKoPoint = rootKoPoint;
          } else {
            prevPrevStones = sim.stones.slice();
            prevPrevKoPoint = sim.koPoint;
          }

          for (let i = secondIdx - 1; i >= 0; i--) {
            undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
          }
        }
      }

      jobs.push({
        leaf: node,
        path,
        stones: leafStones,
        koPoint: leafKoPoint,
        prevStones,
        prevKoPoint,
        prevPrevStones,
        prevPrevKoPoint,
        currentPlayer: leafPlayer,
        recentMoves: takeRecentMoves(rootMoves, pathMoves, 5),
      });
    }

    if (jobs.length === 0) break;

    const evals = await evaluateBatch({
      model: args.model,
      includeOwnership: true,
      rules,
      nnRandomize,
      policyOptimism: POLICY_OPTIMISM,
      states: jobs.map((j) => ({
        stones: j.stones,
        koPoint: j.koPoint,
        prevStones: j.prevStones,
        prevKoPoint: j.prevKoPoint,
        prevPrevStones: j.prevPrevStones,
        prevPrevKoPoint: j.prevPrevKoPoint,
        currentPlayer: j.currentPlayer,
        recentMoves: j.recentMoves,
        komi: args.komi,
      })),
    });
    timeCheckCounter = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!;
      const ev = evals[i]!;
      if (!ev.ownership) throw new Error('Missing ownership output');

      const ownershipSign = job.currentPlayer === 'black' ? 1 : -1;
      const own = new Float32Array(BOARD_AREA);
      const sym = ev.symmetry;
      const symOff = sym * BOARD_AREA;
      for (let p = 0; p < BOARD_AREA; p++) {
        const symPos = sym === 0 ? p : SYM_POS_MAP[symOff + p]!;
        own[p] = ownershipSign * Math.tanh(ev.ownership[symPos]! * outputScaleMultiplier);
      }
      job.leaf.ownership = own;

		    expandNode({
		      node: job.leaf,
		      stones: job.stones,
		      koPoint: job.koPoint,
      policyLogits: ev.policy,
      policyLogitsSymmetry: ev.symmetry,
      passLogit: ev.passLogit,
      maxChildren,
		      libertyMap: ev.libertyMap,
		      policyOutputScaling: outputScaleMultiplier,
		    });

	      const leafValue = 2 * ev.blackWinProb - 1;
	      const leafUtility = computeBlackUtilityFromEval({
	        blackWinProb: ev.blackWinProb,
	        blackNoResultProb: ev.blackNoResultProb,
	        blackScoreMean: ev.blackScoreMean,
	        blackScoreStdev: ev.blackScoreStdev,
	        recentScoreCenter,
	      });
	      job.leaf.nnUtility = leafUtility;
	      for (const n of job.path) {
	        n.visits += 1;
	        n.valueSum += leafValue;
	        n.scoreLeadSum += ev.blackScoreLead;
	        n.scoreMeanSum += ev.blackScoreMean;
	        n.scoreMeanSqSum += ev.blackScoreStdev * ev.blackScoreStdev + ev.blackScoreMean * ev.blackScoreMean;
	        n.utilitySum += leafUtility;
	        n.utilitySqSum += leafUtility * leafUtility;
	        n.inFlight -= 1;
	      }
	      job.leaf.pendingEval = false;
	    }
  }

  const edges = rootNode.edges ?? [];
  const childStats: ChildWeightStats[] = [];
  const moveRows: Array<{
    edge: Edge;
    move: number;
    visits: number;
    winRate: number;
    scoreLead: number;
    scoreSelfplay: number;
    scoreStdev: number;
    prior: number;
    pv: string[];
  }> = [];

  for (const e of edges) {
    const child = e.child;
    if (!child || child.visits <= 0) continue;
    const q = child.valueSum / child.visits;
    const winRate = (q + 1) * 0.5;
    const scoreLead = child.scoreLeadSum / child.visits;
    const scoreSelfplay = child.scoreMeanSum / child.visits;
    const scoreMeanSq = child.scoreMeanSqSum / child.visits;
    const scoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreSelfplay * scoreSelfplay));
    const utility = child.utilitySum / child.visits;
    childStats.push({
      weightAdjusted: child.visits,
      selfUtility: utility,
      policy: e.prior,
      value: q,
      scoreLead,
      scoreMean: scoreSelfplay,
      scoreMeanSq,
    });
    moveRows.push({
      edge: e,
      move: e.move,
      visits: child.visits,
      winRate,
      scoreLead,
      scoreSelfplay,
      scoreStdev,
      prior: e.prior,
      pv: buildPv(e, pvDepth),
    });
  }

  moveRows.sort((a, b) => b.visits - a.visits);

  const rootStats = computeWeightedRootStats({
    children: childStats,
    rootSelf: {
      value: rootValue,
      scoreLead: rootEval.blackScoreLead,
      scoreMean: rootEval.blackScoreMean,
      scoreMeanSq: rootScoreMeanSq,
      utility: rootUtility,
      weight: 1,
    },
  });
  const rootWinRate = rootStats.rootWinRate;
  const rootScoreLead = rootStats.rootScoreLead;
  const rootScoreSelfplay = rootStats.rootScoreSelfplay;
  const rootScoreStdev = rootStats.rootScoreStdev;

  const topMoves = moveRows.slice(0, Math.min(topK, moveRows.length));
  const best = topMoves[0] ?? null;
  const bestScoreLead = best ? best.scoreLead : rootScoreLead;
  const sign = args.currentPlayer === 'black' ? 1 : -1;

  const moves = topMoves.map((m) => {
    const pointsLost = sign * (rootScoreLead - m.scoreLead);
    const relativePointsLost = sign * (bestScoreLead - m.scoreLead);
    const winRateLost = sign * (rootWinRate - m.winRate);

    const x = m.move === PASS_MOVE ? -1 : m.move % BOARD_SIZE;
    const y = m.move === PASS_MOVE ? -1 : (m.move / BOARD_SIZE) | 0;

    return {
      x,
      y,
      winRate: m.winRate,
      winRateLost,
      scoreLead: m.scoreLead,
      scoreSelfplay: m.scoreSelfplay,
      scoreStdev: m.scoreStdev,
      visits: m.visits,
      pointsLost,
      relativePointsLost,
      order: 0,
      prior: m.prior,
      pv: m.pv,
    };
  });

  moves.sort((a, b) => b.visits - a.visits);
  moves.forEach((m, i) => (m.order = i));

  const { ownership, ownershipStdev } = averageTreeOwnership(rootNode);
  return {
    rootWinRate,
    rootScoreLead,
    rootScoreSelfplay,
    rootScoreStdev,
    ownership,
    ownershipStdev,
    policy: rootPolicy,
    moves,
  };
}

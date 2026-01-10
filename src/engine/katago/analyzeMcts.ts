import * as tf from '@tensorflow/tfjs';
import type { BoardState, Move, Player } from '../../types';
import { postprocessKataGoV8 } from './evalV8';
import type { KataGoModelV8Tf } from './modelV8';
import { expectedWhiteScoreValue, SQRT_BOARD_AREA } from './scoreValue';
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
  computeLadderFeaturesV7KataGo,
  computeLadderedStonesV7KataGo,
  computeAreaMapV7KataGo,
  computeLibertyMap,
  type SimPosition,
  type StoneColor,
  type UndoSnapshot,
} from './fastBoard';
import { extractInputsV7Fast, type RecentMove } from './featuresV7Fast';

export type OwnershipMode = 'root' | 'tree';

type Edge = {
  move: number; // 0..360 or PASS_MOVE
  prior: number;
  child: Node | null;
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

function boardStateToStones(board: BoardState): Uint8Array {
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
  policyLogits: ArrayLike<number>; // len 361
  passLogit: number;
  maxChildren: number;
  libertyMap?: Uint8Array;
  policyOut?: Float32Array; // len 362, illegal = -1, pass at index 361
}): void {
  const { node, stones, koPoint, policyLogits, passLogit, maxChildren } = args;
  const pla = node.playerToMove;
  const opp = opponentOf(pla);

  const libs = args.libertyMap ?? computeLibertyMap(stones);

  const legalMoves: Array<{ move: number; logit: number }> = [];
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
    legalMoves.push({ move: p, logit: policyLogits[p]! });
  }

  legalMoves.push({ move: PASS_MOVE, logit: passLogit });

  let maxLogit = Number.NEGATIVE_INFINITY;
  for (const m of legalMoves) if (m.logit > maxLogit) maxLogit = m.logit;
  let sum = 0;
  const priors = new Float64Array(legalMoves.length);
  for (let i = 0; i < legalMoves.length; i++) {
    const v = Math.exp(legalMoves[i]!.logit - maxLogit);
    priors[i] = v;
    sum += v;
  }
  for (let i = 0; i < legalMoves.length; i++) priors[i] /= sum;

  if (args.policyOut) {
    const out = args.policyOut;
    out.fill(-1);
    for (let i = 0; i < legalMoves.length; i++) {
      const move = legalMoves[i]!.move;
      out[move] = priors[i]! as number;
    }
  }

  const combined = legalMoves.map((m, i) => ({ move: m.move, prior: priors[i]! }));
  combined.sort((a, b) => b.prior - a.prior);

  const edges: Edge[] = [];
  let added = 0;
  for (const m of combined) {
    if (m.move === PASS_MOVE) continue;
    edges.push({ move: m.move, prior: m.prior, child: null });
    added++;
    if (added >= maxChildren) break;
  }

  const pass = combined.find((m) => m.move === PASS_MOVE);
  if (pass) edges.push({ move: PASS_MOVE, prior: pass.prior, child: null });

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
const FPU_PARENT_WEIGHT_BY_VISITED_POLICY_POW = 1.0;
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

function selectEdge(node: Node, isRoot: boolean): Edge {
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

  for (const e of edges) {
    const child = e.child;
    const childWeight = child ? child.visits + child.inFlight : 0;
    const childUtility = child && child.visits > 0 ? child.utilitySum / child.visits : fpuValue;
    const explore = (scaling * e.prior) / (1.0 + childWeight);
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

async function evaluateBatch(args: {
  model: KataGoModelV8Tf;
  includeOwnership?: boolean;
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
  }>;
}): Promise<
  Array<{
    policy: Float32Array; // len 361
    passLogit: number;
    blackWinProb: number;
    blackScoreLead: number;
    blackScoreMean: number;
    blackScoreStdev: number;
    blackNoResultProb: number;
    libertyMap: Uint8Array;
    areaMap: Uint8Array;
    ownership?: Float32Array; // len 361, raw logits (player-to-move perspective)
  }>
> {
  const { model, states } = args;
  const includeOwnership = args.includeOwnership === true;
  const batch = states.length;
  const spatialBatch = new Float32Array(batch * BOARD_AREA * 22);
  const globalBatch = new Float32Array(batch * 19);
  const libertyMaps: Uint8Array[] = new Array(batch);
  const areaMaps: Uint8Array[] = new Array(batch);

  for (let i = 0; i < batch; i++) {
    const libertyMap = computeLibertyMap(states[i]!.stones);
    const areaMap = computeAreaMapV7KataGo(states[i]!.stones);
    const ladder = computeLadderFeaturesV7KataGo({
      stones: states[i]!.stones,
      koPoint: states[i]!.koPoint,
      currentPlayer: playerToColor(states[i]!.currentPlayer),
    });
    const prevLadderedStones = computeLadderedStonesV7KataGo({ stones: states[i]!.prevStones, koPoint: states[i]!.prevKoPoint });
    const prevPrevLadderedStones = computeLadderedStonesV7KataGo({
      stones: states[i]!.prevPrevStones,
      koPoint: states[i]!.prevPrevKoPoint,
    });
    libertyMaps[i] = libertyMap;
    areaMaps[i] = areaMap;
    const inp = extractInputsV7Fast({
      stones: states[i]!.stones,
      koPoint: states[i]!.koPoint,
      currentPlayer: states[i]!.currentPlayer,
      recentMoves: states[i]!.recentMoves,
      komi: states[i]!.komi,
      libertyMap,
      areaMap,
      ladderedStones: ladder.ladderedStones,
      ladderWorkingMoves: ladder.ladderWorkingMoves,
      prevLadderedStones,
      prevPrevLadderedStones,
    });
    spatialBatch.set(inp.spatial, i * BOARD_AREA * 22);
    globalBatch.set(inp.global, i * 19);
  }

  const spatialTensor = tf.tensor4d(spatialBatch, [batch, BOARD_SIZE, BOARD_SIZE, 22]);
  const globalTensor = tf.tensor2d(globalBatch, [batch, 19]);
  const out = model.forward(spatialTensor, globalTensor);

  const [policyArr, passArr, valueArr, scoreArr, ownershipArr] = await Promise.all([
    out.policy.data(),
    out.policyPass.data(),
    out.value.data(),
    out.scoreValue.data(),
    includeOwnership ? out.ownership.data() : Promise.resolve(null),
  ]);

  spatialTensor.dispose();
  globalTensor.dispose();
  out.policy.dispose();
  out.policyPass.dispose();
  out.value.dispose();
  out.scoreValue.dispose();
  out.ownership.dispose();

  const results: Array<{
    policy: Float32Array;
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
    const policy = (policyArr as Float32Array).subarray(pOff, pOff + BOARD_AREA);

    const passLogit = passArr[i]!;
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
      passLogit,
      blackWinProb: evaled.blackWinProb,
      blackScoreLead: evaled.blackScoreLead,
      blackScoreMean: evaled.blackScoreMean,
      blackScoreStdev: evaled.blackScoreStdev,
      blackNoResultProb: evaled.blackNoResultProb,
      libertyMap: libertyMaps[i]!,
      areaMap: areaMaps[i]!,
      ownership: includeOwnership ? (ownershipArr as Float32Array).subarray(pOff, pOff + BOARD_AREA) : undefined,
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

  private readonly rootStones: Uint8Array;
  private readonly rootKoPoint: number;
  private readonly rootPrevStones: Uint8Array;
  private readonly rootPrevKoPoint: number;
  private readonly rootMoves: RecentMove[];

  private readonly rootNode: Node;
  private readonly rootPolicy: Float32Array; // len 362
  private readonly rootOwnership: Float32Array; // len 361
  private readonly recentScoreCenter: number;

  private constructor(args: {
    model: KataGoModelV8Tf;
    ownershipMode: OwnershipMode;
    maxChildren: number;
    currentPlayer: Player;
    komi: number;
    rootStones: Uint8Array;
    rootKoPoint: number;
    rootPrevStones: Uint8Array;
    rootPrevKoPoint: number;
    rootMoves: RecentMove[];
    rootNode: Node;
    rootPolicy: Float32Array;
    rootOwnership: Float32Array;
    recentScoreCenter: number;
  }) {
    this.model = args.model;
    this.ownershipMode = args.ownershipMode;
    this.maxChildren = args.maxChildren;
    this.currentPlayer = args.currentPlayer;
    this.komi = args.komi;

    this.rootStones = args.rootStones;
    this.rootKoPoint = args.rootKoPoint;
    this.rootPrevStones = args.rootPrevStones;
    this.rootPrevKoPoint = args.rootPrevKoPoint;
    this.rootMoves = args.rootMoves;

    this.rootNode = args.rootNode;
    this.rootPolicy = args.rootPolicy;
    this.rootOwnership = args.rootOwnership;
    this.recentScoreCenter = args.recentScoreCenter;
  }

  static async create(args: {
    model: KataGoModelV8Tf;
    board: BoardState;
    previousBoard?: BoardState;
    previousPreviousBoard?: BoardState;
    currentPlayer: Player;
    moveHistory: Move[];
    komi: number;
    maxChildren: number;
    ownershipMode: OwnershipMode;
  }): Promise<MctsSearch> {
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
    for (let i = 0; i < BOARD_AREA; i++) {
      rootOwnership[i] = rootOwnershipSign * Math.tanh(rootEval.ownership[i]!);
    }

    const rootPolicy = new Float32Array(BOARD_AREA + 1);
    expandNode({
      node: rootNode,
      stones: rootPos.stones,
      koPoint: rootPos.koPoint,
      policyLogits: rootEval.policy,
      passLogit: rootEval.passLogit,
      maxChildren: args.maxChildren,
      libertyMap: rootEval.libertyMap,
      policyOut: rootPolicy,
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
    rootNode.scoreMeanSqSum = rootEval.blackScoreStdev * rootEval.blackScoreStdev + rootEval.blackScoreMean * rootEval.blackScoreMean;
    rootNode.utilitySum = rootUtility;
    rootNode.utilitySqSum = rootUtility * rootUtility;
    rootNode.nnUtility = rootUtility;

    return new MctsSearch({
      model: args.model,
      ownershipMode: args.ownershipMode,
      maxChildren: args.maxChildren,
      currentPlayer: args.currentPlayer,
      komi: args.komi,
      rootStones,
      rootKoPoint,
      rootPrevStones,
      rootPrevKoPoint,
      rootMoves,
      rootNode,
      rootPolicy,
      rootOwnership,
      recentScoreCenter,
    });
  }

  async run(args: { visits: number; maxTimeMs: number; batchSize: number }): Promise<void> {
    const maxVisits = Math.max(16, Math.min(args.visits, 5000));
    const maxTimeMs = Math.max(25, Math.min(args.maxTimeMs, 60_000));
    const batchSize = Math.max(1, Math.min(args.batchSize, 64));

    if (this.rootNode.visits >= maxVisits) return;

    const sim: SimPosition = { stones: this.rootStones.slice(), koPoint: this.rootKoPoint };
    const captureStack: number[] = [];
    const undoMoves: number[] = [];
    const undoPlayers: StoneColor[] = [];
    const undoSnapshots: UndoSnapshot[] = [];
    const pathMoves: RecentMove[] = [];

    const start = performance.now();

    while (this.rootNode.visits < maxVisits && performance.now() - start < maxTimeMs) {
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
      while (jobs.length < batchSize && this.rootNode.visits + jobs.length < maxVisits && performance.now() - start < maxTimeMs) {
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
          const e = selectEdge(node, node === this.rootNode);
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

        if (undoMoves.length >= 1) {
          const tmpPos: SimPosition = { stones: leafStones.slice(), koPoint: leafKoPoint };
          const tmpCaps = captureStack.slice();
          const lastIdx = undoMoves.length - 1;
          undoMove(tmpPos, undoMoves[lastIdx]!, undoPlayers[lastIdx]!, undoSnapshots[lastIdx]!, tmpCaps);
          prevStones = tmpPos.stones.slice();
          prevKoPoint = tmpPos.koPoint;

          if (undoMoves.length >= 2) {
            const secondIdx = undoMoves.length - 2;
            undoMove(tmpPos, undoMoves[secondIdx]!, undoPlayers[secondIdx]!, undoSnapshots[secondIdx]!, tmpCaps);
            prevPrevStones = tmpPos.stones.slice();
            prevPrevKoPoint = tmpPos.koPoint;
          } else {
            prevPrevStones = new Uint8Array(this.rootPrevStones);
            prevPrevKoPoint = this.rootPrevKoPoint;
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
          currentPlayer: colorToPlayer(player),
          recentMoves: takeRecentMoves(this.rootMoves, pathMoves, 5),
        });

        for (let i = undoMoves.length - 1; i >= 0; i--) {
          undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
        }
      }

      if (jobs.length === 0) break;

      const includeOwnership = this.ownershipMode === 'tree';
      const evals = await evaluateBatch({
        model: this.model,
        includeOwnership,
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

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]!;
        const ev = evals[i]!;

        if (includeOwnership) {
          if (!ev.ownership) throw new Error('Missing ownership output');
          const ownershipSign = job.currentPlayer === 'black' ? 1 : -1;
          const own = new Float32Array(BOARD_AREA);
          for (let p = 0; p < BOARD_AREA; p++) {
            own[p] = ownershipSign * Math.tanh(ev.ownership[p]!);
          }
          job.leaf.ownership = own;
        }

        expandNode({
          node: job.leaf,
          stones: job.stones,
          koPoint: job.koPoint,
          policyLogits: ev.policy,
          passLogit: ev.passLogit,
          maxChildren: this.maxChildren,
          libertyMap: ev.libertyMap,
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

  getAnalysis(args: { topK: number }): {
    rootWinRate: number;
    rootScoreLead: number;
    rootScoreSelfplay: number;
    rootScoreStdev: number;
    ownership: number[];
    ownershipStdev: number[];
    policy: number[];
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
  } {
    const topK = Math.max(1, Math.min(args.topK, 50));

    const rootQ = this.rootNode.visits > 0 ? this.rootNode.valueSum / this.rootNode.visits : 0;
    const rootWinRate = (rootQ + 1) * 0.5;
    const rootScoreLead = this.rootNode.visits > 0 ? this.rootNode.scoreLeadSum / this.rootNode.visits : 0;
    const rootScoreSelfplay = this.rootNode.visits > 0 ? this.rootNode.scoreMeanSum / this.rootNode.visits : 0;
    const rootScoreMeanSq = this.rootNode.visits > 0 ? this.rootNode.scoreMeanSqSum / this.rootNode.visits : 0;
    const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));

    const edges = this.rootNode.edges ?? [];
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
      moveRows.push({
        edge: e,
        move: e.move,
        visits: child.visits,
        winRate,
        scoreLead,
        scoreSelfplay,
        scoreStdev,
        prior: e.prior,
        pv: buildPv(e, 12),
      });
    }

    moveRows.sort((a, b) => b.visits - a.visits);

    const topMoves = moveRows.slice(0, Math.min(topK, moveRows.length));
    const best = topMoves[0] ?? null;
    const bestScoreLead = best ? best.scoreLead : rootScoreLead;
    const sign = this.currentPlayer === 'black' ? 1 : -1;

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

    const { ownership, ownershipStdev } =
      this.ownershipMode === 'tree'
        ? averageTreeOwnership(this.rootNode)
        : { ownership: this.rootOwnership, ownershipStdev: new Float32Array(BOARD_AREA) };

    return {
      rootWinRate,
      rootScoreLead,
      rootScoreSelfplay,
      rootScoreStdev,
      ownership: Array.from(ownership),
      ownershipStdev: Array.from(ownershipStdev),
      policy: Array.from(this.rootPolicy),
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
  visits?: number;
  maxTimeMs?: number;
  batchSize?: number;
  maxChildren?: number;
}): Promise<{
  rootWinRate: number;
  rootScoreLead: number;
  rootScoreSelfplay: number;
  rootScoreStdev: number;
  ownership: number[]; // len 361, +1 black owns, -1 white owns (tree-averaged)
  ownershipStdev: number[]; // len 361 (tree stdev)
  policy: number[]; // len 362, illegal = -1, pass at index 361
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
  const maxVisits = Math.max(16, Math.min(args.visits ?? 256, 5000));
  const maxTimeMs = Math.max(25, Math.min(args.maxTimeMs ?? 800, 60_000));
  const batchSize = Math.max(1, Math.min(args.batchSize ?? (tf.getBackend() === 'webgpu' ? 16 : 4), 64));
  const maxChildren = Math.max(4, Math.min(args.maxChildren ?? 64, 361));
  const topK = Math.max(1, Math.min(args.topK ?? 10, 50));

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
  for (let i = 0; i < BOARD_AREA; i++) {
    rootOwnership[i] = rootOwnershipSign * Math.tanh(rootEval.ownership[i]!);
  }

  const rootPolicy = new Float32Array(BOARD_AREA + 1);
  expandNode({
    node: rootNode,
    stones: rootPos.stones,
    koPoint: rootPos.koPoint,
    policyLogits: rootEval.policy,
    passLogit: rootEval.passLogit,
    maxChildren,
    libertyMap: rootEval.libertyMap,
    policyOut: rootPolicy,
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
		  rootNode.scoreMeanSqSum = rootEval.blackScoreStdev * rootEval.blackScoreStdev + rootEval.blackScoreMean * rootEval.blackScoreMean;
		  rootNode.utilitySum = rootUtility;
		  rootNode.utilitySqSum = rootUtility * rootUtility;
		  rootNode.nnUtility = rootUtility;

  const sim: SimPosition = { stones: rootStones.slice(), koPoint: rootKoPoint };
  const captureStack: number[] = [];
  const undoMoves: number[] = [];
  const undoPlayers: StoneColor[] = [];
  const undoSnapshots: UndoSnapshot[] = [];
  const pathMoves: RecentMove[] = [];

	  const start = performance.now();

  while (rootNode.visits < maxVisits && performance.now() - start < maxTimeMs) {
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
    while (jobs.length < batchSize && rootNode.visits + jobs.length < maxVisits && performance.now() - start < maxTimeMs) {
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
		        const e = selectEdge(node, node === rootNode);
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

      if (undoMoves.length >= 1) {
        const tmpPos: SimPosition = { stones: leafStones.slice(), koPoint: leafKoPoint };
        const tmpCaps = captureStack.slice();
        const lastIdx = undoMoves.length - 1;
        undoMove(tmpPos, undoMoves[lastIdx]!, undoPlayers[lastIdx]!, undoSnapshots[lastIdx]!, tmpCaps);
        prevStones = tmpPos.stones.slice();
        prevKoPoint = tmpPos.koPoint;

        if (undoMoves.length >= 2) {
          const secondIdx = undoMoves.length - 2;
          undoMove(tmpPos, undoMoves[secondIdx]!, undoPlayers[secondIdx]!, undoSnapshots[secondIdx]!, tmpCaps);
          prevPrevStones = tmpPos.stones.slice();
          prevPrevKoPoint = tmpPos.koPoint;
        } else {
          prevPrevStones = new Uint8Array(rootPrevStones);
          prevPrevKoPoint = rootPrevKoPoint;
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
        currentPlayer: colorToPlayer(player),
        recentMoves: takeRecentMoves(rootMoves, pathMoves, 5),
      });

      for (let i = undoMoves.length - 1; i >= 0; i--) {
        undoMove(sim, undoMoves[i]!, undoPlayers[i]!, undoSnapshots[i]!, captureStack);
      }
    }

    if (jobs.length === 0) break;

    const evals = await evaluateBatch({
      model: args.model,
      includeOwnership: true,
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

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!;
      const ev = evals[i]!;
      if (!ev.ownership) throw new Error('Missing ownership output');

      const ownershipSign = job.currentPlayer === 'black' ? 1 : -1;
      const own = new Float32Array(BOARD_AREA);
      for (let p = 0; p < BOARD_AREA; p++) {
        own[p] = ownershipSign * Math.tanh(ev.ownership[p]!);
      }
      job.leaf.ownership = own;

	      expandNode({
	        node: job.leaf,
	        stones: job.stones,
	        koPoint: job.koPoint,
        policyLogits: ev.policy,
        passLogit: ev.passLogit,
        maxChildren,
	        libertyMap: ev.libertyMap,
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

  const rootQ = rootNode.visits > 0 ? rootNode.valueSum / rootNode.visits : 0;
  const rootWinRate = (rootQ + 1) * 0.5;
  const rootScoreLead = rootNode.visits > 0 ? rootNode.scoreLeadSum / rootNode.visits : 0;
  const rootScoreSelfplay = rootNode.visits > 0 ? rootNode.scoreMeanSum / rootNode.visits : 0;
  const rootScoreMeanSq = rootNode.visits > 0 ? rootNode.scoreMeanSqSum / rootNode.visits : 0;
  const rootScoreStdev = Math.sqrt(Math.max(0, rootScoreMeanSq - rootScoreSelfplay * rootScoreSelfplay));

  const edges = rootNode.edges ?? [];
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
    moveRows.push({
      edge: e,
      move: e.move,
      visits: child.visits,
      winRate,
      scoreLead,
      scoreSelfplay,
      scoreStdev,
      prior: e.prior,
      pv: buildPv(e, 12),
    });
  }

  moveRows.sort((a, b) => b.visits - a.visits);

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
    ownership: Array.from(ownership),
    ownershipStdev: Array.from(ownershipStdev),
    policy: Array.from(rootPolicy),
    moves,
  };
}

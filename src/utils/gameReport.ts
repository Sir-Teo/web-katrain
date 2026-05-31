import type { CandidateMove, GameNode, Player } from '../types';
import { getCurrentLineNodes, type ActiveBranchMap } from './branchNavigation';

const ADDITIONAL_MOVE_ORDER = 999; // KaTrain core/constants.py
const KAYA_PHASE_THRESHOLDS: Record<number, { openingEnd: number; middleEnd: number }> = {
  9: { openingEnd: 15, middleEnd: 40 },
  13: { openingEnd: 30, middleEnd: 80 },
  19: { openingEnd: 50, middleEnd: 150 },
};

export type MovePolicyCategory = 'aiMove' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
export type MovePolicyDistribution = Record<MovePolicyCategory, number> & { total: number };

export const MOVE_POLICY_CATEGORIES: MovePolicyCategory[] = ['aiMove', 'good', 'inaccuracy', 'mistake', 'blunder'];

const POLICY_CATEGORY_ACCURACY: Record<MovePolicyCategory, number> = {
  aiMove: 100,
  good: 80,
  inaccuracy: 50,
  mistake: 20,
  blunder: 0,
};

const POLICY_CLASSIFICATION_THRESHOLDS = {
  goodMaxRank: 3,
  inaccuracyMaxRank: 10,
  mistakeMaxRank: 20,
  goodMinRelativePrior: 0.5,
  inaccuracyMinRelativePrior: 0.1,
  mistakeMinRelativePrior: 0.02,
} as const;

export type GameReportPhase = 'opening' | 'middleGame' | 'endgame';
export type GameReportPhaseFilter = 'all' | GameReportPhase;

export const GAME_REPORT_PHASES: Array<{ key: GameReportPhaseFilter; label: string }> = [
  { key: 'all', label: 'Entire Game' },
  { key: 'opening', label: 'Opening' },
  { key: 'middleGame', label: 'Middle Game' },
  { key: 'endgame', label: 'Endgame' },
];

export function getPhaseThresholds(boardSize: number): { openingEnd: number; middleEnd: number } {
  const size = Math.max(1, Math.trunc(boardSize));
  const known = KAYA_PHASE_THRESHOLDS[size];
  if (known) return known;
  const openingEnd = Math.max(1, Math.round(size * size * 0.16));
  const middleEnd = Math.max(openingEnd + 1, Math.round(size * size * 0.5));
  return { openingEnd, middleEnd };
}

export function getMovePhase(moveNumber: number, boardSize: number): GameReportPhase {
  const move = Math.max(1, Math.trunc(moveNumber));
  const { openingEnd, middleEnd } = getPhaseThresholds(boardSize);
  if (move <= openingEnd) return 'opening';
  if (move <= middleEnd) return 'middleGame';
  return 'endgame';
}

export function getPhaseLabel(phase: GameReportPhaseFilter): string {
  return GAME_REPORT_PHASES.find((item) => item.key === phase)?.label ?? 'Entire Game';
}

export function getPhaseMoveRange(
  boardSize: number,
  phase: GameReportPhaseFilter
): { start: number; end: number } | null {
  if (phase === 'all') return null;
  const { openingEnd, middleEnd } = getPhaseThresholds(boardSize);
  if (phase === 'opening') return { start: 1, end: openingEnd };
  if (phase === 'middleGame') return { start: openingEnd + 1, end: middleEnd };
  return { start: middleEnd + 1, end: Number.MAX_SAFE_INTEGER };
}

function evaluationClass(pointsLost: number, thresholds: number[]): number {
  let i = 0;
  while (i < thresholds.length - 1 && pointsLost < thresholds[i]!) i++;
  return i;
}

export function getPointLossBucket(pointsLost: number, thresholds: number[]): number {
  const safeThresholds = thresholds.length ? thresholds : [12, 6, 3, 1.5, 0.5, 0];
  return evaluationClass(Math.max(0, pointsLost), safeThresholds);
}

function computePointsLostStrict(node: GameNode): number | null {
  const move = node.move;
  const parent = node.parent;
  if (!move || !parent) return null;
  if (!hasReportCandidateMoves(parent) || !hasReportPositionAnalysis(node)) return null;
  const parentScore = parent.analysis?.rootScoreLead;
  const childScore = node.analysis?.rootScoreLead;
  if (typeof parentScore !== 'number' || typeof childScore !== 'number') return null;
  const sign = move.player === 'black' ? 1 : -1;
  return sign * (parentScore - childScore);
}

function hasReportPositionAnalysis(node: GameNode): boolean {
  const analysis = node.analysis;
  if (!analysis) return false;
  if (!Number.isFinite(analysis.rootScoreLead) || !Number.isFinite(analysis.rootWinRate)) return false;
  if (analysis.moves.length > 0) return true;
  return typeof analysis.rootVisits === 'number' && Number.isFinite(analysis.rootVisits) && analysis.rootVisits > 1;
}

function hasReportCandidateMoves(node: GameNode): boolean {
  const analysis = node.analysis;
  if (!analysis || !hasReportPositionAnalysis(node)) return false;
  return analysis.moves.length > 0;
}

function bestCandidateMove(moves: CandidateMove[] | undefined): CandidateMove | null {
  if (!moves || moves.length === 0) return null;
  return moves.find((m) => m.order === 0) ?? moves[0] ?? null;
}

function candidateRank(candidate: CandidateMove, candidates: CandidateMove[]): number {
  if (Number.isFinite(candidate.order) && candidate.order >= 0) return Math.floor(candidate.order) + 1;
  const index = candidates.indexOf(candidate);
  return index >= 0 ? index + 1 : 1;
}

export function classifyMoveByRankAndPolicy(rank: number, relativePrior: number): MovePolicyCategory {
  if (rank === 1) return 'aiMove';

  let rankCategory: MovePolicyCategory;
  if (rank === 0) rankCategory = 'blunder';
  else if (rank <= POLICY_CLASSIFICATION_THRESHOLDS.goodMaxRank) rankCategory = 'good';
  else if (rank <= POLICY_CLASSIFICATION_THRESHOLDS.inaccuracyMaxRank) rankCategory = 'inaccuracy';
  else if (rank <= POLICY_CLASSIFICATION_THRESHOLDS.mistakeMaxRank) rankCategory = 'mistake';
  else rankCategory = 'blunder';

  let priorCategory: MovePolicyCategory;
  if (relativePrior >= 1) priorCategory = 'aiMove';
  else if (relativePrior >= POLICY_CLASSIFICATION_THRESHOLDS.goodMinRelativePrior) priorCategory = 'good';
  else if (relativePrior >= POLICY_CLASSIFICATION_THRESHOLDS.inaccuracyMinRelativePrior) priorCategory = 'inaccuracy';
  else if (relativePrior >= POLICY_CLASSIFICATION_THRESHOLDS.mistakeMinRelativePrior) priorCategory = 'mistake';
  else priorCategory = 'blunder';

  const rankIndex = MOVE_POLICY_CATEGORIES.indexOf(rankCategory);
  const priorIndex = MOVE_POLICY_CATEGORIES.indexOf(priorCategory);
  return MOVE_POLICY_CATEGORIES[Math.min(rankIndex, priorIndex)] ?? 'blunder';
}

function finitePrior(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function createPolicyDistribution(): MovePolicyDistribution {
  return {
    aiMove: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    total: 0,
  };
}

function policyClassification(args: {
  move: { x: number; y: number };
  candidates: CandidateMove[];
  topCandidate: CandidateMove | null;
}): MoveReportEntry['policy'] | undefined {
  const playedCandidate = args.candidates.find((candidate) => candidate.x === args.move.x && candidate.y === args.move.y) ?? null;
  const topPrior = finitePrior(args.topCandidate?.prior);
  const playedPrior = finitePrior(playedCandidate?.prior);
  const relativePrior = topPrior > 0 ? playedPrior / topPrior : 0;
  const rank = playedCandidate ? candidateRank(playedCandidate, args.candidates) : 0;

  return {
    rank,
    playedPrior,
    topPrior,
    relativePrior,
    category: classifyMoveByRankAndPolicy(rank, relativePrior),
  };
}

function xyToGtp(x: number, y: number, boardSize: number): string {
  if (x < 0 || y < 0) return 'pass';
  const col = x >= 8 ? x + 1 : x;
  const letter = String.fromCharCode(65 + col);
  return `${letter}${boardSize - y}`;
}

function nodesForCurrentBranch(currentNode: GameNode, activeBranchChildIds: ActiveBranchMap = {}): GameNode[] {
  return getCurrentLineNodes(currentNode, activeBranchChildIds);
}

export type PlayerReportStats = {
  numMoves: number;
  accuracy?: number;
  complexity?: number;
  meanPtLoss?: number;
  weightedPtLoss?: number;
  totalPtLoss?: number;
  maxPtLoss?: number;
  aiTopMove?: number;
  aiTop5Move?: number;
  policyAccuracy?: number;
  policyDistribution?: MovePolicyDistribution;
};

export type MoveReportEntry = {
  node: GameNode;
  moveNumber: number;
  player: Player;
  move: string;
  pointsLost: number;
  phase: GameReportPhase;
  topMove?: string;
  topCandidate?: CandidateMove;
  isTopMove?: boolean;
  pv?: string[];
  policy?: {
    rank: number;
    playedPrior: number;
    topPrior: number;
    relativePrior: number;
    category: MovePolicyCategory;
  };
};

export type GameReport = {
  thresholds: number[];
  labels: string[];
  histogram: Array<Record<Player, number>>;
  stats: Record<Player, PlayerReportStats>;
  moveEntries: MoveReportEntry[];
  movesInFilter: number;
};

export function computeGameReport(args: {
  currentNode: GameNode;
  thresholds: number[];
  activeBranchChildIds?: ActiveBranchMap;
  depthFilter?: [number, number] | null;
  phaseFilter?: GameReportPhaseFilter;
}): GameReport {
  const thresholds = args.thresholds?.length ? args.thresholds : [12, 6, 3, 1.5, 0.5, 0];
  const depthFilter = args.depthFilter ?? null;
  const phaseFilter = args.phaseFilter ?? 'all';
  const [fromFrac, toFrac] = depthFilter ?? [0, 1e9]; // KaTrain uses fractions of board area.
  const boardSize = args.currentNode.gameState.board.length;
  const boardSquares = boardSize * boardSize;
  const fromDepth = Math.ceil(fromFrac * boardSquares);
  const toDepth = Math.ceil(toFrac * boardSquares);

  const labels = thresholds.map((t, i) => {
    if (i === thresholds.length - 1) return `< ${thresholds[thresholds.length - 2]}`;
    return `>= ${t}`;
  });

  const histogram: Array<Record<Player, number>> = thresholds.map(() => ({ black: 0, white: 0 }));
  const aiTopMoveCount: Record<Player, number> = { black: 0, white: 0 };
  const aiApprovedMoveCount: Record<Player, number> = { black: 0, white: 0 };
  const playerPtLoss: Record<Player, number[]> = { black: [], white: [] };
  const weights: Record<Player, Array<{ weight: number; adj: number }>> = { black: [], white: [] };
  const policyScores: Record<Player, number[]> = { black: [], white: [] };
  const policyDistributions: Record<Player, MovePolicyDistribution> = {
    black: createPolicyDistribution(),
    white: createPolicyDistribution(),
  };
  const moveEntries: MoveReportEntry[] = [];
  let movesInFilter = 0;

  const seq = nodesForCurrentBranch(args.currentNode, args.activeBranchChildIds);
  for (let depth = 0; depth < seq.length; depth++) {
    const n = seq[depth]!;
    const move = n.move;
    if (!move || !n.parent) continue;
    const moveNumber = n.gameState.moveHistory.length;
    const phase = getMovePhase(moveNumber, boardSize);
    if (phaseFilter !== 'all' && phase !== phaseFilter) continue;
    if (depth < fromDepth || depth >= toDepth) continue;
    movesInFilter += 1;
    const pointsLostRaw = computePointsLostStrict(n);
    if (pointsLostRaw == null) continue;
    const pointsLost = Math.max(0, pointsLostRaw);
    const bucket = getPointLossBucket(pointsLost, thresholds);
    const player: Player = move.player;

    const parent = n.parent;
    const cands = parent?.analysis?.moves;
    if (!parent || !cands || cands.length === 0) continue;

    playerPtLoss[player].push(pointsLost);
    histogram[bucket]![player] += 1;

    const top = bestCandidateMove(cands);
    if (top && top.x === move.x && top.y === move.y) aiTopMoveCount[player] += 1;

    const filtered = cands.filter((d) => d.order < ADDITIONAL_MOVE_ORDER && Number.isFinite(d.prior));
    const sumPrior = filtered.reduce((acc, d) => acc + (d.prior ?? 0), 0) || 1e-6;
    const weight =
      filtered.length === 0
        ? 0
        : Math.min(
            1.0,
            filtered.reduce((acc, d) => acc + Math.max(0, d.pointsLost) * (d.prior ?? 0), 0) / sumPrior
          );
    const adj = Math.max(0.05, Math.min(1.0, Math.max(weight, pointsLost / 4)));
    weights[player].push({ weight, adj });

    const approved = filtered.some(
      (d) => (d.order === 0 || (d.pointsLost < 0.5 && d.order < 5)) && d.x === move.x && d.y === move.y
    );
    if (approved) aiApprovedMoveCount[player] += 1;

    const policy = policyClassification({ move, candidates: cands, topCandidate: top });
    if (policy) {
      policyDistributions[player][policy.category] += 1;
      policyDistributions[player].total += 1;
      policyScores[player].push(POLICY_CATEGORY_ACCURACY[policy.category]);
    }

    moveEntries.push({
      node: n,
      moveNumber,
      player,
      move: xyToGtp(move.x, move.y, boardSize),
      pointsLost,
      phase,
      topMove: top ? xyToGtp(top.x, top.y, boardSize) : undefined,
      topCandidate: top ?? undefined,
      isTopMove: top ? top.x === move.x && top.y === move.y : undefined,
      pv: top?.pv,
      policy,
    });
  }

  const stats = (['black', 'white'] as const).reduce<Record<Player, PlayerReportStats>>((acc, player) => {
    const pts = playerPtLoss[player];
    if (pts.length === 0) {
      acc[player] = { numMoves: 0 };
      return acc;
    }

    const ws = weights[player];
    const sumAdj = ws.reduce((a, w) => a + w.adj, 0) || 1e-6;
    const weightedPtLoss = pts.reduce((a, pt, i) => a + pt * (ws[i]?.adj ?? 0), 0) / sumAdj;
    const complexity = ws.reduce((a, w) => a + w.weight, 0) / pts.length;
    const totalPtLoss = pts.reduce((a, pt) => a + pt, 0);
    const meanPtLoss = totalPtLoss / pts.length;
    const accuracy = 100 * Math.pow(0.75, weightedPtLoss);
    const policy = policyScores[player];
    acc[player] = {
      numMoves: pts.length,
      accuracy,
      complexity,
      meanPtLoss,
      weightedPtLoss,
      totalPtLoss,
      maxPtLoss: Math.max(...pts),
      aiTopMove: aiTopMoveCount[player] / pts.length,
      aiTop5Move: aiApprovedMoveCount[player] / pts.length,
      policyAccuracy: policy.length > 0 ? policy.reduce((a, score) => a + score, 0) / policy.length : undefined,
      policyDistribution: { ...policyDistributions[player] },
    };
    return acc;
  }, { black: { numMoves: 0 }, white: { numMoves: 0 } });

  return { thresholds, labels, histogram, stats, moveEntries, movesInFilter };
}

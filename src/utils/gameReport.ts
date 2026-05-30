import type { CandidateMove, GameNode, Player } from '../types';
import { getCurrentLineNodes, type ActiveBranchMap } from './branchNavigation';

const ADDITIONAL_MOVE_ORDER = 999; // KaTrain core/constants.py
const OPENING_BOARD_AREA_FRACTION = 0.16;
const MIDDLE_GAME_BOARD_AREA_FRACTION = 0.5;

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
  const boardSquares = size * size;
  const openingEnd = Math.max(1, Math.round(boardSquares * OPENING_BOARD_AREA_FRACTION));
  const middleEnd = Math.max(openingEnd + 1, Math.round(boardSquares * MIDDLE_GAME_BOARD_AREA_FRACTION));
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
    };
    return acc;
  }, { black: { numMoves: 0 }, white: { numMoves: 0 } });

  return { thresholds, labels, histogram, stats, moveEntries, movesInFilter };
}

import { BOARD_SIZE, type CandidateMove, type GameNode, type Player } from '../types';

const ADDITIONAL_MOVE_ORDER = 999; // KaTrain core/constants.py

function evaluationClass(pointsLost: number, thresholds: number[]): number {
  let i = 0;
  while (i < thresholds.length - 1 && pointsLost < thresholds[i]!) i++;
  return i;
}

function computePointsLostStrict(node: GameNode): number | null {
  const move = node.move;
  const parent = node.parent;
  if (!move || !parent) return null;
  const parentScore = parent.analysis?.rootScoreLead;
  const childScore = node.analysis?.rootScoreLead;
  if (typeof parentScore !== 'number' || typeof childScore !== 'number') return null;
  const sign = move.player === 'black' ? 1 : -1;
  return sign * (parentScore - childScore);
}

function bestCandidateMove(moves: CandidateMove[] | undefined): CandidateMove | null {
  if (!moves || moves.length === 0) return null;
  return moves.find((m) => m.order === 0) ?? moves[0] ?? null;
}

function nodesForCurrentBranch(currentNode: GameNode): GameNode[] {
  const path: GameNode[] = [];
  let cursor: GameNode | null = currentNode;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parent;
  }
  path.reverse();

  cursor = currentNode;
  while (cursor.children.length > 0) {
    cursor = cursor.children[0]!;
    path.push(cursor);
  }
  return path;
}

export type PlayerReportStats = {
  numMoves: number;
  accuracy?: number;
  complexity?: number;
  meanPtLoss?: number;
  weightedPtLoss?: number;
  aiTopMove?: number;
  aiTop5Move?: number;
};

export type GameReport = {
  thresholds: number[];
  labels: string[];
  histogram: Array<Record<Player, number>>;
  stats: Record<Player, PlayerReportStats>;
};

export function computeGameReport(args: {
  currentNode: GameNode;
  thresholds: number[];
  depthFilter?: [number, number] | null;
}): GameReport {
  const thresholds = args.thresholds?.length ? args.thresholds : [12, 6, 3, 1.5, 0.5, 0];
  const depthFilter = args.depthFilter ?? null;
  const [fromFrac, toFrac] = depthFilter ?? [0, 1e9]; // KaTrain uses fractions of board area.
  const boardSquares = BOARD_SIZE * BOARD_SIZE;
  const fromDepth = Math.ceil(fromFrac * boardSquares);
  const toDepth = Math.ceil(toFrac * boardSquares);

  const labels = thresholds.map((t, i) => {
    if (i === thresholds.length - 1) return `< ${thresholds[thresholds.length - 2]}`;
    return `≥ ${t}`;
  });

  const histogram: Array<Record<Player, number>> = thresholds.map(() => ({ black: 0, white: 0 }));
  const aiTopMoveCount: Record<Player, number> = { black: 0, white: 0 };
  const aiApprovedMoveCount: Record<Player, number> = { black: 0, white: 0 };
  const playerPtLoss: Record<Player, number[]> = { black: [], white: [] };
  const weights: Record<Player, Array<{ weight: number; adj: number }>> = { black: [], white: [] };

  const seq = nodesForCurrentBranch(args.currentNode);
  for (let depth = 0; depth < seq.length; depth++) {
    const n = seq[depth]!;
    const move = n.move;
    if (!move || !n.parent) continue;
    if (depth < fromDepth || depth >= toDepth) continue;
    const pointsLostRaw = computePointsLostStrict(n);
    if (pointsLostRaw == null) continue;
    const pointsLost = Math.max(0, pointsLostRaw);
    const cls = evaluationClass(pointsLost, thresholds);
    const bucket = thresholds.length - 1 - cls;
    const player: Player = move.player;

    playerPtLoss[player].push(pointsLost);
    histogram[bucket]![player] += 1;

    const parent = n.parent;
    const cands = parent?.analysis?.moves;
    if (!parent || !cands || cands.length === 0) {
      weights[player].push({ weight: 0, adj: Math.max(0.05, Math.min(1.0, pointsLost / 4)) });
      continue;
    }

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
    const meanPtLoss = pts.reduce((a, pt) => a + pt, 0) / pts.length;
    const accuracy = 100 * Math.pow(0.75, weightedPtLoss);
    acc[player] = {
      numMoves: pts.length,
      accuracy,
      complexity,
      meanPtLoss,
      weightedPtLoss,
      aiTopMove: aiTopMoveCount[player] / pts.length,
      aiTop5Move: aiApprovedMoveCount[player] / pts.length,
    };
    return acc;
  }, { black: { numMoves: 0 }, white: { numMoves: 0 } });

  return { thresholds, labels, histogram, stats };
}

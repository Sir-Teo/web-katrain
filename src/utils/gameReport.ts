import type { CandidateMove, GameNode, Player } from '../types';
import { isReportReadyAnalysis } from './analysisCoverage';
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
export type GameReportMistakeSort = 'loss' | 'policy';

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

export function getPhaseAnalysisMoveRange(boardSize: number, phase: GameReportPhaseFilter): [number, number] | null {
  const range = getPhaseMoveRange(boardSize, phase);
  if (!range) return null;
  const start = Math.max(0, range.start - 1);
  const end = range.end === Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : Math.max(start, range.end - 1);
  return [start, end];
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
  return isReportReadyAnalysis(node.analysis);
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
  meanPtSwing?: number;
  totalPtSwing?: number;
  maxPtLoss?: number;
  aiTopMove?: number;
  aiTop5Move?: number;
  aiApprovedMove?: number;
  policyAccuracy?: number;
  policyDistribution?: MovePolicyDistribution;
};

export type MoveReportEntry = {
  node: GameNode;
  moveNumber: number;
  player: Player;
  move: string;
  pointsLost: number;
  pointsGained: number;
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  scoreSwing: number;
  winRateBefore: number;
  winRateAfter: number;
  winRateDelta: number;
  winRateSwing: number;
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

export type GameReportStudyFocus = {
  phase: GameReportPhaseFilter;
  player: Player;
  score: number;
  analyzedMoves: number;
  weightedPtLoss: number;
  meanPtLoss: number;
  policyAccuracy?: number;
  topEntry?: MoveReportEntry;
  policyProblem?: {
    category: MovePolicyCategory;
    count: number;
    ratio: number;
  };
  issueLabel: string;
  beginnerTip: string;
  proTip: string;
};

function playerLabel(player: Player): string {
  return player === 'black' ? 'Black' : 'White';
}

export function describeReportSwing(entry: MoveReportEntry): string {
  const player = playerLabel(entry.player);
  const wasLeadingBefore =
    (entry.player === 'black' && entry.scoreBefore > 0) ||
    (entry.player === 'white' && entry.scoreBefore < 0);
  const isLeadingAfter =
    (entry.player === 'black' && entry.scoreAfter > 0) ||
    (entry.player === 'white' && entry.scoreAfter < 0);

  if (!wasLeadingBefore && isLeadingAfter) return `${player} takes the lead`;
  if (wasLeadingBefore && !isLeadingAfter) return `${player} loses the lead`;
  if (entry.pointsLost > 0) return `${player} loses ${entry.pointsLost.toFixed(1)} points`;
  if (entry.pointsGained > 0) return `${player} gains ${entry.pointsGained.toFixed(1)} points`;

  const side = entry.scoreDelta >= 0 ? 'Black' : 'White';
  return `${side} gains ${entry.scoreSwing.toFixed(1)} points`;
}

const POLICY_CATEGORY_SEVERITY: Record<MovePolicyCategory, number> = {
  aiMove: 0,
  good: 1,
  inaccuracy: 2,
  mistake: 3,
  blunder: 4,
};

function policySeverity(entry: MoveReportEntry): number {
  return entry.policy ? POLICY_CATEGORY_SEVERITY[entry.policy.category] : -1;
}

export function sortMoveReportEntries(
  entries: MoveReportEntry[],
  sort: GameReportMistakeSort = 'loss'
): MoveReportEntry[] {
  const sorted = [...entries];
  if (sort === 'policy') {
    sorted.sort((a, b) => {
      const severityDiff = policySeverity(b) - policySeverity(a);
      if (severityDiff !== 0) return severityDiff;

      const aPrior = a.policy?.relativePrior ?? Number.POSITIVE_INFINITY;
      const bPrior = b.policy?.relativePrior ?? Number.POSITIVE_INFINITY;
      const priorDiff = aPrior - bPrior;
      if (priorDiff !== 0) return priorDiff;

      const rankDiff = (b.policy?.rank ?? -1) - (a.policy?.rank ?? -1);
      if (rankDiff !== 0) return rankDiff;

      const lossDiff = b.pointsLost - a.pointsLost;
      if (lossDiff !== 0) return lossDiff;

      return a.moveNumber - b.moveNumber;
    });
    return sorted;
  }

  sorted.sort((a, b) => {
    const lossDiff = b.pointsLost - a.pointsLost;
    if (lossDiff !== 0) return lossDiff;
    return a.moveNumber - b.moveNumber;
  });
  return sorted;
}

export function getReportTurningPoints(
  entries: MoveReportEntry[],
  threshold = 5,
  limit = 5
): MoveReportEntry[] {
  return [...entries]
    .filter((entry) => entry.scoreSwing >= threshold)
    .sort((a, b) => {
      const swingDiff = b.scoreSwing - a.scoreSwing;
      if (swingDiff !== 0) return swingDiff;
      return a.moveNumber - b.moveNumber;
    })
    .slice(0, limit);
}

export function getReportRecoveries(
  entries: MoveReportEntry[],
  threshold = 1.5,
  limit = 5
): MoveReportEntry[] {
  return [...entries]
    .filter((entry) => entry.pointsGained >= threshold)
    .sort((a, b) => {
      const gainDiff = b.pointsGained - a.pointsGained;
      if (gainDiff !== 0) return gainDiff;
      return a.moveNumber - b.moveNumber;
    })
    .slice(0, limit);
}

function getMostSeverePolicyProblem(distribution: MovePolicyDistribution | undefined): GameReportStudyFocus['policyProblem'] {
  if (!distribution || distribution.total <= 0) return undefined;
  const problemCategories: MovePolicyCategory[] = ['blunder', 'mistake', 'inaccuracy'];
  let best: { category: MovePolicyCategory; count: number } | null = null;
  for (const category of problemCategories) {
    const count = distribution[category] ?? 0;
    if (count <= 0) continue;
    if (!best || count > best.count) best = { category, count };
  }
  if (!best) return undefined;
  return {
    category: best.category,
    count: best.count,
    ratio: best.count / distribution.total,
  };
}

function studyFocusIssueLabel(args: {
  topEntry: MoveReportEntry | undefined;
  policyProblem: GameReportStudyFocus['policyProblem'];
  weightedPtLoss: number;
}): string {
  const { topEntry, policyProblem, weightedPtLoss } = args;
  if (topEntry && topEntry.pointsLost >= 3) {
    return `Review move ${topEntry.moveNumber}: ${topEntry.pointsLost.toFixed(1)} points lost`;
  }
  if (policyProblem && policyProblem.category !== 'inaccuracy') {
    const label = policyProblem.category === 'blunder' ? 'blunders' : 'mistakes';
    return `Fix candidate generation: ${policyProblem.count} ${label}`;
  }
  return `Tighten consistency: ${weightedPtLoss.toFixed(1)} weighted loss`;
}

function studyFocusBeginnerTip(topEntry: MoveReportEntry | undefined): string {
  if (!topEntry) return 'Review this phase slowly and explain each move before checking the engine.';
  const topMove = topEntry.topMove ? `, then compare with ${topEntry.topMove}` : '';
  return `Replay move ${topEntry.moveNumber} from the previous position, name two candidate moves${topMove}.`;
}

function studyFocusProTip(args: {
  phase: GameReportPhaseFilter;
  player: Player;
  policyProblem: GameReportStudyFocus['policyProblem'];
}): string {
  const phaseLabel = getPhaseLabel(args.phase).toLowerCase();
  const playerLabel = args.player === 'black' ? 'Black' : 'White';
  if (args.policyProblem) {
    return `Filter ${playerLabel} in ${phaseLabel} by ${args.policyProblem.category} quality and check why the played prior fell behind.`;
  }
  return `Filter ${playerLabel} in ${phaseLabel} by Loss and compare score lead before and after each swing.`;
}

export function getReportStudyFocus(args: {
  reportsByPhase: Partial<Record<GameReportPhaseFilter, GameReport>>;
  phaseFilter?: GameReportPhaseFilter;
  playerFilter?: 'all' | Player;
}): GameReportStudyFocus | null {
  const requestedPhase = args.phaseFilter ?? 'all';
  const phaseGroups: GameReportPhaseFilter[][] =
    requestedPhase === 'all' ? [['opening', 'middleGame', 'endgame'], ['all']] : [[requestedPhase]];
  const players: Player[] = args.playerFilter && args.playerFilter !== 'all' ? [args.playerFilter] : ['black', 'white'];

  for (const phases of phaseGroups) {
    let best: GameReportStudyFocus | null = null;
    for (const phase of phases) {
      const report = args.reportsByPhase[phase];
      if (!report) continue;
      for (const player of players) {
        const stats = report.stats[player];
        if (!stats || stats.numMoves <= 0) continue;

        const entries = sortMoveReportEntries(
          report.moveEntries.filter((entry) => entry.player === player),
          'loss'
        );
        const topEntry = entries[0];
        const policyProblem = getMostSeverePolicyProblem(stats.policyDistribution);
        const weightedPtLoss = stats.weightedPtLoss ?? stats.meanPtLoss ?? 0;
        const meanPtLoss = stats.meanPtLoss ?? 0;
        const maxPtLoss = stats.maxPtLoss ?? topEntry?.pointsLost ?? 0;
        const policyPenalty = typeof stats.policyAccuracy === 'number' ? Math.max(0, (100 - stats.policyAccuracy) / 25) : 0;
        const severePolicyRatio =
          ((stats.policyDistribution?.blunder ?? 0) + (stats.policyDistribution?.mistake ?? 0)) /
          Math.max(1, stats.policyDistribution?.total ?? 0);
        const score = weightedPtLoss + maxPtLoss * 0.25 + policyPenalty + severePolicyRatio * 4;
        const focus: GameReportStudyFocus = {
          phase,
          player,
          score,
          analyzedMoves: stats.numMoves,
          weightedPtLoss,
          meanPtLoss,
          policyAccuracy: stats.policyAccuracy,
          topEntry,
          policyProblem,
          issueLabel: studyFocusIssueLabel({ topEntry, policyProblem, weightedPtLoss }),
          beginnerTip: studyFocusBeginnerTip(topEntry),
          proTip: studyFocusProTip({ phase, player, policyProblem }),
        };

        if (
          !best ||
          focus.score > best.score ||
          (focus.score === best.score && (focus.topEntry?.moveNumber ?? Number.MAX_SAFE_INTEGER) < (best.topEntry?.moveNumber ?? Number.MAX_SAFE_INTEGER))
        ) {
          best = focus;
        }
      }
    }
    if (best) return best;
  }

  return null;
}

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
  const aiTop5MoveCount: Record<Player, number> = { black: 0, white: 0 };
  const aiApprovedMoveCount: Record<Player, number> = { black: 0, white: 0 };
  const playerPtLoss: Record<Player, number[]> = { black: [], white: [] };
  const playerPtSwing: Record<Player, number[]> = { black: [], white: [] };
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
    const parent = n.parent;
    const parentScore = parent.analysis?.rootScoreLead;
    const childScore = n.analysis?.rootScoreLead;
    const parentWinRate = parent.analysis?.rootWinRate;
    const childWinRate = n.analysis?.rootWinRate;
    if (typeof parentScore !== 'number' || typeof childScore !== 'number') continue;
    if (typeof parentWinRate !== 'number' || typeof childWinRate !== 'number') continue;
    const pointsLost = Math.max(0, pointsLostRaw);
    const pointsGained = Math.max(0, -pointsLostRaw);
    const scoreDelta = childScore - parentScore;
    const scoreSwing = Math.abs(scoreDelta);
    const winRateDelta = childWinRate - parentWinRate;
    const bucket = getPointLossBucket(pointsLost, thresholds);
    const player: Player = move.player;
    const winRateSwing = player === 'black' ? winRateDelta : -winRateDelta;

    const cands = parent?.analysis?.moves;
    if (!parent || !cands || cands.length === 0) continue;

    playerPtLoss[player].push(pointsLost);
    playerPtSwing[player].push(pointsGained - pointsLost);
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
      if (policy.rank >= 1 && policy.rank <= 5) aiTop5MoveCount[player] += 1;
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
      pointsGained,
      scoreBefore: parentScore,
      scoreAfter: childScore,
      scoreDelta,
      scoreSwing,
      winRateBefore: parentWinRate,
      winRateAfter: childWinRate,
      winRateDelta,
      winRateSwing,
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
    const swings = playerPtSwing[player];
    const totalPtSwing = swings.reduce((a, pt) => a + pt, 0);
    const meanPtSwing = totalPtSwing / pts.length;
    const accuracy = 100 * Math.pow(0.75, weightedPtLoss);
    const policy = policyScores[player];
    acc[player] = {
      numMoves: pts.length,
      accuracy,
      complexity,
      meanPtLoss,
      weightedPtLoss,
      totalPtLoss,
      meanPtSwing,
      totalPtSwing,
      maxPtLoss: Math.max(...pts),
      aiTopMove: aiTopMoveCount[player] / pts.length,
      aiTop5Move: aiTop5MoveCount[player] / pts.length,
      aiApprovedMove: aiApprovedMoveCount[player] / pts.length,
      policyAccuracy: policy.length > 0 ? policy.reduce((a, score) => a + score, 0) / policy.length : undefined,
      policyDistribution: { ...policyDistributions[player] },
    };
    return acc;
  }, { black: { numMoves: 0 }, white: { numMoves: 0 } });

  return { thresholds, labels, histogram, stats, moveEntries, movesInFilter };
}

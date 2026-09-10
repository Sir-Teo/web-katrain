import type { AnalysisResult, CandidateMove, GameNode } from '../types';
import { formatAnalysisScoreLead, formatAnalysisWinRate } from './analysisSummary';
import { formatBoardMoveLabel } from '../lib/gtp';
import { formatVisitCount } from './visitPresets';

export interface BestMoveSummary {
  moveLabel: string;
  detailLabel: string;
  title: string;
}

function candidateOrder(candidate: CandidateMove, fallbackIndex: number): number {
  return Number.isFinite(candidate.order) && candidate.order >= 0 ? candidate.order : fallbackIndex;
}

function bestCandidate(moves: CandidateMove[]): { candidate: CandidateMove; rank: number } | null {
  if (moves.length === 0) return null;

  let best = moves[0]!;
  let bestIndex = 0;
  let bestOrder = candidateOrder(best, 0);
  for (let i = 1; i < moves.length; i += 1) {
    const candidate = moves[i]!;
    const order = candidateOrder(candidate, i);
    if (order < bestOrder) {
      best = candidate;
      bestIndex = i;
      bestOrder = order;
    }
  }

  return { candidate: best, rank: Math.floor(candidateOrder(best, bestIndex)) + 1 };
}

export function formatPolicyPrior(prior: number | null | undefined): string | null {
  if (typeof prior !== 'number' || !Number.isFinite(prior) || prior <= 0) return null;
  const pct = prior * 100;
  const places = pct < 10 ? 1 : 0;
  return `${pct.toFixed(places)}%`;
}

export function getBestMoveSummary(analysis: AnalysisResult | null | undefined, boardSize: number): BestMoveSummary | null {
  const best = bestCandidate(analysis?.moves ?? []);
  if (!best) return null;

  const move = best.candidate;
  const moveLabel = formatBoardMoveLabel(move, boardSize);
  const policyPrior = formatPolicyPrior(move.prior);
  const visitsLabel = `${formatVisitCount(move.visits)} visits`;
  const rankLabel = best.rank === 1 ? null : `#${best.rank}`;
  const detailLabel = [rankLabel, policyPrior ? `${policyPrior} policy` : visitsLabel].filter(Boolean).join(' · ');

  const titleParts = [
    `Best move ${moveLabel}`,
    rankLabel ? `candidate ${rankLabel}` : null,
    visitsLabel,
    policyPrior ? `${policyPrior} policy prior` : null,
    `score ${formatAnalysisScoreLead(move.scoreLead)}`,
    `black win ${formatAnalysisWinRate(move.winRate)}`,
  ].filter(Boolean);

  return {
    moveLabel,
    detailLabel,
    title: titleParts.join(' - '),
  };
}

export function getCurrentNodeBestMoveSummary(
  node: Pick<GameNode, 'analysis' | 'gameState'>
): BestMoveSummary | null {
  return getBestMoveSummary(node.analysis, node.gameState.board.length);
}

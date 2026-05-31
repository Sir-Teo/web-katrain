import type { CandidateMove, GameNode, Move, Player } from '../types';
import { summarizePointsLost, type PointsLostSummary } from './analysisSummary';
import { getActiveChild, type ActiveBranchMap } from './branchNavigation';
import { computeNodePointsLost } from './nodeAnalysis';

export interface PlayedMoveQuality {
  moveLabel: string;
  playerLabel: 'B' | 'W';
  rank: number | null;
  rankLabel: string;
  valueLabel: string;
  detailLabel: string;
  tone: PointsLostSummary['tone'];
  title: string;
}

function playerLabel(player: Player): 'B' | 'W' {
  return player === 'black' ? 'B' : 'W';
}

export function formatBoardMoveLabel(move: Pick<Move, 'x' | 'y'>, boardSize = 19): string {
  if (move.x < 0 || move.y < 0) return 'Pass';
  const column = String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x));
  return `${column}${boardSize - move.y}`;
}

function candidateRank(candidate: CandidateMove, candidates: CandidateMove[]): number {
  if (Number.isFinite(candidate.order) && candidate.order >= 0) return Math.floor(candidate.order) + 1;
  const index = candidates.indexOf(candidate);
  return index >= 0 ? index + 1 : 1;
}

function findBestCandidate(candidates: CandidateMove[]): CandidateMove | null {
  return candidates.find((candidate) => candidate.order === 0) ?? candidates[0] ?? null;
}

export function getPlayedMoveQuality(
  node: GameNode,
  pointsLostOverride?: number | null
): PlayedMoveQuality | null {
  const move = node.move;
  const parent = node.parent;
  if (!move || !parent) return null;

  const candidates = parent.analysis?.moves ?? [];
  const candidate = candidates.find((item) => item.x === move.x && item.y === move.y) ?? null;
  const pointsLost = typeof pointsLostOverride === 'number' && Number.isFinite(pointsLostOverride)
    ? pointsLostOverride
    : computeNodePointsLost(node);

  if (!candidate && typeof pointsLost !== 'number') return null;

  const rank = candidate ? candidateRank(candidate, candidates) : null;
  const boardSize = node.gameState.board.length;
  const moveLabel = formatBoardMoveLabel(move, boardSize);
  const side = playerLabel(move.player);
  const rankLabel = rank ? `#${rank}` : 'Unranked';
  const summary = summarizePointsLost(pointsLost);
  const valueLabel = summary.label === '-' && rank === 1 ? 'Best' : summary.label;
  const tone = valueLabel === 'Best' ? 'success' : summary.tone;
  const bestCandidate = findBestCandidate(candidates);
  const bestLabel = bestCandidate ? formatBoardMoveLabel(bestCandidate, boardSize) : null;

  const titleParts = [`${side} ${moveLabel}`];
  if (rank) titleParts.push(`engine candidate ${rankLabel}`);
  if (summary.label !== '-') titleParts.push(summary.label.toLowerCase());
  if (bestLabel && bestLabel !== moveLabel) titleParts.push(`best was ${bestLabel}`);

  return {
    moveLabel,
    playerLabel: side,
    rank,
    rankLabel,
    valueLabel,
    detailLabel: rank ? `${side} ${moveLabel} ${rankLabel}` : `${side} ${moveLabel}`,
    tone,
    title: titleParts.join(' - '),
  };
}

export function getNextMoveQuality(
  node: GameNode,
  activeBranches: ActiveBranchMap = {}
): PlayedMoveQuality | null {
  const nextNode = getActiveChild(node, activeBranches);
  return nextNode ? getPlayedMoveQuality(nextNode) : null;
}

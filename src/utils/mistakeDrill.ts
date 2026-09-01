import type { CandidateMove, GameNode, Player } from '../types';
import { getActiveChild, type ActiveBranchMap } from './branchNavigation';
import { computeNodePointsLost } from './nodeAnalysis';
import { formatBoardMoveLabel } from './playedMoveQuality';

/**
 * Walking your own mistakes and being asked to find the better move.
 *
 * A review that only *shows* the engine's answer is read, agreed with and
 * forgotten. The value is in being put back into the position with the answer
 * hidden and having to commit to a move -- which is why every strong chess site
 * ships this and why it is the one review surface people actually finish.
 *
 * The drill deliberately grades against what the engine already worked out for
 * the position, rather than starting a new search: the numbers a player sees
 * here are then the same ones the rest of the app showed them, and a drill can
 * run instantly on a reviewed game with no engine at all.
 */

export type DrillSide = 'both' | 'black' | 'white';

export interface DrillMistake {
  /** The node holding the move that was actually played. */
  nodeId: string;
  /** The position the drill puts the player back into: the parent of that move. */
  parentNodeId: string;
  /** 1-based move number of the played move within the line. */
  moveNumber: number;
  /** Who has to find the better move. */
  player: Player;
  /** What the played move gave up, in points. */
  pointsLost: number;
  /** Where it was played, for the reveal. */
  played: { x: number; y: number };
}

/** How close to the engine's own pick still counts as solving the position. */
export const DRILL_CLOSE_ENOUGH_LOSS = 1;

export type DrillVerdictKind =
  /** The engine's own first choice. */
  | 'best'
  /** Not the top move, but close enough to it to count. */
  | 'good'
  /** Better than what was played, but still gives up more than it should. */
  | 'better'
  /** No better than the move being drilled. */
  | 'miss';

export interface DrillVerdict {
  kind: DrillVerdictKind;
  /** Label of the guessed point, e.g. `Q16`. */
  guessLabel: string;
  /** Label of the engine's own pick. */
  bestLabel: string;
  /**
   * What the guess gives up, or null when the engine never evaluated that point
   * -- which is not the same as knowing it is bad, and is not reported as if it
   * were.
   */
  guessPointsLost: number | null;
  /** What the move actually played gave up, for the comparison. */
  playedPointsLost: number;
}

function bestCandidate(moves: readonly CandidateMove[]): CandidateMove | null {
  return moves.find((move) => move.order === 0) ?? moves[0] ?? null;
}

/**
 * The mistakes on the line currently being reviewed, in the order they were
 * played.
 *
 * Only nodes whose parent carries analysis can be drilled: without it there is
 * nothing to grade an answer against. Passes are skipped -- "find a better
 * move" has no board answer when the move under discussion was not on the
 * board.
 */
export function collectDrillMistakes(args: {
  rootNode: GameNode;
  activeBranchChildIds?: ActiveBranchMap;
  /** Points lost at or above which a move counts as a mistake. */
  threshold: number;
  side?: DrillSide;
}): DrillMistake[] {
  const { rootNode, activeBranchChildIds = {}, threshold, side = 'both' } = args;
  const mistakes: DrillMistake[] = [];

  let node: GameNode | null = rootNode;
  while (node) {
    const child: GameNode | null = getActiveChild(node, activeBranchChildIds);
    if (!child) break;
    const move = child.move;
    const parentMoves = node.analysis?.moves;
    if (move && move.x >= 0 && move.y >= 0 && parentMoves?.length && (side === 'both' || move.player === side)) {
      const pointsLost = computeNodePointsLost(child);
      if (typeof pointsLost === 'number' && Number.isFinite(pointsLost) && pointsLost >= threshold) {
        mistakes.push({
          nodeId: child.id,
          parentNodeId: node.id,
          moveNumber: child.gameState.moveHistory.length,
          player: move.player,
          pointsLost,
          played: { x: move.x, y: move.y },
        });
      }
    }
    node = child;
  }

  return mistakes;
}

/**
 * Grades a guess against the analysis the drilled position already carries.
 *
 * `parentNode` is the position being drilled, so its candidates are the moves
 * available to the player who is about to go wrong.
 */
export function gradeDrillGuess(
  parentNode: GameNode,
  guess: { x: number; y: number },
  playedPointsLost: number
): DrillVerdict | null {
  const moves = parentNode.analysis?.moves;
  if (!moves?.length) return null;
  const best = bestCandidate(moves);
  if (!best) return null;

  const boardSize = parentNode.gameState.board.length;
  const bestLabel = formatBoardMoveLabel(best, boardSize);
  const guessLabel = formatBoardMoveLabel(guess, boardSize);

  if (best.x === guess.x && best.y === guess.y) {
    return { kind: 'best', guessLabel, bestLabel, guessPointsLost: 0, playedPointsLost };
  }

  const candidate = moves.find((move) => move.x === guess.x && move.y === guess.y);
  const guessPointsLost =
    typeof candidate?.pointsLost === 'number' && Number.isFinite(candidate.pointsLost)
      ? candidate.pointsLost
      : null;

  if (guessPointsLost === null) {
    // The engine never looked at this point, so the only honest thing to say is
    // that it did not consider it -- reporting it as a miss would be claiming a
    // measurement nobody made.
    return { kind: 'miss', guessLabel, bestLabel, guessPointsLost: null, playedPointsLost };
  }
  if (guessPointsLost <= DRILL_CLOSE_ENOUGH_LOSS) {
    return { kind: 'good', guessLabel, bestLabel, guessPointsLost, playedPointsLost };
  }
  // "Better" has to mean better by enough to be a real difference; landing
  // within a rounding error of the move being drilled is not an improvement.
  if (guessPointsLost <= playedPointsLost - DRILL_CLOSE_ENOUGH_LOSS) {
    return { kind: 'better', guessLabel, bestLabel, guessPointsLost, playedPointsLost };
  }
  return { kind: 'miss', guessLabel, bestLabel, guessPointsLost, playedPointsLost };
}

/** True when the answer was good enough to count the position as solved. */
export function isDrillSolved(kind: DrillVerdictKind): boolean {
  return kind === 'best' || kind === 'good';
}

export function drillPromptText(mistake: DrillMistake, index: number, total: number): string {
  const side = mistake.player === 'black' ? 'Black' : 'White';
  return (
    `${index + 1} of ${total} · move ${mistake.moveNumber}: ${side} gave up ` +
    `${mistake.pointsLost.toFixed(1)} points here. Find a better move.`
  );
}

export function drillVerdictText(verdict: DrillVerdict): string {
  switch (verdict.kind) {
    case 'best':
      return `${verdict.guessLabel} is the engine's own move. Solved.`;
    case 'good':
      return (
        `${verdict.guessLabel} gives up ${(verdict.guessPointsLost ?? 0).toFixed(1)} points — ` +
        `good enough. The engine plays ${verdict.bestLabel}.`
      );
    case 'better':
      return (
        `${verdict.guessLabel} loses ${(verdict.guessPointsLost ?? 0).toFixed(1)} instead of ` +
        `${verdict.playedPointsLost.toFixed(1)} — better, but ${verdict.bestLabel} is the move.`
      );
    default:
      return verdict.guessPointsLost === null
        ? `The engine did not consider ${verdict.guessLabel}. It plays ${verdict.bestLabel}.`
        : `${verdict.guessLabel} still loses ${verdict.guessPointsLost.toFixed(1)}. The engine plays ${verdict.bestLabel}.`;
  }
}

export function drillSummaryText(solved: number, total: number): string {
  if (total === 0) return 'No mistakes to drill on this line.';
  if (solved === total) return `Found a better move in all ${total}. Drill complete.`;
  return `Drill complete: ${solved} of ${total} found.`;
}

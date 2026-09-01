import React, { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { isDrillHidingAnswer } from '../utils/mistakeDrill';
import type { CandidateMove } from '../types';
import { DEFAULT_EVAL_THRESHOLDS, getEvaluationClass } from '../utils/nodeAnalysis';
import { evalColorToCss, getKaTrainEvalColors } from '../utils/katrainTheme';
import { formatBoardMoveLabel } from '../utils/playedMoveQuality';
import {
  formatCandidatePointsLost,
  formatCandidateScore,
  formatCandidateVisits,
  formatCandidateWinRate,
} from '../utils/candidateMoveFormat';

/**
 * The engine's candidates as a list, not as circles on the board.
 *
 * The board already says which moves the engine likes and roughly how much, in
 * the place where that matters. What it cannot do is let you read five moves
 * against each other: the labels are sized to fit inside a stone, they carry at
 * most two numbers, and half of them are hidden behind the position. Comparing
 * the top move's score with the fourth's meant hovering each one in turn and
 * remembering the last.
 *
 * Hovering a row lays that move's variation on the board, which is the same
 * thing hovering the point does. Clicking the row that is already on the board
 * plays the move -- which on a touchscreen, where no hover arrives first, makes
 * it tap to preview and tap again to commit.
 */

interface CandidateMoveListProps {
  /** `${x},${y}` of the row whose variation is on the board, or null. */
  hoveredKey: string | null;
  /** Put a candidate's variation on the board (null clears it). */
  onHover: (move: CandidateMove | null) => void;
  /** How many rows to show before the list scrolls. */
  maxRows?: number;
}

const moveKey = (move: CandidateMove) => `${move.x},${move.y}`;

export const CandidateMoveList: React.FC<CandidateMoveListProps> = ({ hoveredKey, onHover, maxRows = 8 }) => {
  const { moves, boardSize, playMove, trainerTheme, thresholds, isAnalysisMode } = useGameStore(
    (state) => ({
      // A drill asking about this position is asking for exactly this list.
      moves: isDrillHidingAnswer(state.mistakeDrill, state.currentNode.id)
        ? null
        : state.currentNode.analysis?.moves ?? null,
      boardSize: state.currentNode.gameState.board.length,
      playMove: state.playMove,
      trainerTheme: state.settings.trainerTheme,
      thresholds: state.settings.trainerEvalThresholds,
      isAnalysisMode: state.isAnalysisMode,
    }),
    shallow
  );

  const evalColors = useMemo(() => getKaTrainEvalColors(trainerTheme), [trainerTheme]);
  const evalThresholds = thresholds.length > 0 ? thresholds : DEFAULT_EVAL_THRESHOLDS;

  const rows = useMemo(
    () => (moves ?? []).filter((move) => move.x >= 0 && move.y >= 0).slice(0, 24),
    [moves]
  );

  if (rows.length === 0) {
    return (
      <div className="px-3 py-2 text-[0.6875rem] ui-text-faint">
        {isAnalysisMode ? 'No candidates for this position yet.' : 'Turn on analysis to rank the moves here.'}
      </div>
    );
  }

  return (
    <div
      className="candidate-list"
      style={{ maxHeight: `calc(${maxRows} * var(--candidate-row-height, 1.75rem) + 1.5rem)` }}
    >
      <div className="candidate-list-head" aria-hidden="true">
        <span className="cl-rank">#</span>
        <span className="cl-move">Move</span>
        <span className="cl-num">Win</span>
        <span className="cl-num">Score</span>
        <span className="cl-num">Lost</span>
        <span className="cl-num">Visits</span>
      </div>
      <ul className="candidate-list-rows">
        {rows.map((move, index) => {
          const key = moveKey(move);
          const label = formatBoardMoveLabel(move, boardSize);
          const cls = getEvaluationClass(move.pointsLost, evalThresholds, evalColors.length);
          const dot = evalColorToCss(evalColors[cls] ?? evalColors[evalColors.length - 1]!);
          const rank = Number.isFinite(move.order) && move.order >= 0 ? move.order + 1 : index + 1;
          return (
            <li key={key}>
              <button
                type="button"
                className={`candidate-row${hoveredKey === key ? ' is-active' : ''}`}
                onMouseEnter={() => onHover(move)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(move)}
                onBlur={() => onHover(null)}
                onClick={() => {
                  // A row plays its move, but only once it is the row on the
                  // board: with a mouse that is already true by the time the
                  // click lands, and on a touchscreen -- where there is no
                  // hover to arrive first -- it makes the first tap show the
                  // variation and the second commit to it. Same shape as the
                  // board's own tap-to-confirm, without needing to ask what
                  // kind of pointer this is.
                  if (hoveredKey !== key) {
                    onHover(move);
                    return;
                  }
                  onHover(null);
                  playMove(move.x, move.y);
                }}
                title={`${hoveredKey === key ? 'Play' : 'Preview'} ${label}. ${formatCandidateWinRate(move.winRate)} win rate, score ${formatCandidateScore(move.scoreLead)}, ${formatCandidateVisits(move.visits)} visits.`}
                aria-label={`Candidate ${rank}: ${label}, ${formatCandidateWinRate(move.winRate)} win rate, score ${formatCandidateScore(move.scoreLead)}, ${formatCandidatePointsLost(move.pointsLost)} points. ${hoveredKey === key ? 'Play it' : 'Show its variation'}.`}
              >
                <span className="cl-rank">{rank}</span>
                <span className="cl-move">
                  <span className="cl-dot" style={{ backgroundColor: dot }} aria-hidden="true" />
                  {label}
                </span>
                <span className="cl-num">{formatCandidateWinRate(move.winRate)}</span>
                <span className="cl-num">{formatCandidateScore(move.scoreLead)}</span>
                <span className="cl-num cl-lost">{formatCandidatePointsLost(move.pointsLost)}</span>
                <span className="cl-num ui-text-faint">{formatCandidateVisits(move.visits)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

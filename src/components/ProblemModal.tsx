import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaTimes, FaRedo, FaLightbulb, FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { StaticBoard, type StaticBoardMarker } from './StaticBoard';
import {
  classifyProblemNode,
  findChildForMove,
  findSolutionPath,
  getProblemStarts,
  problemSideToMove,
} from '../utils/problemMode';
import type { GameNode } from '../types';

interface ProblemModalProps {
  onClose: () => void;
}

type Status = 'solving' | 'correct' | 'wrong' | 'end';

const OPPONENT_REPLY_DELAY_MS = 420;

const playerLabel = (player: 'black' | 'white'): string => (player === 'black' ? 'Black' : 'White');

const statusTone = (status: Status): string =>
  status === 'correct'
    ? 'var(--ui-success, #38a169)'
    : status === 'wrong'
      ? 'var(--ui-danger, #e53e3e)'
      : 'var(--ui-text-muted)';

export const ProblemModal: React.FC<ProblemModalProps> = ({ onClose }) => {
  useEscapeToClose(onClose);

  const rootNode = useGameStore((s) => s.rootNode);
  const treeVersion = useGameStore((s) => s.treeVersion);

  const problems = useMemo(() => {
    void treeVersion; // rebuild when the loaded game mutates in place
    return getProblemStarts(rootNode);
  }, [rootNode, treeVersion]);

  const [problemIndex, setProblemIndex] = useState(0);
  const safeIndex = problems.length === 0 ? 0 : Math.min(problemIndex, problems.length - 1);
  const start = problems[safeIndex] ?? null;

  const [cursor, setCursor] = useState<GameNode | null>(start);
  const [status, setStatus] = useState<Status>('solving');
  const [message, setMessage] = useState<string | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReplyTimer = () => {
    if (replyTimer.current) {
      clearTimeout(replyTimer.current);
      replyTimer.current = null;
    }
  };

  // Reset to the problem start whenever the active problem changes.
  useEffect(() => {
    clearReplyTimer();
    setCursor(start);
    setStatus('solving');
    setMessage(null);
    return clearReplyTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.id]);

  if (problemIndex !== safeIndex) setProblemIndex(safeIndex);

  const node = cursor ?? start;
  const hasMoves = !!start && start.children.length > 0;
  const sideToMove = node ? problemSideToMove(node) : 'black';

  // Resolves the position if it carries an explicit verdict or ends a line.
  // Returns true when the round is decided, false when play should continue.
  const settleAt = (next: GameNode): boolean => {
    const verdict = classifyProblemNode(next);
    if (verdict === 'correct') {
      setStatus('correct');
      setMessage('Correct — that solves it!');
      return true;
    }
    if (verdict === 'wrong') {
      setStatus('wrong');
      setMessage('That line fails. Retry the problem.');
      return true;
    }
    if (next.children.length === 0) {
      setStatus('end');
      setMessage('End of this line.');
      return true;
    }
    return false;
  };

  const handlePoint = (x: number, y: number) => {
    if (!node || status !== 'solving') return;
    const child = findChildForMove(node, x, y);
    if (!child) {
      setMessage("That move isn't part of this problem — try another point.");
      return;
    }
    setMessage(null);
    setCursor(child);

    // A verdict on the played move (or a leaf) settles immediately.
    if (settleAt(child)) return;

    // Otherwise the opponent answers along the recorded main continuation,
    // and we re-evaluate; an unresolved position hands play back to the user.
    clearReplyTimer();
    replyTimer.current = setTimeout(() => {
      replyTimer.current = null;
      const reply = child.children[0]!;
      setCursor(reply);
      settleAt(reply);
    }, OPPONENT_REPLY_DELAY_MS);
  };

  const handleRetry = () => {
    clearReplyTimer();
    setCursor(start);
    setStatus('solving');
    setMessage(null);
  };

  const handleShowSolution = () => {
    if (!start) return;
    clearReplyTimer();
    const path = findSolutionPath(start);
    const last = path[path.length - 1] ?? start;
    setCursor(last);
    const verdict = classifyProblemNode(last);
    setStatus(verdict === 'correct' ? 'correct' : 'end');
    setMessage(verdict === 'correct' ? 'Solution shown.' : 'Main line shown.');
  };

  const goToProblem = (next: number) => {
    if (next < 0 || next >= problems.length) return;
    setProblemIndex(next);
  };

  const markers: StaticBoardMarker[] = [];
  if (node?.move && node.move.x >= 0) {
    // Highlight the most recent move so the sequence is easy to follow.
    markers.push({ x: node.move.x, y: node.move.y, kind: 'circle', color: 'rgba(66, 153, 225, 0.9)' });
  }
  const lastMove = node?.move && node.move.x >= 0 ? { x: node.move.x, y: node.move.y } : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onClose}
    >
      <div
        className="ui-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="problem-title"
        data-problem-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="problem-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Problem Practice
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close problem practice"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        {!hasMoves || !node ? (
          <div className="flex-1 space-y-3 p-6 text-center">
            <p className="text-sm text-[var(--ui-text-muted)]">
              Load a Go problem (tsumego) SGF to practice. Problems are solved by playing the moves recorded in the
              file; the opponent answers automatically, and correct or failing lines are detected from the SGF.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--ui-text)]" data-problem-prompt="true">
                  {status === 'solving' ? `${playerLabel(sideToMove)} to play` : 'Result'}
                </p>
                {problems.length > 1 && (
                  <span className="text-xs text-[var(--ui-text-muted)]">Problem {safeIndex + 1} / {problems.length}</span>
                )}
              </div>

              <div className="mx-auto w-full max-w-[340px]">
                <StaticBoard
                  board={node.gameState.board}
                  lastMove={lastMove}
                  markers={markers}
                  onPointClick={status === 'solving' ? handlePoint : undefined}
                  ariaLabel="Problem position"
                />
              </div>

              {message && (
                <div
                  className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-sm font-semibold"
                  style={{ color: statusTone(status) }}
                  data-problem-message="true"
                  role="status"
                >
                  {message}
                </div>
              )}
            </div>

            <div className="ui-bar flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] px-4 py-3">
              <div className="flex gap-2">
                {problems.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => goToProblem(safeIndex - 1)}
                      disabled={safeIndex === 0}
                      className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:opacity-50"
                      aria-label="Previous problem"
                    >
                      <FaArrowLeft aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => goToProblem(safeIndex + 1)}
                      disabled={safeIndex >= problems.length - 1}
                      className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:opacity-50"
                      aria-label="Next problem"
                    >
                      <FaArrowRight aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleShowSolution}
                  className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                  data-problem-solution="true"
                >
                  <span className="inline-flex items-center gap-2"><FaLightbulb aria-hidden="true" /> Show solution</span>
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                  data-problem-retry="true"
                >
                  <span className="inline-flex items-center gap-2"><FaRedo aria-hidden="true" /> Retry</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

ProblemModal.displayName = 'ProblemModal';

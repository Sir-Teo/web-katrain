import React, { useMemo, useState } from 'react';
import { FaTimes, FaEye, FaArrowRight } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { StaticBoard, type StaticBoardMarker } from './StaticBoard';
import {
  buildGuessPositions,
  guessVerdict,
  playerLabel,
  scoreGuess,
  type GuessOutcome,
  type GuessPlayerFilter,
} from '../utils/guessMove';

interface GuessMoveModalProps {
  onClose: () => void;
}

const COLUMN_LETTERS = 'ABCDEFGHJKLMNOPQRST';

const gtpLabel = (x: number, y: number, size: number): string =>
  `${COLUMN_LETTERS[x] ?? '?'}${size - y}`;

const FILTERS: Array<{ id: GuessPlayerFilter; label: string }> = [
  { id: 'both', label: 'Both' },
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
];

const toneColor = (tone: 'success' | 'warning' | 'danger'): string =>
  tone === 'success'
    ? 'var(--ui-success, #38a169)'
    : tone === 'warning'
      ? 'var(--ui-warning, #d69e2e)'
      : 'var(--ui-danger, #e53e3e)';

export const GuessMoveModal: React.FC<GuessMoveModalProps> = ({ onClose }) => {
  useEscapeToClose(onClose);

  const rootNode = useGameStore((s) => s.rootNode);
  const treeVersion = useGameStore((s) => s.treeVersion);

  const [filter, setFilter] = useState<GuessPlayerFilter>('both');
  const positions = useMemo(
    () => {
      // treeVersion captures in-place edits to the loaded game while open.
      void treeVersion;
      return buildGuessPositions(rootNode, filter);
    },
    [rootNode, filter, treeVersion],
  );

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'guess' | 'revealed'>('guess');
  const [guess, setGuess] = useState<{ x: number; y: number } | null>(null);
  const [outcome, setOutcome] = useState<GuessOutcome | null>(null);
  const [stats, setStats] = useState({ attempts: 0, correct: 0 });

  // Keep the index valid as the position list changes (player filter, edits).
  const safeIndex = positions.length === 0 ? 0 : Math.min(index, positions.length - 1);
  if (safeIndex !== index) {
    setIndex(safeIndex);
    setPhase('guess');
    setGuess(null);
    setOutcome(null);
  }

  const current = positions[safeIndex] ?? null;
  const size = current?.board.length ?? rootNode.gameState.board.length;
  const isLast = positions.length > 0 && safeIndex >= positions.length - 1;

  const resetRound = (nextIndex: number) => {
    setIndex(nextIndex);
    setPhase('guess');
    setGuess(null);
    setOutcome(null);
  };

  const changeFilter = (next: GuessPlayerFilter) => {
    setFilter(next);
    resetRound(0);
    setStats({ attempts: 0, correct: 0 });
  };

  const handleGuess = (x: number, y: number) => {
    if (!current || phase !== 'guess') return;
    const result = scoreGuess(current.expected, x, y);
    setGuess({ x, y });
    setOutcome(result);
    setPhase('revealed');
    setStats((s) => ({ attempts: s.attempts + 1, correct: s.correct + (result.correct ? 1 : 0) }));
  };

  const handleShowAnswer = () => {
    if (!current || phase !== 'guess') return;
    setGuess(null);
    setOutcome(null);
    setPhase('revealed');
  };

  const handleNext = () => {
    if (isLast) return;
    resetRound(safeIndex + 1);
  };

  const markers: StaticBoardMarker[] = [];
  if (current && phase === 'revealed') {
    markers.push({
      x: current.expected.x,
      y: current.expected.y,
      color: 'rgba(56, 161, 105, 0.92)',
      textColor: '#ffffff',
    });
    if (guess && (guess.x !== current.expected.x || guess.y !== current.expected.y)) {
      markers.push({ x: guess.x, y: guess.y, kind: 'circle', color: 'rgba(229, 62, 62, 0.95)' });
    }
  }

  const accuracy = stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : 0;
  const verdict = outcome ? guessVerdict(outcome) : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onClose}
    >
      <div
        className="ui-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guess-move-title"
        data-guess-move-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="guess-move-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Guess the Move
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close guess the move"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        {positions.length === 0 ? (
          <div className="flex-1 space-y-3 p-6 text-center">
            <p className="text-sm text-[var(--ui-text-muted)]">
              Load a game with moves (a pro game, an SGF, or your own record) to practice predicting the next move.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--ui-text-muted)]" data-guess-move-prompt="true">
                  {phase === 'guess' && current
                    ? `Where does ${playerLabel(current.expected.player)} play at move ${current.moveNumber}?`
                    : 'Result'}
                </p>
                <div className="inline-flex overflow-hidden rounded-lg border border-[var(--ui-border)]" role="group" aria-label="Which moves to guess">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => changeFilter(f.id)}
                      aria-pressed={filter === f.id}
                      className={`min-h-9 px-3 py-1 text-xs font-semibold ${
                        filter === f.id
                          ? 'bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-text)]'
                          : 'bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[340px]">
                {current && (
                  <StaticBoard
                    board={current.board}
                    lastMove={current.lastMove}
                    markers={markers}
                    onPointClick={phase === 'guess' ? handleGuess : undefined}
                    ariaLabel={`Guess move ${current.moveNumber}`}
                  />
                )}
              </div>

              {phase === 'revealed' && current && (
                <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm" data-guess-move-result="true">
                  {verdict ? (
                    <div className="text-base font-semibold" style={{ color: toneColor(verdict.tone) }}>
                      {verdict.label}
                    </div>
                  ) : (
                    <div className="text-base font-semibold text-[var(--ui-text-muted)]">Answer revealed</div>
                  )}
                  <div className="flex justify-between text-[var(--ui-text)]">
                    <span>Actual move</span>
                    <span className="font-mono font-semibold">
                      {playerLabel(current.expected.player)} {gtpLabel(current.expected.x, current.expected.y, size)}
                    </span>
                  </div>
                  {guess && (
                    <div className="flex justify-between text-[var(--ui-text-muted)]">
                      <span>Your guess</span>
                      <span className="font-mono">{gtpLabel(guess.x, guess.y, size)}</span>
                    </div>
                  )}
                  {outcome && !outcome.correct && (
                    <div className="flex justify-between text-[var(--ui-text-muted)]">
                      <span>Distance</span>
                      <span>{outcome.distance} line{outcome.distance === 1 ? '' : 's'}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between text-xs text-[var(--ui-text-muted)]" data-guess-move-stats="true">
                <span>Position {safeIndex + 1} / {positions.length}</span>
                {stats.attempts > 0 && (
                  <span>Correct: {stats.correct}/{stats.attempts} ({accuracy}%)</span>
                )}
              </div>
            </div>

            <div className="ui-bar flex flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
              {phase === 'guess' ? (
                <button
                  type="button"
                  onClick={handleShowAnswer}
                  className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                >
                  <span className="inline-flex items-center gap-2"><FaEye aria-hidden="true" /> Show answer</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleNext}
                disabled={isLast}
                className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:opacity-60"
                data-guess-move-next="true"
              >
                <span className="inline-flex items-center gap-2">
                  {isLast ? 'End of game' : 'Next move'} <FaArrowRight aria-hidden="true" />
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

GuessMoveModal.displayName = 'GuessMoveModal';

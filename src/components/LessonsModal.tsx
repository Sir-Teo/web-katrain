import React, { useMemo, useState } from 'react';
import { FaTimes, FaGraduationCap, FaChevronLeft, FaChevronRight, FaCheckCircle } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { StaticBoard, type StaticBoardMarker } from './StaticBoard';
import { LESSONS, boardFromRows } from '../data/lessons';

interface LessonsModalProps {
  onClose: () => void;
}

export const LessonsModal: React.FC<LessonsModalProps> = ({ onClose }) => {
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: string; text: string } | null>(null);
  const [clickMark, setClickMark] = useState<{ x: number; y: number; ok: boolean } | null>(null);

  const lesson = useMemo(() => LESSONS.find((l) => l.id === activeId) ?? null, [activeId]);
  const step = lesson?.steps[stepIndex] ?? null;

  // Reset interactive state when the step or lesson changes (adjust during render).
  const stepKey = `${activeId}:${stepIndex}`;
  const [prevStepKey, setPrevStepKey] = useState(stepKey);
  if (stepKey !== prevStepKey) {
    setPrevStepKey(stepKey);
    setSolved(false);
    setFeedback(null);
    setClickMark(null);
  }

  const board = useMemo(() => (step ? boardFromRows(step.rows) : null), [step]);
  const isInteractive = !!step?.answers?.length;
  const canAdvance = !isInteractive || solved;
  const isLastStep = lesson ? stepIndex >= lesson.steps.length - 1 : false;

  const openLesson = (id: string) => {
    setActiveId(id);
    setStepIndex(0);
  };

  const handlePoint = (x: number, y: number) => {
    if (!step?.answers?.length || solved) return;
    const ok = step.answers.some((a) => a.x === x && a.y === y);
    setClickMark({ x, y, ok });
    if (ok) {
      setSolved(true);
      setFeedback({ tone: 'var(--ui-success,#38a169)', text: step.successText ?? 'Correct!' });
    } else {
      setFeedback({ tone: 'var(--ui-warn,#d69e2e)', text: step.hint ?? 'Not quite — try again.' });
    }
  };

  const markers: StaticBoardMarker[] = useMemo(() => {
    if (!step) return [];
    const base = [...(step.markers ?? [])];
    if (clickMark) {
      base.push({
        x: clickMark.x,
        y: clickMark.y,
        kind: clickMark.ok ? 'dot' : 'circle',
        color: clickMark.ok ? 'rgba(56,161,105,0.9)' : 'rgba(229,62,62,0.9)',
      });
    }
    return base;
  }, [step, clickMark]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onClose}
    >
      <div
        className="ui-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lessons-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="lessons-title" className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--ui-text)]">
            <FaGraduationCap aria-hidden="true" /> {lesson ? lesson.title : 'Lessons'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close lessons"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!lesson ? (
            <>
              <p className="text-sm text-[var(--ui-text-muted)]">
                Short, interactive lessons on the fundamentals. Read each step, then click the board when asked.
              </p>
              <ul className="space-y-2">
                {LESSONS.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => openLesson(l.id)}
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-left hover:bg-[var(--ui-surface-2)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--ui-text)]">{l.title}</span>
                        <span className="rounded-full border border-[var(--ui-border)] px-2 py-0.5 text-xs text-[var(--ui-text-muted)]">{l.level}</span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-text-muted)]">{l.summary}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
                Step {stepIndex + 1} of {lesson.steps.length}
              </div>
              <div className="mx-auto w-full max-w-[320px]">
                {board && (
                  <StaticBoard
                    board={board}
                    markers={markers}
                    maxPx={320}
                    onPointClick={isInteractive ? handlePoint : undefined}
                    ariaLabel={lesson.title}
                  />
                )}
              </div>
              <p className="text-sm leading-6 text-[var(--ui-text)]">{step?.text}</p>
              {isInteractive && !solved && !feedback && (
                <p className="text-xs italic text-[var(--ui-text-muted)]">Click a point on the board.</p>
              )}
              {feedback && (
                <div
                  className="rounded-lg border px-3 py-2 text-sm font-medium"
                  style={{ borderColor: feedback.tone, color: feedback.tone }}
                >
                  <span className="inline-flex items-center gap-2">
                    {solved && <FaCheckCircle aria-hidden="true" />} {feedback.text}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {lesson && (
          <div className="ui-bar flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] px-4 py-3">
            <button
              type="button"
              onClick={() => (stepIndex > 0 ? setStepIndex((i) => i - 1) : setActiveId(null))}
              className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
            >
              <span className="inline-flex items-center gap-2"><FaChevronLeft aria-hidden="true" /> {stepIndex > 0 ? 'Back' : 'Lessons'}</span>
            </button>
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => (isLastStep ? setActiveId(null) : setStepIndex((i) => i + 1))}
              className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                {isLastStep ? 'Finish' : 'Next'} <FaChevronRight aria-hidden="true" />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

LessonsModal.displayName = 'LessonsModal';

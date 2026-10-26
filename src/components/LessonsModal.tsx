import React, { useEffect, useMemo, useState } from 'react';
import { FaTimes, FaGraduationCap, FaChevronLeft, FaChevronRight, FaCheckCircle } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { StaticBoard, type StaticBoardMarker } from './StaticBoard';
import { LESSONS, getLessonBoard } from '../data/lessons';
import { advanceLessonProgress, loadLessonProgress, saveLessonProgress } from '../utils/lessonProgress';

interface LessonsModalProps {
  onClose: () => void;
}

export const LessonsModal: React.FC<LessonsModalProps> = ({ onClose }) => {
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>();
  const lastLessonRef = React.useRef<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(() => loadLessonProgress(LESSONS));
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

  useEffect(() => {
    const dialog = dialogRef.current;
    const body = dialog?.querySelector('.lessons-body');
    if (body) body.scrollTop = 0;
    // Next can become disabled on the new exercise, which makes the browser
    // drop its focus onto the page behind the dialog. Give the new step an
    // active target and let keyboard users answer directly on the board.
    const board = dialog?.querySelector<SVGSVGElement>('[data-static-board-interactive="true"]');
    const lessonCard = !activeId && lastLessonRef.current
      ? dialog?.querySelector<HTMLButtonElement>(`[data-lesson-id="${lastLessonRef.current}"]`)
      : null;
    (board ?? lessonCard ?? dialog)?.focus({ preventScroll: true });
    lessonCard?.scrollIntoView({ block: 'nearest' });
  }, [stepKey, activeId, dialogRef]);

  const board = useMemo(() => (step ? getLessonBoard(step, clickMark) : null), [step, clickMark]);
  const isInteractive = !!step?.answers?.length;
  const canAdvance = !isInteractive || solved;
  const isLastStep = lesson ? stepIndex >= lesson.steps.length - 1 : false;
  const completedCount = LESSONS.filter((item) => progress[item.id]?.completed).length;

  useEffect(() => { saveLessonProgress(progress); }, [progress]);

  const openLesson = (id: string) => {
    lastLessonRef.current = id;
    setActiveId(id);
    const saved = progress[id];
    setStepIndex(saved?.completed ? 0 : saved?.stepIndex ?? 0);
  };

  const advance = () => {
    if (!lesson || !canAdvance) return;
    setProgress((previous) => advanceLessonProgress(previous, lesson, stepIndex + 1, isLastStep));
    if (isLastStep) setActiveId(null);
    else setStepIndex((index) => index + 1);
  };

  const handlePoint = (x: number, y: number) => {
    if (!step?.answers?.length || solved) return;
    const ok = step.answers.some((a) => a.x === x && a.y === y);
    setClickMark({ x, y, ok });
    if (ok) {
      setSolved(true);
      setFeedback({ tone: 'var(--ui-success,#38a169)', text: step.successText ?? 'Correct!' });
    } else {
      setFeedback({ tone: 'var(--ui-warning,#d69e2e)', text: step.hint ?? 'Not quite — try again.' });
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
        className="ui-panel flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lessons-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lessons-header ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
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

        <div className="lessons-body flex-1 space-y-4 overflow-y-auto p-4" data-lessons-active={lesson ? 'true' : 'false'}>
          {!lesson ? (
            <>
              <p className="lessons-intro text-sm text-[var(--ui-text-muted)]">
                Short, interactive lessons on the fundamentals. Read each step, then play on the board when asked.
              </p>
              <div className="lessons-progress text-xs font-medium text-[var(--ui-text-muted)]" role="status">
                {completedCount} of {LESSONS.length} lessons completed
              </div>
              <ul className="lessons-list space-y-2">
                {LESSONS.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      data-lesson-id={l.id}
                      onClick={() => openLesson(l.id)}
                      className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-3 text-left hover:bg-[var(--ui-surface-2)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 font-semibold text-[var(--ui-text)]">{l.title}</span>
                        {progress[l.id]?.completed && <FaCheckCircle className="shrink-0 text-[var(--ui-success)]" aria-label="Completed" />}
                      </div>
                      <div className="mt-1 text-xs font-medium text-[var(--ui-accent)]">
                        {progress[l.id]?.completed ? 'Completed · Review lesson' : progress[l.id]?.stepIndex
                          ? `Continue · Step ${progress[l.id]!.stepIndex + 1} of ${l.steps.length}`
                          : `${l.level} · ${l.steps.length} step${l.steps.length === 1 ? '' : 's'}`}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-text-muted)]">{l.summary}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="lessons-step text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
                <div className="flex items-center justify-between gap-2">
                  <span>Step {stepIndex + 1} of {lesson.steps.length}</span>
                  <button type="button" onClick={() => setActiveId(null)} className="min-h-11 px-2 text-xs normal-case text-[var(--ui-accent)] hover:underline desktop-shell:min-h-8">
                    All lessons
                  </button>
                </div>
                <div className="mt-1 flex gap-1" aria-hidden="true">
                  {lesson.steps.map((_, index) => <span key={index} className="h-1 flex-1 rounded-full" style={{ background: index <= stepIndex ? 'var(--ui-accent)' : 'var(--ui-border)' }} />)}
                </div>
              </div>
              <div className="lessons-board mx-auto w-full max-w-[320px]">
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
              <p className="lessons-copy text-sm leading-6 text-[var(--ui-text)]">{step?.text}</p>
              {isInteractive && !solved && !feedback && (
                <p className="lessons-hint text-xs italic text-[var(--ui-text-muted)]">Choose a point on the board.</p>
              )}
              {feedback && (
                <div
                  className="lessons-feedback rounded-lg border px-3 py-2 text-sm font-medium"
                  role="status"
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
          <div className="lessons-footer ui-bar flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] px-4 py-3">
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
              onClick={advance}
              className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] not-disabled:hover:bg-[var(--ui-surface-2)] disabled:opacity-50"
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

import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './storage';

// Study dialogs kept their progress in component state, so closing Lessons or
// the Score quiz threw away which lessons were done, where the reader was, and
// every round of quiz statistics. These helpers keep that progress across
// dialog closes and reloads. They go through the guarded storage helpers, and
// every read validates what it finds: a missing, corrupt or hand-edited entry
// reads as "no progress yet" rather than breaking the dialog.

export const LESSON_PROGRESS_STORAGE_KEY = 'web-katrain:lesson_progress:v1';
export const SCORE_QUIZ_STATS_STORAGE_KEY = 'web-katrain:score_quiz_stats:v1';

export interface LessonPosition {
  lessonId: string;
  stepIndex: number;
}

export interface LessonProgress {
  /** Ids of lessons finished at least once. */
  completed: string[];
  /** The lesson and step open when the dialog last closed, if any. */
  current: LessonPosition | null;
}

export interface ScoreQuizStats {
  rounds: number;
  sumError: number;
  leaderHits: number;
}

export const EMPTY_LESSON_PROGRESS: LessonProgress = { completed: [], current: null };
export const EMPTY_SCORE_QUIZ_STATS: ScoreQuizStats = { rounds: 0, sumError: 0, leaderHits: 0 };

const readJson = (key: string): unknown => {
  try {
    const raw = readLocalStorage(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * The saved lesson progress. `lessons` is the lesson list the dialog offers
 * (id and step count), so a lesson that was removed or shortened since the
 * save is dropped or clamped rather than opened at a step that is not there.
 */
export const loadLessonProgress = (
  lessons: ReadonlyArray<{ id: string; steps: readonly unknown[] }>,
): LessonProgress => {
  const parsed = readJson(LESSON_PROGRESS_STORAGE_KEY);
  if (!isRecord(parsed)) return EMPTY_LESSON_PROGRESS;
  const known = new Map(lessons.map((lesson) => [lesson.id, lesson.steps.length]));
  const completed = Array.isArray(parsed.completed)
    ? [...new Set(parsed.completed.filter((id): id is string => typeof id === 'string' && known.has(id)))]
    : [];
  let current: LessonPosition | null = null;
  if (isRecord(parsed.current)) {
    const { lessonId, stepIndex } = parsed.current;
    const steps = typeof lessonId === 'string' ? known.get(lessonId) : undefined;
    if (steps !== undefined && steps > 0 && isCount(stepIndex)) {
      current = { lessonId: lessonId as string, stepIndex: Math.min(stepIndex, steps - 1) };
    }
  }
  return { completed, current };
};

export const saveLessonProgress = (progress: LessonProgress): void => {
  writeLocalStorage(LESSON_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
};

export const resetLessonProgress = (): void => {
  removeLocalStorage(LESSON_PROGRESS_STORAGE_KEY);
};

/** Marks a lesson finished and closes it, keeping the completed list unique. */
export const completeLesson = (progress: LessonProgress, lessonId: string): LessonProgress => ({
  completed: progress.completed.includes(lessonId) ? progress.completed : [...progress.completed, lessonId],
  current: null,
});

export const loadScoreQuizStats = (): ScoreQuizStats => {
  const parsed = readJson(SCORE_QUIZ_STATS_STORAGE_KEY);
  if (!isRecord(parsed)) return EMPTY_SCORE_QUIZ_STATS;
  const { rounds, sumError, leaderHits } = parsed;
  if (!isCount(rounds) || !isCount(leaderHits) || leaderHits > rounds) return EMPTY_SCORE_QUIZ_STATS;
  if (typeof sumError !== 'number' || !Number.isFinite(sumError) || sumError < 0) return EMPTY_SCORE_QUIZ_STATS;
  return { rounds, sumError, leaderHits };
};

export const saveScoreQuizStats = (stats: ScoreQuizStats): void => {
  writeLocalStorage(SCORE_QUIZ_STATS_STORAGE_KEY, JSON.stringify(stats));
};

export const resetScoreQuizStats = (): void => {
  removeLocalStorage(SCORE_QUIZ_STATS_STORAGE_KEY);
};

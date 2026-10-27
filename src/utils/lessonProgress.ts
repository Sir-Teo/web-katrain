import { LESSONS, type Lesson } from '../data/lessons';
import { readLocalStorage, writeLocalStorage } from './storage';

export const LESSON_PROGRESS_KEY = 'web-katrain:lesson_progress:v1';
export const LESSON_PROGRESS_MILESTONE_PREFIX = 'web-katrain:lesson_progress:v2:';

export type LessonProgress = Record<string, { stepIndex: number; completed: boolean }>;

function loadLegacyProgress(lessons: readonly Lesson[]): LessonProgress {
  try {
    const raw: unknown = JSON.parse(readLocalStorage(LESSON_PROGRESS_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const progress: LessonProgress = {};
    for (const lesson of lessons) {
      const saved: unknown = Object.hasOwn(raw, lesson.id)
        ? (raw as Record<string, unknown>)[lesson.id] : null;
      if (!saved || typeof saved !== 'object') continue;
      const { stepIndex, completed } = saved as Record<string, unknown>;
      if (typeof stepIndex !== 'number' || !Number.isInteger(stepIndex) || stepIndex < 0) continue;
      progress[lesson.id] = {
        stepIndex: Math.min(stepIndex, Math.max(0, lesson.steps.length - 1)),
        completed: completed === true,
      };
    }
    return progress;
  } catch {
    return {};
  }
}

const milestoneKey = (id: string, milestone: number | 'completed') =>
  `${LESSON_PROGRESS_MILESTONE_PREFIX}${encodeURIComponent(id)}:${milestone}`;

export function loadLessonProgress(lessons: readonly Lesson[]): LessonProgress {
  const progress = loadLegacyProgress(lessons);
  for (const lesson of lessons) {
    for (let index = 0; index < lesson.steps.length; index++) {
      if (readLocalStorage(milestoneKey(lesson.id, index)) === '1') {
        progress[lesson.id] = {
          stepIndex: Math.max(progress[lesson.id]?.stepIndex ?? 0, index),
          completed: progress[lesson.id]?.completed === true,
        };
      }
    }
    if (readLocalStorage(milestoneKey(lesson.id, 'completed')) === '1') {
      progress[lesson.id] = { stepIndex: progress[lesson.id]?.stepIndex ?? 0, completed: true };
    }
  }
  return progress;
}

/** Merge only advances, retaining identity when a peer has no new progress. */
export function mergeLessonProgress(previous: LessonProgress, incoming: LessonProgress): LessonProgress {
  let merged = previous;
  for (const [id, value] of Object.entries(incoming)) {
    const old = previous[id];
    const stepIndex = Math.max(old?.stepIndex ?? 0, value.stepIndex);
    const completed = old?.completed === true || value.completed;
    if (old && old.stepIndex === stepIndex && old.completed === completed) continue;
    if (merged === previous) merged = { ...previous };
    merged[id] = { stepIndex, completed };
  }
  return merged;
}

/** Record the furthest reached step; reviewing an earlier step keeps that progress. */
export function advanceLessonProgress(
  progress: LessonProgress, lesson: Lesson, stepIndex: number, completed = false,
): LessonProgress {
  const previous = progress[lesson.id];
  const next = {
    stepIndex: Math.max(previous?.stepIndex ?? 0, Math.min(stepIndex, lesson.steps.length - 1)),
    completed: completed || previous?.completed === true,
  };
  return { ...progress, [lesson.id]: next };
}

export function saveLessonProgress(progress: LessonProgress): void {
  // Each milestone is immutable. Stale tabs cannot erase another tab's work,
  // even if their localStorage snapshots have not received its latest write.
  for (const lesson of LESSONS) {
    const reached = progress[lesson.id];
    if (!reached || !Number.isInteger(reached.stepIndex) || reached.stepIndex < 0) continue;
    const index = Math.min(reached.stepIndex, Math.max(0, lesson.steps.length - 1));
    // Retain reached progress if a future edit shortens this lesson.
    for (let step = 0; step <= index; step++) writeLocalStorage(milestoneKey(lesson.id, step), '1');
    if (reached.completed) writeLocalStorage(milestoneKey(lesson.id, 'completed'), '1');
  }
}

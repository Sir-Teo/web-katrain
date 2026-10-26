import type { Lesson } from '../data/lessons';
import { readLocalStorage, writeLocalStorage } from './storage';

export const LESSON_PROGRESS_KEY = 'web-katrain:lesson_progress:v1';

export type LessonProgress = Record<string, { stepIndex: number; completed: boolean }>;

export function loadLessonProgress(lessons: readonly Lesson[]): LessonProgress {
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
  writeLocalStorage(LESSON_PROGRESS_KEY, JSON.stringify(progress));
}

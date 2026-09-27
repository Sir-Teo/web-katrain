import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_LESSON_PROGRESS,
  EMPTY_SCORE_QUIZ_STATS,
  LESSON_PROGRESS_STORAGE_KEY,
  SCORE_QUIZ_STATS_STORAGE_KEY,
  completeLesson,
  loadLessonProgress,
  loadScoreQuizStats,
  resetLessonProgress,
  resetScoreQuizStats,
  saveLessonProgress,
  saveScoreQuizStats,
} from '../src/utils/studyProgress';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let entries: Map<string, string>;

beforeEach(() => {
  entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, String(value)); },
      removeItem: (key: string) => { entries.delete(key); },
    },
  });
});

afterEach(() => {
  if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis as object, 'localStorage');
});

const LESSONS = [
  { id: 'liberties', steps: [1, 2, 3] },
  { id: 'capture', steps: [1, 2] },
];

describe('lesson progress', () => {
  it('starts empty', () => {
    expect(loadLessonProgress(LESSONS)).toEqual(EMPTY_LESSON_PROGRESS);
  });

  it('survives the dialog closing: completed lessons and the open step', () => {
    saveLessonProgress({ completed: ['liberties'], current: { lessonId: 'capture', stepIndex: 1 } });
    expect(loadLessonProgress(LESSONS)).toEqual({
      completed: ['liberties'],
      current: { lessonId: 'capture', stepIndex: 1 },
    });
  });

  it('marks a lesson complete once and closes it', () => {
    const once = completeLesson({ completed: [], current: { lessonId: 'capture', stepIndex: 1 } }, 'capture');
    expect(once).toEqual({ completed: ['capture'], current: null });
    expect(completeLesson(once, 'capture').completed).toEqual(['capture']);
  });

  it('drops lessons that no longer exist and clamps a step past the end', () => {
    entries.set(LESSON_PROGRESS_STORAGE_KEY, JSON.stringify({
      completed: ['liberties', 'removed-lesson', 'liberties', 7],
      current: { lessonId: 'liberties', stepIndex: 12 },
    }));
    expect(loadLessonProgress(LESSONS)).toEqual({
      completed: ['liberties'],
      current: { lessonId: 'liberties', stepIndex: 2 },
    });

    entries.set(LESSON_PROGRESS_STORAGE_KEY, JSON.stringify({ completed: [], current: { lessonId: 'gone', stepIndex: 0 } }));
    expect(loadLessonProgress(LESSONS).current).toBeNull();
  });

  it('reads corrupt or hand-edited entries as no progress', () => {
    for (const raw of ['{', 'null', '[]', '"text"', JSON.stringify({ completed: 'liberties', current: { lessonId: 'capture', stepIndex: -1 } })]) {
      entries.set(LESSON_PROGRESS_STORAGE_KEY, raw);
      const progress = loadLessonProgress(LESSONS);
      expect(progress.completed, raw).toEqual([]);
      expect(progress.current, raw).toBeNull();
    }
  });

  it('resets on request', () => {
    saveLessonProgress({ completed: ['liberties'], current: null });
    resetLessonProgress();
    expect(entries.has(LESSON_PROGRESS_STORAGE_KEY)).toBe(false);
    expect(loadLessonProgress(LESSONS)).toEqual(EMPTY_LESSON_PROGRESS);
  });
});

describe('score quiz stats', () => {
  it('survive the dialog closing', () => {
    saveScoreQuizStats({ rounds: 4, sumError: 11.5, leaderHits: 3 });
    expect(loadScoreQuizStats()).toEqual({ rounds: 4, sumError: 11.5, leaderHits: 3 });
  });

  it('read impossible or corrupt entries as none', () => {
    for (const value of [
      '{',
      JSON.stringify({ rounds: 2, sumError: 3, leaderHits: 5 }),
      JSON.stringify({ rounds: -1, sumError: 3, leaderHits: 0 }),
      JSON.stringify({ rounds: 2, sumError: 'x', leaderHits: 1 }),
      JSON.stringify({ rounds: 2.5, sumError: 3, leaderHits: 1 }),
    ]) {
      entries.set(SCORE_QUIZ_STATS_STORAGE_KEY, value);
      expect(loadScoreQuizStats(), value).toEqual(EMPTY_SCORE_QUIZ_STATS);
    }
  });

  it('reset on request', () => {
    saveScoreQuizStats({ rounds: 1, sumError: 2, leaderHits: 1 });
    resetScoreQuizStats();
    expect(loadScoreQuizStats()).toEqual(EMPTY_SCORE_QUIZ_STATS);
  });
});

describe('storage that throws on access', () => {
  it('costs the progress, not the dialog', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(loadLessonProgress(LESSONS)).toEqual(EMPTY_LESSON_PROGRESS);
    expect(loadScoreQuizStats()).toEqual(EMPTY_SCORE_QUIZ_STATS);
    expect(() => saveLessonProgress({ completed: ['capture'], current: null })).not.toThrow();
    expect(() => saveScoreQuizStats({ rounds: 1, sumError: 1, leaderHits: 1 })).not.toThrow();
    expect(() => resetLessonProgress()).not.toThrow();
    expect(() => resetScoreQuizStats()).not.toThrow();
  });
});

describe('the study dialogs', () => {
  it('restore and save their progress, and offer a reset', () => {
    const lessons = readFileSync('src/components/LessonsModal.tsx', 'utf8');
    expect(lessons).toContain('loadLessonProgress(LESSONS)');
    expect(lessons).toContain('saveLessonProgress(');
    expect(lessons).toContain('Reset progress');

    const quiz = readFileSync('src/components/ScoreQuizModal.tsx', 'utf8');
    expect(quiz).toContain('useState<ScoreQuizStats>(loadScoreQuizStats)');
    expect(quiz).toContain('saveScoreQuizStats(stats)');
    expect(quiz).toContain('data-score-quiz-reset="true"');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LESSONS } from '../src/data/lessons';
import { advanceLessonProgress, LESSON_PROGRESS_KEY, loadLessonProgress, saveLessonProgress } from '../src/utils/lessonProgress';

afterEach(() => vi.unstubAllGlobals());

function storage(initial = '{}') {
  const values = new Map([[LESSON_PROGRESS_KEY, initial]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
}

describe('lesson progress', () => {
  it('retains a reached exercise through closing and reopening, then records completion', () => {
    storage();
    const lesson = LESSONS[0]!;
    const started = loadLessonProgress(LESSONS);
    saveLessonProgress(advanceLessonProgress(started, lesson, 1));
    const resumed = loadLessonProgress(LESSONS);
    expect(resumed[lesson.id]).toEqual({ stepIndex: 1, completed: false });
    saveLessonProgress(advanceLessonProgress(resumed, lesson, lesson.steps.length, true));
    expect(loadLessonProgress(LESSONS)[lesson.id]).toEqual({ stepIndex: lesson.steps.length - 1, completed: true });
  });

  it('keeps completion and the furthest step when reviewing earlier material', () => {
    const lesson = LESSONS[0]!;
    const completed = advanceLessonProgress({}, lesson, lesson.steps.length - 1, true);
    const reviewed = advanceLessonProgress(completed, lesson, 0);
    expect(reviewed).toEqual(completed);
    expect(completed[lesson.id]?.completed).toBe(true);
  });

  it('ignores invalid and unknown records and clamps steps after lesson content changes', () => {
    storage(JSON.stringify({
      capture: { stepIndex: 1000, completed: 'yes' },
      atari: { stepIndex: -1, completed: true },
      'two-eyes': { stepIndex: 0.5, completed: true },
      opening: { stepIndex: '1', completed: false },
      unknown: { stepIndex: 0, completed: true },
    }));
    expect(loadLessonProgress(LESSONS)).toEqual({ capture: { stepIndex: LESSONS[0]!.steps.length - 1, completed: false } });
    for (const invalid of ['{bad', 'null', '[]', '5']) {
      storage(invalid);
      expect(loadLessonProgress(LESSONS)).toEqual({});
    }
  });

  it('allows lessons to work when browser storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('Blocked', 'SecurityError'); },
      setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); },
    });
    expect(loadLessonProgress(LESSONS)).toEqual({});
    expect(() => saveLessonProgress(advanceLessonProgress({}, LESSONS[0]!, 1))).not.toThrow();
  });
});

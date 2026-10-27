import { afterEach, describe, expect, it, vi } from 'vitest';
import { LESSONS } from '../src/data/lessons';
import { advanceLessonProgress, LESSON_PROGRESS_KEY, loadLessonProgress, mergeLessonProgress, saveLessonProgress } from '../src/utils/lessonProgress';

afterEach(() => vi.unstubAllGlobals());

function storage(initial = '{}') {
  const values = new Map([[LESSON_PROGRESS_KEY, initial]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
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

  it('retains different lessons saved from two stale tab snapshots', () => {
    const values = storage();
    const a = loadLessonProgress(LESSONS);
    const b = loadLessonProgress(LESSONS);
    // A renderer can still read its old snapshot after another tab writes.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    saveLessonProgress(advanceLessonProgress(a, LESSONS[0]!, 1));
    saveLessonProgress(advanceLessonProgress(b, LESSONS[1]!, 0, true));
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null });
    expect(loadLessonProgress(LESSONS)).toEqual({
      capture: { stepIndex: 1, completed: false },
      atari: { stepIndex: 0, completed: true },
    });
  });

  it('never revokes completion or a later exercise when a stale tab reviews an earlier step', () => {
    storage();
    const lesson = LESSONS[0]!;
    const stale = loadLessonProgress(LESSONS);
    saveLessonProgress(advanceLessonProgress({}, lesson, 1, true));
    saveLessonProgress(advanceLessonProgress(stale, lesson, 0));
    expect(loadLessonProgress(LESSONS)[lesson.id]).toEqual({ stepIndex: 1, completed: true });
  });

  it('carries legacy progress forward even if an older tab later replaces its snapshot', () => {
    const values = storage(JSON.stringify({ capture: { stepIndex: 1, completed: true } }));
    saveLessonProgress(loadLessonProgress(LESSONS));
    values.set(LESSON_PROGRESS_KEY, '{}');
    expect(loadLessonProgress(LESSONS).capture).toEqual({ stepIndex: 1, completed: true });
  });

  it('clamps milestone progress when a lesson is shortened', () => {
    storage();
    const lesson = LESSONS[0]!;
    saveLessonProgress(advanceLessonProgress({}, lesson, 1));
    expect(loadLessonProgress([{ ...lesson, steps: lesson.steps.slice(0, 1) }])[lesson.id])
      .toEqual({ stepIndex: 0, completed: false });
  });

  it('merges peer advances without regressing local progress or republishing an unchanged selection', () => {
    const local = { capture: { stepIndex: 1, completed: true } };
    expect(mergeLessonProgress(local, { capture: { stepIndex: 0, completed: false } })).toBe(local);
    const peer = { atari: { stepIndex: 0, completed: true } };
    expect(mergeLessonProgress(local, peer)).toEqual({ ...local, ...peer });
    expect(local).toEqual({ capture: { stepIndex: 1, completed: true } });
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

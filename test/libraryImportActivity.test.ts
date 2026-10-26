import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginLibraryImport, getLibraryImportCount, subscribeLibraryImportActivity } from '../src/utils/libraryImports';

const cleanups: Array<() => void> = [];
const begin = (count: number) => {
  const finish = beginLibraryImport(count);
  cleanups.push(finish);
  return finish;
};
const subscribe = (listener: () => void) => {
  const unsubscribe = subscribeLibraryImportActivity(listener);
  cleanups.push(unsubscribe);
  return unsubscribe;
};
afterEach(() => { cleanups.reverse().splice(0).forEach(cleanup => cleanup()); });

describe('Library import activity', () => {
  it('keeps overlapping batches visible until each completes, including duplicate cleanup', () => {
    const counts: number[] = [];
    subscribe(() => counts.push(getLibraryImportCount()));
    const first = begin(2), second = begin(1);
    expect(getLibraryImportCount()).toBe(3);
    first();
    expect(getLibraryImportCount()).toBe(1);
    first();
    expect(getLibraryImportCount()).toBe(1);
    second();
    expect(getLibraryImportCount()).toBe(0);
    expect(counts).toEqual([2, 3, 1, 0]);
  });

  it('lets a replacement panel read ongoing work without retaining the old subscriber', () => {
    const original = vi.fn(), reopened = vi.fn();
    const closePanel = subscribe(original);
    const finish = begin(1);
    closePanel();
    subscribe(reopened);
    expect(getLibraryImportCount()).toBe(1);
    finish();
    expect(original).toHaveBeenCalledTimes(1);
    expect(reopened).toHaveBeenCalledTimes(1);
    expect(getLibraryImportCount()).toBe(0);
  });

  it('does not announce empty or invalid source counts', () => {
    const listener = vi.fn();
    subscribe(listener);
    for (const count of [0, -1, NaN, Infinity]) begin(count)();
    expect(getLibraryImportCount()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });
});

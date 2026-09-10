import { describe, expect, it, vi } from 'vitest';
import {
  createIdleScheduler,
  shouldWarmChunks,
  warmChunksWhenIdle,
  type ChunkWarmer,
} from '../src/utils/idleChunkWarming';

describe('shouldWarmChunks', () => {
  it('warms when the browser says nothing about the connection', () => {
    // Safari exposes no navigator.connection at all. Declining to warm there
    // would turn the feature off for a whole platform on no evidence.
    expect(shouldWarmChunks(undefined)).toBe(true);
    expect(shouldWarmChunks(null)).toBe(true);
    expect(shouldWarmChunks({})).toBe(true);
  });

  it('leaves Data Saver alone', () => {
    // A stated preference beats a guess about what will be opened next.
    expect(shouldWarmChunks({ connection: { saveData: true } })).toBe(false);
    expect(shouldWarmChunks({ connection: { saveData: true, effectiveType: '4g' } })).toBe(false);
  });

  it('skips the connections where a wasted chunk costs most', () => {
    expect(shouldWarmChunks({ connection: { effectiveType: 'slow-2g' } })).toBe(false);
    expect(shouldWarmChunks({ connection: { effectiveType: '2g' } })).toBe(false);
    expect(shouldWarmChunks({ connection: { effectiveType: '3g' } })).toBe(true);
    expect(shouldWarmChunks({ connection: { effectiveType: '4g' } })).toBe(true);
  });
});

describe('createIdleScheduler', () => {
  it('uses requestIdleCallback where there is one, with a timeout', () => {
    const requestIdleCallback = vi.fn<(run: () => void, options?: { timeout: number }) => number>(() => 7);
    const cancelIdleCallback = vi.fn();
    const scope = { requestIdleCallback, cancelIdleCallback } as unknown as typeof globalThis;

    const run = vi.fn();
    const cancel = createIdleScheduler(scope)(run);

    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    // Without a timeout a page that never goes fully idle would never warm
    // anything, which is the case that needs it most.
    expect(requestIdleCallback.mock.calls[0]![1]).toEqual({ timeout: 3000 });
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it('falls back to a timer where there is not', () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn();
      const cancel = createIdleScheduler({} as unknown as typeof globalThis)(run);
      expect(run).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1200);
      expect(run).toHaveBeenCalledTimes(1);

      const second = vi.fn();
      createIdleScheduler({} as unknown as typeof globalThis)(second)();
      vi.advanceTimersByTime(5000);
      expect(second).not.toHaveBeenCalled();
      cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('warmChunksWhenIdle', () => {
  const immediate = (run: () => void) => {
    run();
    return () => {};
  };

  it('warms one at a time, in the order given', async () => {
    const order: string[] = [];
    const warmer = (name: string): ChunkWarmer => ({
      name,
      load: () => {
        order.push(name);
        return Promise.resolve(name);
      },
    });

    warmChunksWhenIdle([warmer('a'), warmer('b'), warmer('c')], immediate);
    await vi.waitFor(() => expect(order).toEqual(['a', 'b', 'c']));
  });

  it('keeps going when one chunk cannot be fetched', async () => {
    // A chunk that will not load is the click path's problem, and it already
    // has an answer for it. Stopping here would silently leave every later
    // dialog cold because of one unrelated failure.
    const order: string[] = [];
    const chunks: ChunkWarmer[] = [
      { name: 'a', load: () => { order.push('a'); return Promise.reject(new Error('offline')); } },
      { name: 'b', load: () => { order.push('b'); return Promise.resolve(1); } },
    ];

    warmChunksWhenIdle(chunks, immediate);
    await vi.waitFor(() => expect(order).toEqual(['a', 'b']));
  });

  it('stops when cancelled, so an unmount does not keep fetching', async () => {
    const order: string[] = [];
    // Held in an object: assigned inside a callback, a plain `let` stays
    // narrowed to null and the release call below will not typecheck.
    const pending: { release: (() => void) | null } = { release: null };
    const chunks: ChunkWarmer[] = [
      { name: 'a', load: () => { order.push('a'); return new Promise<void>((resolve) => { pending.release = resolve; }); } },
      { name: 'b', load: () => { order.push('b'); return Promise.resolve(1); } },
    ];

    const cancel = warmChunksWhenIdle(chunks, immediate);
    await vi.waitFor(() => expect(order).toEqual(['a']));
    cancel();
    pending.release?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['a']);
  });
});

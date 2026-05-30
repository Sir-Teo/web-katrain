import { describe, expect, it } from 'vitest';
import {
  AnalysisQueue,
  isAnalysisQueueCanceledError,
  isAnalysisQueueStaleError,
} from '../src/utils/analysisQueue';

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AnalysisQueue', () => {
  it('runs pending jobs by priority after the active job finishes', async () => {
    const queue = new AnalysisQueue();
    const gate = deferred();
    const events: string[] = [];

    const first = queue.enqueue({
      id: 'first',
      group: 'background',
      priority: 1,
      run: async () => {
        events.push('first');
        await gate.promise;
        return 'first';
      },
    });
    const low = queue.enqueue({
      id: 'low',
      group: 'background',
      priority: 1,
      run: async () => {
        events.push('low');
        return 'low';
      },
    });
    const high = queue.enqueue({
      id: 'high',
      group: 'background',
      priority: 10,
      run: async () => {
        events.push('high');
        return 'high';
      },
    });

    await flush();
    expect(events).toEqual(['first']);
    gate.resolve();
    await Promise.all([first, high, low]);
    expect(events).toEqual(['first', 'high', 'low']);
  });

  it('starts preempting jobs immediately and suppresses canceled results', async () => {
    const queue = new AnalysisQueue();
    const lowGate = deferred<string>();
    const events: string[] = [];

    const low = queue.enqueue({
      id: 'full-game',
      group: 'background',
      priority: 1,
      run: async ({ signal }) => {
        events.push('low-start');
        const result = await lowGate.promise;
        signal.throwIfAborted();
        events.push('low-finish');
        return result;
      },
    });

    await flush();

    const high = queue.enqueue({
      id: 'live',
      group: 'interactive',
      priority: 100,
      preempt: true,
      run: async () => {
        events.push('high-start');
        return 'high';
      },
    });

    await expect(high).resolves.toBe('high');
    lowGate.resolve('low');
    await expect(low).rejects.toSatisfy(isAnalysisQueueCanceledError);
    expect(events).toEqual(['low-start', 'high-start']);
  });

  it('rejects stale results when a newer job claims the same stale key', async () => {
    const queue = new AnalysisQueue();
    const gate = deferred<string>();

    const oldJob = queue.enqueue({
      id: 'old-live',
      group: 'interactive',
      priority: 100,
      staleKey: 'live',
      run: async () => gate.promise,
    });

    const newJob = queue.enqueue({
      id: 'new-live',
      group: 'interactive',
      priority: 100,
      staleKey: 'live',
      run: async () => 'new',
    });

    gate.resolve('old');
    await expect(oldJob).rejects.toSatisfy(isAnalysisQueueStaleError);
    await expect(newJob).resolves.toBe('new');
  });

  it('reuses cached results by cache key', async () => {
    const queue = new AnalysisQueue();
    let runs = 0;

    const first = await queue.enqueue({
      id: 'cache-one',
      group: 'interactive',
      priority: 1,
      cacheKey: 'position-a',
      run: async () => {
        runs++;
        return { visits: 100 };
      },
    });
    const second = await queue.enqueue({
      id: 'cache-two',
      group: 'interactive',
      priority: 1,
      cacheKey: 'position-a',
      run: async () => {
        runs++;
        return { visits: 200 };
      },
    });

    expect(first).toEqual({ visits: 100 });
    expect(second).toEqual({ visits: 100 });
    expect(runs).toBe(1);
  });

  it('can bypass a cached result while keeping the cache key updated', async () => {
    const queue = new AnalysisQueue();
    let runs = 0;

    const first = await queue.enqueue({
      id: 'cache-one',
      group: 'interactive',
      priority: 1,
      cacheKey: 'position-a',
      run: async () => {
        runs++;
        return { visits: 100 };
      },
    });
    const refreshed = await queue.enqueue({
      id: 'cache-refresh',
      group: 'interactive',
      priority: 1,
      cacheKey: 'position-a',
      bypassCache: true,
      run: async () => {
        runs++;
        return { visits: 200 };
      },
    });
    const reusedRefresh = await queue.enqueue({
      id: 'cache-two',
      group: 'interactive',
      priority: 1,
      cacheKey: 'position-a',
      run: async () => {
        runs++;
        return { visits: 300 };
      },
    });

    expect(first).toEqual({ visits: 100 });
    expect(refreshed).toEqual({ visits: 200 });
    expect(reusedRefresh).toEqual({ visits: 200 });
    expect(runs).toBe(2);
  });
});

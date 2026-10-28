import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadNewOgsGames, listOgsFinishedGames, resolveOgsPlayer, type OgsGameSummary } from '../src/utils/ogsSync';
import { fetchOgsResource, resetOgsFetchQueueForTests } from '../src/utils/ogsQueue';

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const freshPlayer = () => json({ results: [{ id: 2, username: 'fresh' }] });
const games: OgsGameSummary[] = [101, 102].map(id => ({ id, name: '', black: 'b', white: 'w', boardSize: 9, ended: '2026-10-28' }));

beforeEach(resetOgsFetchQueueForTests);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OGS sync cancellation', () => {
  it.each(['lookup', 'listing', 'download'] as const)('aborts an active %s and releases the queue for a new sync', async phase => {
    const controller = new AbortController();
    const fetcher = vi.fn((_: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (fetcher.mock.calls.length > 1) return Promise.resolve(freshPlayer());
      return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }));
    });
    vi.stubGlobal('fetch', fetcher);
    const options = { signal: controller.signal };
    const request = phase === 'lookup'
      ? resolveOgsPlayer('obsolete', options)
      : phase === 'listing'
        ? listOgsFinishedGames(1, 25, options)
        : downloadNewOgsGames(games, new Set(), undefined, options);
    const settled = request.then(value => ({ value }), error => ({ error }));
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    const next = resolveOgsPlayer('fresh');
    controller.abort();
    if (phase === 'download') {
      await expect(settled).resolves.toEqual({ value: { synced: [], skipped: 0, failed: [] } });
    } else {
      await expect(settled).resolves.toMatchObject({ error: { name: 'AbortError' } });
    }
    await expect(next).resolves.toEqual({ id: 2, username: 'fresh' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('username=fresh');
  });

  it('cancels a queued lookup without sending it after the earlier request finishes', async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const earlier = fetchOgsResource('https://online-go.com/held');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const result = resolveOgsPlayer('obsolete', { signal: controller.signal }).catch(error => error);
    controller.abort();
    release(new Response('done'));
    await earlier;
    await expect(result).resolves.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cancels a throttled lookup promptly while retaining the server cooldown for the next sync', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '30' } }))
      .mockImplementation(async () => freshPlayer());
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const result = resolveOgsPlayer('obsolete', { signal: controller.signal }).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    controller.abort();
    await expect(result).resolves.toMatchObject({ name: 'AbortError' });
    const next = resolveOgsPlayer('fresh');
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(next).resolves.toEqual({ id: 2, username: 'fresh' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not request another game-list page after cancellation', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => {
      controller.abort();
      return json({ results: [], next: 'https://online-go.com/api/v1/players/1/games/?page=2' });
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(listOgsFinishedGames(1, 25, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

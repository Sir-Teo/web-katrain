import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OGS_MAX_COOLDOWN_MS,
  OGS_RATE_LIMIT_COOLDOWN_MS,
  fetchOgsResource,
  getOgsBackoffRemainingMs,
  isOgsCancelledError,
  parseRetryAfterMs,
  resetOgsFetchQueueForTests,
} from '../src/utils/ogsQueue';

const originalFetch = globalThis.fetch;

function response(status: number, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name] ?? null },
  } as unknown as Response;
}

beforeEach(() => {
  resetOgsFetchQueueForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  resetOgsFetchQueueForTests();
});

describe('parseRetryAfterMs', () => {
  const now = 1_000_000;

  it('reads a delay given in seconds', () => {
    expect(parseRetryAfterMs('5', now)).toBe(5000);
  });

  it('reads a delay given as an HTTP date', () => {
    expect(parseRetryAfterMs(new Date(now + 8000).toUTCString(), now)).toBeLessThanOrEqual(8000);
    expect(parseRetryAfterMs(new Date(now + 8000).toUTCString(), now)).toBeGreaterThan(6000);
  });

  it('falls back to the fixed cooldown for anything it cannot use', () => {
    expect(parseRetryAfterMs(null, now)).toBe(OGS_RATE_LIMIT_COOLDOWN_MS);
    expect(parseRetryAfterMs('soon', now)).toBe(OGS_RATE_LIMIT_COOLDOWN_MS);
    expect(parseRetryAfterMs('0', now)).toBe(OGS_RATE_LIMIT_COOLDOWN_MS);
    expect(parseRetryAfterMs('-5', now)).toBe(OGS_RATE_LIMIT_COOLDOWN_MS);
    expect(parseRetryAfterMs(new Date(now - 5000).toUTCString(), now)).toBe(OGS_RATE_LIMIT_COOLDOWN_MS);
  });

  it('caps a header that would park the sync for too long', () => {
    expect(parseRetryAfterMs('99999', now)).toBe(OGS_MAX_COOLDOWN_MS);
    expect(parseRetryAfterMs(new Date(now + 3_600_000).toUTCString(), now)).toBe(OGS_MAX_COOLDOWN_MS);
  });
});

describe('fetchOgsResource', () => {
  it('passes a normal response straight through', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(200));
    await expect(fetchOgsResource('https://online-go.com/api/v1/games/1/sgf')).resolves.toMatchObject({ status: 200 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a throttled request instead of surfacing the 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(response(200));
    globalThis.fetch = fetchMock;

    const pending = fetchOgsResource('https://online-go.com/api/v1/games/1/sgf');
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up and returns the 429 once the retries run out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429, { 'Retry-After': '1' }));
    globalThis.fetch = fetchMock;

    const pending = fetchOgsResource('https://online-go.com/api/v1/games/1/sgf', {}, { retries: 1 });
    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('makes the next request wait out a cooldown the last one earned', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(429, { 'Retry-After': '10' }));
    const throttled = fetchOgsResource('https://online-go.com/a', {}, { retries: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await throttled;

    expect(getOgsBackoffRemainingMs()).toBeGreaterThan(0);
    expect(getOgsBackoffRemainingMs()).toBeLessThanOrEqual(10_000);
  });

  it('runs requests one at a time', async () => {
    let active = 0;
    let peak = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      return response(200);
    });

    const all = Promise.all([
      fetchOgsResource('https://online-go.com/a'),
      fetchOgsResource('https://online-go.com/b'),
      fetchOgsResource('https://online-go.com/c'),
    ]);
    await vi.advanceTimersByTimeAsync(100);
    await all;

    expect(peak).toBe(1);
  });

  it('does not let one failure block the requests behind it', async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(response(200));

    const first = fetchOgsResource('https://online-go.com/a').catch(() => 'failed');
    const second = fetchOgsResource('https://online-go.com/b');
    await vi.advanceTimersByTimeAsync(10);

    expect(await first).toBe('failed');
    await expect(second).resolves.toMatchObject({ status: 200 });
  });

  it('stops waiting out a backoff when the caller cancels', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(429, { 'Retry-After': '60' }));
    const blocker = fetchOgsResource('https://online-go.com/a', {}, { retries: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await blocker;

    let cancelled = false;
    const pending = fetchOgsResource('https://online-go.com/b', {}, { isCancelled: () => cancelled })
      .then(() => 'resolved', (error: Error) => error.name);

    // Part way into a 60s cooldown the reader presses Stop.
    await vi.advanceTimersByTimeAsync(1000);
    cancelled = true;
    await vi.advanceTimersByTimeAsync(500);

    expect(await pending).toBe('OgsCancelledError');
  });

  it('does not wait out the whole cooldown before noticing a cancel', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(429, { 'Retry-After': '120' }));
    const blocker = fetchOgsResource('https://online-go.com/a', {}, { retries: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await blocker;

    let settled = false;
    const pending = fetchOgsResource('https://online-go.com/b', {}, { isCancelled: () => true })
      .catch(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(0);
    await pending;
    expect(settled).toBe(true);
  });

  it('tells a cancel apart from any other failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const wasCancel = await fetchOgsResource('https://online-go.com/a')
      .then(() => false, (error: unknown) => isOgsCancelledError(error));
    expect(wasCancel).toBe(false);
  });

  it('stops waiting when the caller aborts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(response(429, { 'Retry-After': '60' }));
    const blocker = fetchOgsResource('https://online-go.com/a', {}, { retries: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await blocker;

    const controller = new AbortController();
    const pending = fetchOgsResource('https://online-go.com/b', { signal: controller.signal })
      .then(() => 'resolved', (error: Error) => error.message);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(await pending).toMatch(/abort/i);
  });
});

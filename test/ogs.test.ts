import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractOgsGameId, isOgsUrl, loadSgfOrOgs } from '../src/utils/ogs';
import { resetOgsFetchQueueForTests } from '../src/utils/ogsQueue';

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetOgsFetchQueueForTests();
});

describe('OGS URL utilities', () => {
  it('extracts game IDs from supported Online-Go game URLs', () => {
    expect(extractOgsGameId('https://online-go.com/game/81344851')).toBe('81344851');
    expect(extractOgsGameId('http://online-go.com/game/81344851/something')).toBe('81344851');
    expect(extractOgsGameId('https://www.online-go.com/game/12345?foo=bar')).toBe('12345');
    expect(extractOgsGameId('online-go.com/game/67890')).toBe('67890');
  });

  it('rejects non-OGS and spoofed hosts', () => {
    expect(isOgsUrl('https://example.com/game/81344851')).toBe(false);
    expect(isOgsUrl('https://notonline-go.com/game/81344851')).toBe(false);
    expect(isOgsUrl('https://online-go.com.evil.test/game/81344851')).toBe(false);
    expect(isOgsUrl('https://online-go.com/profile/81344851')).toBe(false);
    expect(isOgsUrl('https://online-go.com/game/not-a-number')).toBe(false);
    expect(isOgsUrl('see https://online-go.com/game/81344851')).toBe(true);
  });

  it('keeps SGF content direct even when comments mention OGS', async () => {
    const sgf = '(;GM[1]C[https://online-go.com/game/81344851])';
    await expect(loadSgfOrOgs(sgf)).resolves.toEqual({ sgf, source: 'direct' });
  });

  it('extracts OGS game ids from surrounding pasted text', () => {
    expect(extractOgsGameId('Review this: https://online-go.com/game/81344851')).toBe('81344851');
    expect(extractOgsGameId('Review this (https://online-go.com/game/81344851).')).toBe(
      '81344851'
    );
    expect(extractOgsGameId('online-go.com/game/12345/white')).toBe('12345');
    expect(extractOgsGameId('https://example.com/game/12345')).toBeNull();
  });

  it('rejects embedded OGS-looking URLs that are not standalone game links', () => {
    expect(extractOgsGameId('https://example.com/?next=https://online-go.com/game/81344851')).toBeNull();
    expect(extractOgsGameId('https://example.com/https://online-go.com/game/81344851')).toBeNull();
    expect(extractOgsGameId('ftp://online-go.com/game/81344851')).toBeNull();
    expect(extractOgsGameId('javascript:online-go.com/game/81344851')).toBeNull();
    expect(extractOgsGameId('https://online-go.com/game/81344851abc')).toBeNull();
  });
});

describe('canceling an OGS import', () => {
  it('rejects an already canceled import without contacting OGS', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(loadSgfOrOgs('https://online-go.com/game/1', { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('aborts an active download through its original signal', async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      expect(init?.signal).toBe(controller.signal);
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      started.resolve();
    }));
    vi.stubGlobal('fetch', fetch);
    const pending = loadSgfOrOgs('https://online-go.com/game/1', { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    controller.abort();
    await rejected;
  });

  it('refuses a late response even when its transport ignores cancellation', async () => {
    const controller = new AbortController();
    const response = deferred<Response>();
    const started = deferred<void>();
    vi.stubGlobal('fetch', vi.fn(() => { started.resolve(); return response.promise; }));
    const pending = loadSgfOrOgs('https://online-go.com/game/1', { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    controller.abort();
    response.resolve(new Response('(;GM[1]SZ[9];B[dd])'));
    await rejected;
  });
});

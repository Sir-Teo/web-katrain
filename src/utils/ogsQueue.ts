/**
 * One place for every OGS request, so a sync that walks dozens of games backs
 * off when the server asks instead of turning throttling into failed downloads.
 *
 * The shape follows web-chess's lichessQueue.ts: requests run one at a time and
 * a 429 parks everything behind a shared deadline. Two differences, because a
 * library sync issues far more requests than a single cloud evaluation does:
 * `Retry-After` is honoured when the server sends it, and a throttled request
 * is retried rather than handed back for the caller to record as a failure.
 */

/** How often a backoff wait looks up to see whether it has been cancelled. */
const CANCEL_POLL_MS = 200;

export const OGS_RATE_LIMIT_COOLDOWN_MS = 30_000;
export const OGS_MAX_COOLDOWN_MS = 120_000;
export const OGS_DEFAULT_RETRIES = 2;

let ogsFetchQueue: Promise<void> = Promise.resolve();
let backoffUntilMs = 0;

export const resetOgsFetchQueueForTests = (): void => {
  ogsFetchQueue = Promise.resolve();
  backoffUntilMs = 0;
};

/** Read by `OgsSyncModal` so a throttled sync says why it has paused. */
export const getOgsBackoffRemainingMs = (): number => Math.max(0, backoffUntilMs - Date.now());

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new Error('OGS request aborted.');

export class OgsCancelledError extends Error {
  constructor() {
    super('OGS request cancelled.');
    this.name = 'OgsCancelledError';
  }
}

export const isOgsCancelledError = (error: unknown): error is OgsCancelledError =>
  error instanceof OgsCancelledError;

const sleep = (ms: number, signal: AbortSignal | null | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeoutId);
      reject(signal ? abortError(signal) : new Error('OGS request aborted.'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Waits out a backoff in short slices so a caller polling a cancel flag is not
 * held for the whole cooldown. A library sync can be parked here for a couple
 * of minutes, and the Stop button has to mean something during that.
 */
const waitOutBackoff = async (
  totalMs: number,
  signal: AbortSignal | null | undefined,
  isCancelled: (() => boolean) | undefined
): Promise<void> => {
  const deadline = Date.now() + totalMs;
  for (;;) {
    if (isCancelled?.()) throw new OgsCancelledError();
    if (signal?.aborted) throw abortError(signal);
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await sleep(Math.min(CANCEL_POLL_MS, remaining), signal);
  }
};

/**
 * `Retry-After` is either a count of seconds or an HTTP date. Anything absent,
 * unparseable, or negative falls back to the fixed cooldown, and everything is
 * capped so a hostile or confused header cannot park the sync for an hour.
 */
export const parseRetryAfterMs = (headerValue: string | null, nowMs: number): number => {
  if (!headerValue) return OGS_RATE_LIMIT_COOLDOWN_MS;

  const trimmed = headerValue.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    if (seconds <= 0) return OGS_RATE_LIMIT_COOLDOWN_MS;
    return Math.min(seconds * 1000, OGS_MAX_COOLDOWN_MS);
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const waitMs = dateMs - nowMs;
    if (waitMs <= 0) return OGS_RATE_LIMIT_COOLDOWN_MS;
    return Math.min(waitMs, OGS_MAX_COOLDOWN_MS);
  }

  return OGS_RATE_LIMIT_COOLDOWN_MS;
};

const recordRateLimit = (response: Response): number => {
  const now = Date.now();
  const waitMs = parseRetryAfterMs(response.headers?.get?.('Retry-After') ?? null, now);
  backoffUntilMs = Math.max(backoffUntilMs, now + waitMs);
  return waitMs;
};

type OgsFetchOptions = {
  /** Attempts after a 429 before the throttled response is handed back. */
  retries?: number;
  /**
   * Polled while waiting out a backoff. Returning true rejects with an
   * OgsCancelledError, which callers can tell apart from a download failure.
   */
  isCancelled?: () => boolean;
};

export const fetchOgsResource = (
  input: RequestInfo | URL,
  init: RequestInit = {},
  { retries = OGS_DEFAULT_RETRIES, isCancelled }: OgsFetchOptions = {}
): Promise<Response> => {
  const signal = init.signal;

  const run = async (): Promise<Response> => {
    let attemptsLeft = retries;

    for (;;) {
      if (isCancelled?.()) throw new OgsCancelledError();
      if (signal?.aborted) throw abortError(signal);

      const waitMs = getOgsBackoffRemainingMs();
      if (waitMs > 0) await waitOutBackoff(waitMs, signal, isCancelled);
      if (isCancelled?.()) throw new OgsCancelledError();
      if (signal?.aborted) throw abortError(signal);

      const response = await fetch(input, init);
      if (response.status !== 429) return response;

      recordRateLimit(response);
      if (attemptsLeft <= 0) return response;
      attemptsLeft -= 1;
    }
  };

  const request = ogsFetchQueue.then(run, run);
  ogsFetchQueue = request.then(
    () => undefined,
    () => undefined
  );
  return request;
};

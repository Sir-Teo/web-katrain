/**
 * Pulling a dialog's chunk in while nothing else is happening.
 *
 * Every dialog is a lazy() chunk, and the service worker cannot precache them:
 * their names are content-hashed, so PRECACHE_URLS in public/sw.js has no way
 * to list them. The first open therefore pays for the fetch, the parse and the
 * module evaluation all at once, on the click. Measured on the production
 * preview: 317ms to open Settings cold against 4.6ms once its chunk is in
 * memory. Doing that work while the app is idle is what turns the first open
 * into the second one.
 *
 * This is speculative work with someone else's bandwidth, so it asks first.
 */

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

type WarmingNavigator = {
  connection?: NetworkInformation;
};

/**
 * Slow and metered connections are exactly the ones where a wasted chunk costs
 * most and a saved round trip is worth most, and there is no way to have both.
 * Data Saver is a stated preference, so it wins outright; 2g is where a
 * speculative 33KB competes with something the reader actually asked for.
 */
export function shouldWarmChunks(target?: WarmingNavigator | null): boolean {
  const connection = target?.connection;
  if (!connection) return true;
  if (connection.saveData === true) return false;
  const effectiveType = connection.effectiveType;
  return effectiveType !== 'slow-2g' && effectiveType !== '2g';
}

export type IdleScheduler = (run: () => void) => () => void;

/**
 * requestIdleCallback where it exists, a timer where it does not. The timeout
 * matters: a page that never goes fully idle would otherwise never warm
 * anything, and the whole point is that the first open should not be the one
 * that pays.
 */
export function createIdleScheduler(scope: typeof globalThis = globalThis): IdleScheduler {
  const request = (scope as unknown as {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  });
  if (typeof request.requestIdleCallback === 'function') {
    return (run) => {
      const handle = request.requestIdleCallback!(run, { timeout: 3000 });
      return () => request.cancelIdleCallback?.(handle);
    };
  }
  return (run) => {
    const handle = setTimeout(run, 1200);
    return () => clearTimeout(handle);
  };
}

export type ChunkWarmer = {
  /** Only for diagnostics; the loader is the thing that matters. */
  name: string;
  load: () => Promise<unknown>;
};

/**
 * Warms one chunk per idle slice, in order, cheapest and most
 * latency-sensitive first.
 *
 * One at a time on purpose. Firing every import at once puts several chunks'
 * worth of parsing into a single frame, which is the jank this is meant to
 * avoid -- and it would do it during the idle moment right after load, when
 * the engine and the board are still settling.
 *
 * A rejected import is not reported. It means the chunk is unreachable, which
 * the click path already handles: the import is retried there and
 * LazyModalBoundary explains a failure the reader can actually see. Warming
 * failing quietly is the correct outcome; it was never asked for.
 */
export function warmChunksWhenIdle(
  warmers: readonly ChunkWarmer[],
  schedule: IdleScheduler,
): () => void {
  let cancelled = false;
  let cancelPending: (() => void) | null = null;

  const step = (index: number): void => {
    if (cancelled || index >= warmers.length) return;
    cancelPending = schedule(() => {
      if (cancelled) return;
      void warmers[index]!.load()
        .catch(() => undefined)
        .then(() => step(index + 1));
    });
  };

  step(0);

  return () => {
    cancelled = true;
    cancelPending?.();
  };
}

import React from 'react';

/**
 * A lazy component that stops being lazy once its chunk is in memory.
 *
 * React.lazy suspends the first time it renders, even when the module behind
 * it has already been imported: the payload it holds is not initialised until
 * React renders the component, so the click still commits a Suspense fallback.
 * And once a fallback is committed React throttles the swap back to real
 * content, to keep a fallback from flashing away in a frame.
 *
 * That throttle is the whole cost of opening a dialog here. Measured on the
 * production preview, each on a fresh load with its chunk already warmed and
 * no second fetch on the click: Settings (94.1KB) took 317ms and the command
 * palette (7.0KB) took 306ms. Thirteen times the code for the same wait, with
 * no long task anywhere in it -- the main thread was idle, waiting.
 *
 * So the fix is not to make the loading faster; it is not to suspend. When the
 * module is already here, render the component itself and React has nothing to
 * wait for.
 *
 * The choice is frozen per mount. If it were read at render time, a dialog
 * opened before warming finished would be rendering through the lazy wrapper,
 * and the moment warming resolved the element type would change underneath it
 * -- React unmounts and remounts on a changed type, so a half-filled settings
 * form would be thrown away while someone was using it.
 */
export type WarmableLazy<P extends object> = {
  Component: React.ComponentType<P>;
  /** Imports the chunk and marks the component ready to render synchronously. */
  warm: () => Promise<unknown>;
  /** Test seam: whether the next mount will skip Suspense. */
  isWarm: () => boolean;
};

export function createWarmableLazy<M, P extends object>(
  load: () => Promise<M>,
  pick: (module: M) => React.ComponentType<P>,
): WarmableLazy<P> {
  let resolved: React.ComponentType<P> | null = null;
  const Lazy = React.lazy(() => load().then((module) => ({ default: pick(module) })));

  const Component: React.FC<P> = (props) => {
    const [Chosen] = React.useState<React.ComponentType<P>>(() => resolved ?? Lazy);
    return React.createElement(Chosen, props);
  };
  Component.displayName = 'WarmableLazy';

  return {
    Component,
    warm: () => load().then((module) => {
      resolved = pick(module);
      return module;
    }),
    isWarm: () => resolved !== null,
  };
}

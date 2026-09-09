/**
 * Lets the Android back gesture close the overlay on screen instead of leaving
 * the app.
 *
 * Nothing here touched the History API, so a back press with Settings, the
 * library or a confirmation open went straight past it: in a browser tab that
 * is a navigation away from a game the `beforeunload` guard can only warn
 * about, and in the installed PWA it closes the app. Every Android idiom says
 * back should dismiss what is on top first.
 *
 * One entry, not one per overlay. A marker is pushed when the first overlay
 * opens and re-pushed after each back press while any remain, so however deep
 * the stack goes the history never holds more than a single extra entry and
 * cannot be left half-unwound. The marker is dropped when the last overlay
 * closes some other way -- a button, Escape -- so a back press after that does
 * what it always did.
 *
 * Dropping it is deferred by a tick, and that is not a detail. `history.back()`
 * is asynchronous: the entry is still current when the call returns. A close
 * immediately followed by an open -- which is what React's StrictMode does to
 * every effect in development, and what one dialog replacing another does in
 * production -- would then find the marker still there, skip pushing a fresh
 * one, and hand the next back press an entry that belongs to the page. Measured
 * before this: with Settings open, history.length was unchanged and the marker
 * absent, and a back press left the app. Deferring lets the re-open cancel the
 * drop and keep the entry it already has.
 */
const MARKER = 'webKatrainOverlay';

export interface BackStackWindow {
  history: {
    state: unknown;
    pushState: (state: unknown, unused: string) => void;
    back: () => void;
  };
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (handle: number) => void;
  addEventListener: (type: 'popstate', listener: () => void) => void;
  removeEventListener: (type: 'popstate', listener: () => void) => void;
}

export interface OverlayBackStack {
  /** Registers an open overlay; returns the id to release it with. */
  open: (close: () => void) => number;
  /** Releases an overlay that closed some other way. */
  release: (id: number) => void;
  /** Open overlays, innermost last. Exposed for tests. */
  depth: () => number;
}

export function createOverlayBackStack(win: BackStackWindow): OverlayBackStack {
  const stack: Array<{ id: number; close: () => void }> = [];
  let nextId = 1;
  /** popstate events this stack caused, which are not a back press. */
  let selfPops = 0;
  /** Only ever go back over an entry this page pushed. A marker restored with
      a reloaded session is not one, and going back over it could leave. */
  let pushedByUs = false;
  /** A drop waiting for the tick that would let a re-open cancel it. */
  let dropTimer: number | null = null;
  /** history.back() called, its popstate not yet delivered. */
  let backInFlight = false;
  /** An overlay opened during that window and still needs an entry. */
  let markerWanted = false;
  let listening = false;

  const markerPresent = () =>
    !!(win.history.state as Record<string, unknown> | null | undefined)?.[MARKER];

  const pushMarker = () => {
    if (backInFlight) {
      markerWanted = true;
      return;
    }
    if (pushedByUs || markerPresent()) return;
    win.history.pushState({ [MARKER]: true }, '');
    pushedByUs = true;
  };

  const cancelDrop = () => {
    if (dropTimer === null) return;
    win.clearTimeout(dropTimer);
    dropTimer = null;
  };

  const scheduleDrop = () => {
    if (dropTimer !== null || !pushedByUs) return;
    dropTimer = win.setTimeout(() => {
      dropTimer = null;
      if (stack.length > 0) return;
      pushedByUs = false;
      backInFlight = true;
      selfPops += 1;
      win.history.back();
    }, 0);
  };

  const onPopState = () => {
    if (selfPops > 0) {
      selfPops -= 1;
      backInFlight = false;
      if (markerWanted) {
        markerWanted = false;
        if (stack.length > 0) pushMarker();
      }
      return;
    }
    // The entry just popped was ours if we had pushed one.
    pushedByUs = false;
    const entry = stack.pop();
    if (!entry) return;
    if (stack.length > 0) pushMarker();
    entry.close();
  };

  return {
    open(close) {
      if (!listening) {
        win.addEventListener('popstate', onPopState);
        listening = true;
      }
      cancelDrop();
      const id = nextId;
      nextId += 1;
      stack.push({ id, close });
      pushMarker();
      return id;
    },
    release(id) {
      const at = stack.findIndex((entry) => entry.id === id);
      // Already gone means a back press took it, and the entry with it.
      if (at === -1) return;
      stack.splice(at, 1);
      if (stack.length > 0) return;
      scheduleDrop();
    },
    depth: () => stack.length,
  };
}

let shared: OverlayBackStack | null = null;

/** The stack bound to the real window, created on first use. */
export function overlayBackStack(): OverlayBackStack | null {
  if (typeof window === 'undefined') return null;
  shared ??= createOverlayBackStack(window as unknown as BackStackWindow);
  return shared;
}

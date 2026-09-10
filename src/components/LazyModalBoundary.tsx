import React from 'react';

interface LazyModalBoundaryProps {
  onError: (error: unknown) => void;
  children: React.ReactNode;
}

interface LazyModalBoundaryState {
  failed: boolean;
}

/**
 * Every dialog is a lazily loaded chunk, and they all share one Suspense.
 * Suspense does not catch errors, so a chunk that fails to load — which is what
 * a tab left open across a deploy sees — reached the app-level boundary and
 * replaced the whole app: board gone, 67 controls down to 2, mid-game.
 *
 * Keep that contained. The board and every control the reader was using stay
 * put; only the dialog layer goes quiet, and `onError` explains why. It stays
 * quiet until a reload rather than resetting, because the failing chunk would
 * throw again on the next render and loop.
 */
export class LazyModalBoundary extends React.Component<LazyModalBoundaryProps, LazyModalBoundaryState> {
  state: LazyModalBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazyModalBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  render(): React.ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/**
 * What a dialog's first open looks like while its chunk is still arriving.
 *
 * Every dialog here is a lazy() chunk, and they shared one Suspense with no
 * fallback at all. Measured on the production preview with a cold cache: the
 * first click on Settings changed nothing on screen -- no dialog, no
 * indicator, not one byte of markup -- for 327ms. A click that leaves no mark
 * reads as a click that was missed, and the obvious response, clicking again,
 * does nothing either.
 *
 * Almost none of that wait was loading; see warmableLazy.ts, which measured it
 * and removed it for the dialogs behind the always-visible controls. This
 * fallback still covers everything that route does not: the other dialogs, and
 * a click that beats the warmer to it.
 *
 * The scrim is the acknowledgement: it is what opening a dialog looks like,
 * and it stops the click that follows from landing on the board behind it.
 *
 * Nothing here takes focus. The dialog moves focus when it mounts, and doing
 * it twice would leave a screen reader describing a panel that has already
 * been replaced. role="status" is enough to announce the wait.
 *
 * This only paints when there is a wait to report. A chunk already in memory
 * resolves within the same commit and React never shows a fallback, so
 * reopening a dialog is untouched by this.
 */
export const LazyModalFallback: React.FC = () => (
  <div
    data-lazy-modal-loading="true"
    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 mobile-safe-inset mobile-safe-area-bottom"
  >
    <div
      role="status"
      className="ui-panel rounded-lg border shadow-xl px-6 py-4 text-sm text-[var(--ui-text-muted)]"
    >
      Opening…
    </div>
  </div>
);

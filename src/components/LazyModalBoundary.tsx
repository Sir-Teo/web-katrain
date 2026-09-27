import React from 'react';
import { isStaleBuildError } from '../utils/errorReporting';

interface LazyModalBoundaryProps {
  /** Closes the dialog this boundary wraps. Without it only Retry and Reload are offered. */
  onDismiss?: () => void;
  /** Told once per failure, for anyone who wants to log it. */
  onError?: (error: unknown) => void;
  children: React.ReactNode;
}

interface LazyModalBoundaryState {
  failed: boolean;
  staleBuild: boolean;
}

/**
 * One dialog's failure, kept to that dialog.
 *
 * Every dialog is a lazily loaded chunk. Suspense does not catch errors, so a
 * chunk that fails to load -- a tab left open across a deploy, or a dropped
 * connection -- reached the app-level boundary and replaced the whole app.
 *
 * Each dialog now has a boundary of its own, inside the shared Suspense. A
 * failure shows a small panel in the dialog's place, with Retry, Reload and
 * (when the dialog can be closed) Close. Every other dialog keeps working, and
 * the failed one gets a fresh boundary the next time it is opened. There used
 * to be one boundary around all of them that rendered nothing after any
 * failure, so one bad chunk left every dialog dead until a reload.
 *
 * Retry is only worth offering because createWarmableLazy forgets a failed
 * import: React.lazy caches a rejection for good, so without that the retried
 * render would throw the same error again.
 */
export class LazyModalBoundary extends React.Component<LazyModalBoundaryProps, LazyModalBoundaryState> {
  state: LazyModalBoundaryState = { failed: false, staleBuild: false };

  static getDerivedStateFromError(error: unknown): LazyModalBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return { failed: true, staleBuild: isStaleBuildError(message) };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  retry = (): void => {
    this.setState({ failed: false, staleBuild: false });
  };

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <LazyModalRecovery
        staleBuild={this.state.staleBuild}
        onRetry={this.retry}
        onDismiss={this.props.onDismiss}
      />
    );
  }
}

const recoveryButtonClass =
  'min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]';

/** What stands in for a dialog that could not be opened. */
export const LazyModalRecovery: React.FC<{
  staleBuild: boolean;
  onRetry: () => void;
  onDismiss?: () => void;
  onReload?: () => void;
}> = ({ staleBuild, onRetry, onDismiss, onReload = () => window.location.reload() }) => (
  <div
    data-lazy-modal-failed="true"
    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 mobile-safe-inset mobile-safe-area-bottom"
    onKeyDown={(event) => {
      if (event.key === 'Escape' && onDismiss) {
        event.stopPropagation();
        onDismiss();
      }
    }}
  >
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="lazy-modal-failed-message"
      className="ui-panel flex w-full max-w-sm flex-col gap-3 rounded-lg border p-4 shadow-xl"
    >
      <p id="lazy-modal-failed-message" className="text-sm leading-6 text-[var(--ui-text)]">
        {staleBuild
          ? 'Web KaTrain has been updated, or the connection dropped. Reload to open this.'
          : 'That panel could not be opened.'}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        {onDismiss && (
          <button type="button" className={recoveryButtonClass} onClick={onDismiss}>
            Close
          </button>
        )}
        <button type="button" className={recoveryButtonClass} onClick={onRetry}>
          Retry
        </button>
        <button
          type="button"
          // Focus lands on the button most likely to work, so Enter fixes it.
          autoFocus
          className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-contrast)]"
          onClick={onReload}
        >
          Reload
        </button>
      </div>
    </div>
  </div>
);

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

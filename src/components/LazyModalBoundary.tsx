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

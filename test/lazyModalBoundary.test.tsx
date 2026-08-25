import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LazyModalBoundary } from '../src/components/LazyModalBoundary';

describe('LazyModalBoundary', () => {
  it('goes quiet on failure instead of rethrowing to the app', () => {
    expect(LazyModalBoundary.getDerivedStateFromError()).toEqual({ failed: true });

    // Rendering nothing is what keeps the board and controls alive; before this
    // a missing chunk reached the app boundary and took the whole app with it.
    const boundary = new LazyModalBoundary({ onError: () => {}, children: 'modal' });
    boundary.state = { failed: true };
    expect(boundary.render()).toBeNull();
    boundary.state = { failed: false };
    expect(boundary.render()).toBe('modal');
  });

  it('reports the failure so the reader is not left with a dead control', () => {
    const onError = vi.fn();
    const boundary = new LazyModalBoundary({ onError, children: null });
    const error = new Error('Failed to fetch dynamically imported module: /assets/SettingsModal-x.js');

    boundary.componentDidCatch(error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('wraps every lazily loaded dialog, and names the cause it can recognise', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    // One Suspense holds all 16 dialogs, and Suspense does not catch errors,
    // so the boundary has to sit outside it.
    const open = layout.indexOf('<LazyModalBoundary');
    const suspense = layout.indexOf('<Suspense fallback={null}>');
    const close = layout.indexOf('</LazyModalBoundary>');
    expect(open).toBeGreaterThan(-1);
    expect(open).toBeLessThan(suspense);
    expect(layout.indexOf('</Suspense>', suspense)).toBeLessThan(close);

    // A deploy is news, not a fault.
    expect(layout).toContain("'Web KaTrain has been updated. Reload to open this.'");
    expect(layout).toContain("stale ? 'info' : 'error'");
  });
});

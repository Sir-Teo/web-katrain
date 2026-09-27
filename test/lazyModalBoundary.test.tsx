import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LazyModalBoundary, LazyModalFallback } from '../src/components/LazyModalBoundary';

describe('LazyModalBoundary', () => {
  const failedBoundary = (props: Partial<React.ComponentProps<typeof LazyModalBoundary>> = {}) => {
    const boundary = new LazyModalBoundary({ children: 'modal', ...props });
    // Not mounted, so stand in for React's state update.
    boundary.setState = ((next: Partial<typeof boundary.state>) => {
      boundary.state = { ...boundary.state, ...next };
    }) as typeof boundary.setState;
    boundary.state = LazyModalBoundary.getDerivedStateFromError(new Error('boom'));
    return boundary;
  };

  it('contains a failure instead of rethrowing to the app', () => {
    expect(LazyModalBoundary.getDerivedStateFromError(new Error('boom'))).toEqual({ failed: true, staleBuild: false });
    expect(
      LazyModalBoundary.getDerivedStateFromError(
        new Error('Failed to fetch dynamically imported module: /assets/SettingsModal-x.js')
      )
    ).toEqual({ failed: true, staleBuild: true });

    const boundary = new LazyModalBoundary({ children: 'modal' });
    expect(boundary.render()).toBe('modal');
  });

  it('says what happened and offers a way out, instead of rendering nothing', () => {
    // It used to render null for good: the click did nothing, and neither did
    // any other dialog until a reload.
    const onDismiss = vi.fn();
    const markup = renderToStaticMarkup(<>{failedBoundary({ onDismiss }).render()}</>);

    expect(markup).toContain('data-lazy-modal-failed="true"');
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain('That panel could not be opened.');
    expect(markup).toContain('>Retry<');
    expect(markup).toContain('>Reload<');
    expect(markup).toContain('>Close<');

    // A dialog with no way to close (the auto-save prompt) still gets Retry
    // and Reload, but no Close that would do nothing.
    const noClose = renderToStaticMarkup(<>{failedBoundary().render()}</>);
    expect(noClose).not.toContain('>Close<');
    expect(noClose).toContain('>Retry<');
  });

  it('names a deploy as the likely cause when it can tell', () => {
    const boundary = new LazyModalBoundary({ children: null });
    boundary.state = LazyModalBoundary.getDerivedStateFromError(
      new Error('Failed to fetch dynamically imported module: /assets/SettingsModal-x.js')
    );
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toContain('Web KaTrain has been updated');
  });

  it('renders the dialog again on Retry', () => {
    const boundary = failedBoundary();
    expect(boundary.render()).not.toBe('modal');

    boundary.retry();

    expect(boundary.state.failed).toBe(false);
    expect(boundary.render()).toBe('modal');
  });

  it('reports the failure to anyone listening', () => {
    const onError = vi.fn();
    const boundary = new LazyModalBoundary({ onError, children: null });
    const error = new Error('Failed to fetch dynamically imported module: /assets/SettingsModal-x.js');

    boundary.componentDidCatch(error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('gives every dialog a boundary of its own inside the shared Suspense', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const suspense = layout.indexOf('<Suspense fallback={<LazyModalFallback />}>');
    const suspenseEnd = layout.indexOf('</Suspense>', suspense);
    expect(suspense).toBeGreaterThan(-1);

    // One boundary around all of them meant one failure silenced every dialog
    // until a reload. None may sit outside the Suspense any more.
    expect(layout.slice(0, suspense)).not.toContain('<LazyModalBoundary');
    const block = layout.slice(suspense, suspenseEnd);

    const dialogs = [...block.matchAll(/\{(\w+) && \(/g)].map((m) => m[1]!);
    const boundaries = block.match(/<LazyModalBoundary\b/g) ?? [];
    expect(dialogs.length).toBeGreaterThan(15);
    expect(boundaries.length).toBe(dialogs.length);
    for (const name of dialogs) {
      const at = block.indexOf(`{${name} && (`);
      expect(block.slice(at, at + 200), name).toMatch(/^\{\w+ && \(\s*<LazyModalBoundary\b/);
    }
  });

  it('marks the click while the chunk is still coming', () => {
    // This Suspense used to pass fallback={null}, so the first click on a
    // dialog left the screen untouched for as long as the chunk took --
    // measured at 327ms for Settings on the production preview, of which only
    // 7ms was the network. A click with no visible answer reads as a missed
    // click.
    const markup = renderToStaticMarkup(<LazyModalFallback />);

    expect(markup).toContain('data-lazy-modal-loading="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Opening');
    // The scrim is the point: it says a dialog is on its way, and it keeps the
    // next click off the board underneath.
    expect(markup).toContain('fixed inset-0');

    // Focus belongs to the dialog that is about to mount. Taking it here would
    // move it twice and leave a screen reader on a panel that no longer exists.
    expect(markup).not.toContain('autofocus');
    expect(markup).not.toContain('tabindex');
  });
});

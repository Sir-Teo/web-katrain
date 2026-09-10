import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { createAppErrorReport, type AppErrorReport } from '../src/utils/errorReporting';

type BoundaryState = {
  report: AppErrorReport | null;
  previousReport: AppErrorReport | null;
  fallbackCopyState: 'idle' | 'copied' | 'failed';
  noticeCopyState: 'idle' | 'copied' | 'failed';
};

const idleState: BoundaryState = {
  report: null,
  previousReport: null,
  fallbackCopyState: 'idle',
  noticeCopyState: 'idle',
};

/**
 * The boundary is the one component that renders only when everything else has
 * already failed, so it is driven here as a plain object rather than through a
 * render that throws: error boundaries do not catch during server rendering,
 * and this suite has no DOM.
 */
function renderWith(state: Partial<BoundaryState>): string {
  const boundary = new AppErrorBoundary({ children: <p>the app</p> });
  boundary.state = { ...idleState, ...state };
  return renderToStaticMarkup(boundary.render() as ReactElement);
}

const report = (message: string): AppErrorReport =>
  createAppErrorReport('react-render', new Error(message));

describe('AppErrorBoundary', () => {
  it('records what crashed, with the page it crashed on', () => {
    const derived = AppErrorBoundary.getDerivedStateFromError(new Error('boom')) as Partial<BoundaryState>;

    expect(derived.report?.type).toBe('react-render');
    expect(derived.report?.message).toBe('boom');
    // A copy from the previous crash must not read as a copy of this one.
    expect(derived.fallbackCopyState).toBe('idle');
  });

  it('calls a crash a crash', () => {
    const html = renderWith({ report: report('Cannot read properties of undefined') });

    expect(html).toContain('data-app-error-boundary="true"');
    expect(html).toContain('Web KaTrain hit an unexpected error');
    expect(html).toContain('Cannot read properties of undefined');
    expect(html).toContain('Reload app');
    expect(html).toContain('Copy diagnostics');
    // Whatever crashed is not safe to keep rendering.
    expect(html).not.toContain('<p>the app</p>');
  });

  it('calls a deploy a deploy', () => {
    // A tab open across a deploy asks for chunk names that are gone. Nothing is
    // broken, so the page must not say something is.
    const html = renderWith({
      report: report('Failed to fetch dynamically imported module: /assets/index-a1b2c3.js'),
    });

    expect(html).toContain('Web KaTrain has been updated');
    expect(html).not.toContain('hit an unexpected error');
    expect(html).toContain('Reload to pick it up.');
  });

  it('names itself to whatever focus lands on it', () => {
    const html = renderWith({ report: report('boom') });

    // Rendering the fallback unmounts the app, so focus is moved here; the
    // element has to be focusable and has to carry a name when it is.
    expect(html).toContain('tabindex="-1"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`<h1 id="${labelledBy}"`);
  });

  it('moves focus to the fallback only on the way into it', () => {
    const boundary = new AppErrorBoundary({ children: null });
    let focused = 0;
    (boundary as unknown as { fallbackRef: { current: { focus: () => void } | null } }).fallbackRef = {
      current: { focus: () => { focused += 1; } },
    };
    const crashed: BoundaryState = { ...idleState, report: report('boom') };

    boundary.state = crashed;
    boundary.componentDidUpdate({ children: null }, idleState);
    expect(focused).toBe(1);

    // Copying the diagnostics re-renders the fallback. Focus must stay on the
    // Copy button rather than being yanked back to the container.
    boundary.componentDidUpdate({ children: null }, crashed);
    expect(focused).toBe(1);
  });

  it('keeps the app on screen and reports the crash it recovered from', () => {
    const html = renderWith({ previousReport: report('worker died') });

    expect(html).toContain('data-app-error-notice="true"');
    expect(html).toContain('Recovered from a previous crash');
    expect(html).toContain('worker died');
    expect(html).toContain('Copy details');
    expect(html).toContain('Dismiss');
    // The notice sits over a working app; it must not replace it.
    expect(html).toContain('<p>the app</p>');
    expect(html).not.toContain('data-app-error-boundary="true"');
  });

  it('drops the notice once it is dismissed', () => {
    const boundary = new AppErrorBoundary({ children: null });
    boundary.state = { ...idleState, previousReport: report('worker died'), noticeCopyState: 'copied' };
    const updates: Partial<BoundaryState>[] = [];
    boundary.setState = ((update: Partial<BoundaryState>) => updates.push(update)) as typeof boundary.setState;

    boundary.dismissPreviousReport();

    expect(updates).toEqual([{ previousReport: null, noticeCopyState: 'idle' }]);
  });

  it('shows nothing of its own when nothing has gone wrong', () => {
    const html = renderWith({});

    expect(html).toBe('<p>the app</p>');
  });
});

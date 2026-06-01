import React from 'react';
import { FaCheck, FaCopy, FaExclamationTriangle, FaRedo, FaTimes } from 'react-icons/fa';
import { copyTextToClipboard } from '../utils/clipboard';
import {
  clearStoredErrorReport,
  createAppErrorReport,
  formatAppErrorReport,
  readStoredErrorReport,
  storeErrorReport,
  type AppErrorReport,
} from '../utils/errorReporting';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type CopyState = 'idle' | 'copied' | 'failed';

type AppErrorBoundaryState = {
  report: AppErrorReport | null;
  previousReport: AppErrorReport | null;
  fallbackCopyState: CopyState;
  noticeCopyState: CopyState;
};

const startupErrorReport = readStoredErrorReport();
if (startupErrorReport) clearStoredErrorReport();

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    report: null,
    previousReport: startupErrorReport,
    fallbackCopyState: 'idle',
    noticeCopyState: 'idle',
  };

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    return {
      report: createAppErrorReport('react-render', error, {
        url: typeof window === 'undefined' ? undefined : window.location.href,
        userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
      }),
      fallbackCopyState: 'idle',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const report = createAppErrorReport('react-render', error, {
      componentStack: info.componentStack ?? undefined,
      url: typeof window === 'undefined' ? undefined : window.location.href,
      userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    });
    storeErrorReport(report);
    this.setState({ report });
  }

  copyReport = async (report: AppErrorReport, target: 'fallback' | 'notice') => {
    const ok = await copyTextToClipboard(formatAppErrorReport(report));
    const key = target === 'fallback' ? 'fallbackCopyState' : 'noticeCopyState';
    this.setState({ [key]: ok ? 'copied' : 'failed' } as Pick<AppErrorBoundaryState, typeof key>);
  };

  reload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  dismissPreviousReport = () => {
    this.setState({ previousReport: null, noticeCopyState: 'idle' });
  };

  renderPreviousReportNotice(report: AppErrorReport) {
    const copyState = this.state.noticeCopyState;
    return (
      <div
        role="status"
        data-app-error-notice="true"
        className="fixed bottom-3 left-3 z-50 w-[min(25rem,calc(100vw-1.5rem))] rounded-md border border-[var(--ui-warning)] bg-[var(--ui-panel)] p-3 text-[var(--ui-text)] shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <FaExclamationTriangle className="mt-0.5 shrink-0 text-[var(--ui-warning)]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Recovered from a previous crash</div>
            <div className="mt-1 line-clamp-2 text-xs text-[var(--ui-text-muted)]">{report.message}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="panel-action-button inline-flex items-center gap-1"
                onClick={() => void this.copyReport(report, 'notice')}
              >
                {copyState === 'copied' ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />}
                {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy details'}
              </button>
              <button
                type="button"
                className="panel-action-button inline-flex items-center gap-1"
                onClick={this.dismissPreviousReport}
              >
                <FaTimes aria-hidden="true" />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderFallback(report: AppErrorReport) {
    const copyState = this.state.fallbackCopyState;
    return (
      <main
        data-app-error-boundary="true"
        className="flex min-h-screen items-center justify-center bg-[var(--ui-bg)] px-4 py-8 text-[var(--ui-text)]"
      >
        <section className="w-full max-w-xl rounded-md border border-[var(--ui-border)] bg-[var(--ui-panel)] p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--ui-danger-soft)] text-[var(--ui-danger)]">
              <FaExclamationTriangle aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">Web KaTrain hit an unexpected error</h1>
              <p className="mt-2 text-sm text-[var(--ui-text-muted)]">
                Your browser captured diagnostics so the problem can be inspected without losing the trail.
              </p>
            </div>
          </div>

          <pre className="mt-4 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--ui-border)] bg-[var(--ui-input)] p-3 text-xs text-[var(--ui-text-muted)]">
            {report.message}
          </pre>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="panel-action-button inline-flex items-center gap-1"
              onClick={this.reload}
            >
              <FaRedo aria-hidden="true" />
              Reload app
            </button>
            <button
              type="button"
              className="panel-action-button inline-flex items-center gap-1"
              onClick={() => void this.copyReport(report, 'fallback')}
            >
              {copyState === 'copied' ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />}
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy diagnostics'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  render() {
    const { report, previousReport } = this.state;
    if (report) return this.renderFallback(report);
    return (
      <>
        {this.props.children}
        {previousReport ? this.renderPreviousReportNotice(previousReport) : null}
      </>
    );
  }
}

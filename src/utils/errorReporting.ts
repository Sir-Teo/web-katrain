import { getSessionStorage } from './storage';

export const APP_ERROR_STORAGE_KEY = 'web-katrain:last-error:v1';

export type AppErrorKind = 'global-error' | 'unhandled-rejection' | 'react-render';

export type AppErrorReport = {
  type: AppErrorKind;
  message: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  line?: number;
  column?: number;
  url?: string;
  userAgent?: string;
  occurredAt: string;
};

type ReportEnvironment = {
  url?: string;
  userAgent?: string;
  now?: Date;
};

function getWindowEnvironment(target?: Window | null): ReportEnvironment {
  const source = target ?? (typeof window === 'undefined' ? null : window);
  return {
    url: source?.location?.href,
    userAgent: source?.navigator?.userAgent,
  };
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  try {
    const serialized = JSON.stringify(value);
    if (serialized) return serialized;
  } catch {
    // Fall through to String for circular or host objects.
  }
  return String(value);
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return stringifyUnknown(error);
}

function stackFromError(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

export function createAppErrorReport(
  type: AppErrorKind,
  error: unknown,
  details: Partial<Omit<AppErrorReport, 'type' | 'stack' | 'occurredAt'>> & ReportEnvironment = {}
): AppErrorReport {
  const occurredAt = (details.now ?? new Date()).toISOString();
  return {
    type,
    message: details.message ?? messageFromError(error),
    stack: stackFromError(error),
    componentStack: details.componentStack,
    source: details.source,
    line: details.line,
    column: details.column,
    url: details.url,
    userAgent: details.userAgent,
    occurredAt,
  };
}

function isAppErrorReport(value: unknown): value is AppErrorReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<AppErrorReport>;
  return (
    (report.type === 'global-error' || report.type === 'unhandled-rejection' || report.type === 'react-render') &&
    typeof report.message === 'string' &&
    typeof report.occurredAt === 'string'
  );
}

export function readStoredErrorReport(storage: Storage | null = getSessionStorage()): AppErrorReport | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(APP_ERROR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isAppErrorReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function storeErrorReport(
  report: AppErrorReport,
  storage: Storage | null = getSessionStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(APP_ERROR_STORAGE_KEY, JSON.stringify(report));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredErrorReport(storage: Storage | null = getSessionStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(APP_ERROR_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function consumeStoredErrorReport(storage: Storage | null = getSessionStorage()): AppErrorReport | null {
  const report = readStoredErrorReport(storage);
  if (report) clearStoredErrorReport(storage);
  return report;
}

export function formatAppErrorReport(report: AppErrorReport): string {
  const lines = [
    `Web KaTrain diagnostics`,
    `Type: ${report.type}`,
    `Time: ${report.occurredAt}`,
    `Message: ${report.message}`,
  ];
  if (report.source) lines.push(`Source: ${report.source}`);
  if (report.line !== undefined || report.column !== undefined) {
    lines.push(`Location: ${report.line ?? '?'}:${report.column ?? '?'}`);
  }
  if (report.url) lines.push(`URL: ${report.url}`);
  if (report.userAgent) lines.push(`User agent: ${report.userAgent}`);
  if (report.componentStack) lines.push('', 'React component stack:', report.componentStack.trim());
  if (report.stack) lines.push('', 'Stack:', report.stack);
  return lines.join('\n');
}

export function installGlobalErrorHandlers(
  target: Window | null = typeof window === 'undefined' ? null : window,
  storage: Storage | null = getSessionStorage()
): () => void {
  if (!target) return () => undefined;
  const environment = () => getWindowEnvironment(target);

  const handleError = (event: ErrorEvent) => {
    const report = createAppErrorReport('global-error', event.error ?? event.message, {
      ...environment(),
      message: event.message || undefined,
      source: event.filename || undefined,
      line: event.lineno || undefined,
      column: event.colno || undefined,
    });
    storeErrorReport(report, storage);
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const report = createAppErrorReport('unhandled-rejection', event.reason, environment());
    storeErrorReport(report, storage);
  };

  target.addEventListener('error', handleError);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    target.removeEventListener('error', handleError);
    target.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}

import { describe, expect, it, vi } from 'vitest';
import {
  APP_ERROR_STORAGE_KEY,
  clearStoredErrorReport,
  consumeStoredErrorReport,
  createAppErrorReport,
  formatAppErrorReport,
  installGlobalErrorHandlers,
  readStoredErrorReport,
  storeErrorReport,
} from '../src/utils/errorReporting';

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } satisfies Storage;
}

describe('app error reporting', () => {
  it('creates and formats copyable diagnostics', () => {
    const error = new Error('board exploded');
    const report = createAppErrorReport('react-render', error, {
      componentStack: 'at GoBoard',
      url: 'http://127.0.0.1:5177/',
      userAgent: 'vitest',
      now: new Date('2026-05-31T12:00:00.000Z'),
    });

    expect(report.message).toBe('board exploded');
    expect(report.stack).toContain('board exploded');
    expect(report.occurredAt).toBe('2026-05-31T12:00:00.000Z');

    const formatted = formatAppErrorReport(report);
    expect(formatted).toContain('Web KaTrain diagnostics');
    expect(formatted).toContain('Type: react-render');
    expect(formatted).toContain('React component stack:');
    expect(formatted).toContain('at GoBoard');
  });

  it('stores, reads, clears, and consumes reports safely', () => {
    const storage = createMemoryStorage();
    const report = createAppErrorReport('global-error', 'boom', {
      now: new Date('2026-05-31T12:00:00.000Z'),
    });

    expect(storeErrorReport(report, storage)).toBe(true);
    expect(readStoredErrorReport(storage)).toEqual(report);
    expect(consumeStoredErrorReport(storage)).toEqual(report);
    expect(readStoredErrorReport(storage)).toBeNull();

    storage.setItem(APP_ERROR_STORAGE_KEY, '{broken');
    expect(readStoredErrorReport(storage)).toBeNull();
    expect(clearStoredErrorReport(storage)).toBe(true);
    expect(storeErrorReport(report, null)).toBe(false);
    expect(readStoredErrorReport(null)).toBeNull();
  });

  it('installs global error and rejection handlers', () => {
    const storage = createMemoryStorage();
    const listeners = new Map<string, EventListener>();
    const target = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      }),
      location: { href: 'http://127.0.0.1:5177/' },
      navigator: { userAgent: 'vitest' },
    } as unknown as Window;

    const dispose = installGlobalErrorHandlers(target, storage);

    listeners.get('error')?.({
      message: 'render failed',
      filename: 'main.js',
      lineno: 12,
      colno: 4,
      error: new Error('render failed'),
    } as ErrorEvent);

    expect(readStoredErrorReport(storage)).toMatchObject({
      type: 'global-error',
      message: 'render failed',
      source: 'main.js',
      line: 12,
      column: 4,
      url: 'http://127.0.0.1:5177/',
      userAgent: 'vitest',
    });

    listeners.get('unhandledrejection')?.({ reason: 'promise failed' } as PromiseRejectionEvent);
    expect(readStoredErrorReport(storage)).toMatchObject({
      type: 'unhandled-rejection',
      message: 'promise failed',
    });

    dispose();
    expect(listeners.size).toBe(0);
  });
});

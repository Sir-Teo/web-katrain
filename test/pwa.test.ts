import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getServiceWorkerContainer,
  getPwaInstallDismissed,
  getServiceWorkerUrl,
  getVersionMetadataUrl,
  hasServiceWorkerController,
  isIosPwaInstallCandidate,
  isStandalonePwa,
  PWA_INSTALL_DISMISSED_KEY,
  PWA_UPDATE_CHECK_INTERVAL_MS,
  PWA_UPDATE_READY_EVENT,
  PWA_VERSION_UPDATE_CHECK_INTERVAL_MS,
  checkVersionMetadataUpdate,
  requestPwaUpdateActivation,
  runPwaInstallPrompt,
  schedulePwaUpdateChecks,
  scheduleVersionMetadataUpdateChecks,
  setPwaInstallDismissed,
  shouldUseBrowserPwaInstallPrompt,
} from '../src/utils/pwa';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function restoreWindow() {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
}

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('PWA helpers', () => {
  afterEach(() => {
    restoreWindow();
  });

  it('builds a base-aware service worker URL', () => {
    expect(getServiceWorkerUrl('/')).toBe('/sw.js');
    expect(getServiceWorkerUrl('/web-katrain/')).toBe('/web-katrain/sw.js');
    expect(getServiceWorkerUrl('/web-katrain')).toBe('/web-katrain/sw.js');
  });

  it('builds a cache-busted version metadata URL', () => {
    expect(getVersionMetadataUrl('/', 123)).toBe('/version.json?t=123');
    expect(getVersionMetadataUrl('/web-katrain/', 123)).toBe('/web-katrain/version.json?t=123');
    expect(getVersionMetadataUrl('/web-katrain', 123)).toBe('/web-katrain/version.json?t=123');
  });

  it('persists whether the install prompt was dismissed', () => {
    const storage = makeStorage();

    expect(getPwaInstallDismissed(storage)).toBe(false);

    setPwaInstallDismissed(true, storage);
    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBe('true');
    expect(getPwaInstallDismissed(storage)).toBe(true);

    setPwaInstallDismissed(false, storage);
    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBeNull();
    expect(getPwaInstallDismissed(storage)).toBe(false);
  });

  it('checks standalone display mode without trusting matchMedia', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: () => {
          throw new Error('matchMedia blocked');
        },
      },
    });

    expect(isStandalonePwa()).toBe(false);
  });

  it('detects iOS browsers that need manual install guidance', () => {
    expect(isIosPwaInstallCandidate({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    } as Navigator)).toBe(true);

    expect(isIosPwaInstallCandidate({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    } as Navigator)).toBe(true);

    expect(isIosPwaInstallCandidate({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    } as Navigator)).toBe(false);
  });

  it('treats blocked iOS detection properties as unavailable', () => {
    const blocked = {} as Navigator;
    Object.defineProperty(blocked, 'userAgent', {
      configurable: true,
      get() {
        throw new Error('userAgent blocked');
      },
    });

    expect(isIosPwaInstallCandidate(blocked)).toBe(false);
  });

  it('keeps browser install prompts behind iOS manual install guidance', () => {
    expect(shouldUseBrowserPwaInstallPrompt({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    } as Navigator)).toBe(false);

    expect(shouldUseBrowserPwaInstallPrompt({
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    } as Navigator)).toBe(true);
  });

  it('treats missing or blocked service workers as unavailable', () => {
    const blocked = {} as Navigator;
    Object.defineProperty(blocked, 'serviceWorker', {
      configurable: true,
      get() {
        throw new Error('service worker blocked');
      },
    });

    const registering = {
      register: vi.fn(),
      controller: null,
    } as unknown as ServiceWorkerContainer;

    expect(getServiceWorkerContainer(null)).toBeNull();
    expect(getServiceWorkerContainer({} as Navigator)).toBeNull();
    expect(getServiceWorkerContainer(blocked)).toBeNull();
    expect(getServiceWorkerContainer({ serviceWorker: registering } as Navigator)).toBe(registering);
  });

  it('checks service worker controllers without trusting property access', () => {
    const controlled = { controller: {} as ServiceWorker } as Pick<ServiceWorkerContainer, 'controller'>;
    const blocked = {} as Pick<ServiceWorkerContainer, 'controller'>;
    Object.defineProperty(blocked, 'controller', {
      configurable: true,
      get() {
        throw new Error('controller blocked');
      },
    });

    expect(hasServiceWorkerController(null)).toBe(false);
    expect(hasServiceWorkerController({ controller: null })).toBe(false);
    expect(hasServiceWorkerController(blocked)).toBe(false);
    expect(hasServiceWorkerController(controlled)).toBe(true);
  });

  it('schedules periodic service worker update checks', () => {
    const callbacks: Array<() => void> = [];
    const clearInterval = vi.fn();
    const timerTarget = {
      setInterval: vi.fn((callback: () => void, interval: number) => {
        callbacks.push(callback);
        expect(interval).toBe(PWA_UPDATE_CHECK_INTERVAL_MS);
        return 42;
      }),
      clearInterval,
    } as unknown as Pick<Window, 'setInterval' | 'clearInterval'>;
    const update = vi.fn().mockResolvedValue(undefined);

    const cleanup = schedulePwaUpdateChecks({ update }, PWA_UPDATE_CHECK_INTERVAL_MS, timerTarget);

    expect(cleanup).toEqual(expect.any(Function));
    expect(timerTarget.setInterval).toHaveBeenCalledTimes(1);
    callbacks[0]?.();
    expect(update).toHaveBeenCalledTimes(1);

    cleanup?.();
    expect(clearInterval).toHaveBeenCalledWith(42);
  });

  it('dispatches an update-ready event when version metadata reports a newer commit', async () => {
    const dispatchEvent = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ gitHash: '7654321' }),
    });

    await expect(
      checkVersionMetadataUpdate({
        currentGitHash: '1234567',
        baseUrl: '/web-katrain/',
        fetcher,
        target: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent,
        },
        timestamp: 456,
      })
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith('/web-katrain/version.json?t=456', { cache: 'no-store' });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: PWA_UPDATE_READY_EVENT });
  });

  it('ignores unchanged, malformed, or local version metadata checks', async () => {
    const dispatchEvent = vi.fn();
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent,
    };

    await expect(
      checkVersionMetadataUpdate({
        currentGitHash: '1234567',
        baseUrl: '/',
        fetcher: vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ gitHash: '1234567' }),
        }),
        target,
      })
    ).resolves.toBe(false);
    await expect(
      checkVersionMetadataUpdate({
        currentGitHash: '1234567',
        baseUrl: '/',
        fetcher: vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ gitHash: 'dev' }),
        }),
        target,
      })
    ).resolves.toBe(false);
    await expect(
      checkVersionMetadataUpdate({
        currentGitHash: 'dev',
        baseUrl: '/',
        fetcher: vi.fn(),
        target,
      })
    ).resolves.toBe(false);

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('schedules version metadata checks on an interval and on focus', async () => {
    const callbacks: Array<() => void> = [];
    const listeners = new Map<string, () => void>();
    const clearInterval = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ gitHash: '1234567' }),
    });
    const target = {
      setInterval: vi.fn((callback: () => void, interval: number) => {
        callbacks.push(callback);
        expect(interval).toBe(PWA_VERSION_UPDATE_CHECK_INTERVAL_MS);
        return 84;
      }),
      clearInterval,
      addEventListener: vi.fn((event: string, callback: () => void) => {
        listeners.set(event, callback);
      }),
      removeEventListener: vi.fn((event: string) => {
        listeners.delete(event);
      }),
      dispatchEvent: vi.fn(),
    };

    const cleanup = scheduleVersionMetadataUpdateChecks({
      currentGitHash: '1234567',
      baseUrl: '/',
      fetcher,
      target,
    });

    expect(cleanup).toEqual(expect.any(Function));
    expect(target.setInterval).toHaveBeenCalledTimes(1);
    expect(target.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));

    callbacks[0]?.();
    listeners.get('focus')?.();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);

    cleanup?.();
    expect(clearInterval).toHaveBeenCalledWith(84);
    expect(target.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
  });

  it('requests waiting service workers before reloading for updates', () => {
    const postMessage = vi.fn();
    const reload = vi.fn();

    requestPwaUpdateActivation(
      { waiting: { postMessage } as unknown as ServiceWorker },
      { location: { reload } }
    );

    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('resolves PWA install prompts without leaking rejected browser prompts', async () => {
    await expect(
      runPwaInstallPrompt({
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' as const }),
      })
    ).resolves.toBe('accepted');

    await expect(
      runPwaInstallPrompt({
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
      })
    ).resolves.toBe('dismissed');

    await expect(
      runPwaInstallPrompt({
        prompt: vi.fn().mockRejectedValue(new Error('prompt blocked')),
        userChoice: Promise.resolve({ outcome: 'accepted' as const }),
      })
    ).resolves.toBe('failed');

    await expect(
      runPwaInstallPrompt({
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.reject(new Error('choice blocked')),
      })
    ).resolves.toBe('failed');
  });
});

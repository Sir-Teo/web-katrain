import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getServiceWorkerContainer,
  getPwaInstallDismissed,
  getServiceWorkerUrl,
  hasServiceWorkerController,
  isIosPwaInstallCandidate,
  isStandalonePwa,
  PWA_INSTALL_DISMISSED_KEY,
  PWA_UPDATE_CHECK_INTERVAL_MS,
  requestPwaUpdateActivation,
  runPwaInstallPrompt,
  schedulePwaUpdateChecks,
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

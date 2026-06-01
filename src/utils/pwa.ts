import { getLocalStorage } from './storage';
import { mediaQueryMatches } from './mediaQuery';

export const PWA_OFFLINE_READY_EVENT = 'web-katrain:pwa-offline-ready';
export const PWA_UPDATE_READY_EVENT = 'web-katrain:pwa-update-ready';
export const PWA_INSTALL_DISMISSED_KEY = 'web-katrain:pwa-install-dismissed:v1';

type PwaStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type InstallPromptChoice = { outcome: 'accepted' | 'dismissed'; platform?: string };
type InstallPromptLike = {
  prompt: () => Promise<void> | void;
  userChoice?: Promise<InstallPromptChoice>;
};
type IosInstallNavigator = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>;

function getNavigator(target?: Navigator | null): Navigator | null {
  if (target !== undefined) return target;
  try {
    return typeof globalThis.navigator === 'undefined' ? null : globalThis.navigator;
  } catch {
    return null;
  }
}

function getStorage(storage?: PwaStorage | null): PwaStorage | null {
  if (storage !== undefined) return storage;
  return getLocalStorage();
}

export function getServiceWorkerUrl(baseUrl: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalized}sw.js`;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const source = getNavigator();
  return (
    mediaQueryMatches('(display-mode: standalone)') ||
    (source !== null && (source as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function isIosPwaInstallCandidate(target?: IosInstallNavigator | Navigator | null): boolean {
  const source = getNavigator(target as Navigator | null | undefined) as IosInstallNavigator | null;
  if (!source) return false;
  try {
    const userAgent = source.userAgent || '';
    const platform = source.platform || '';
    const maxTouchPoints = Number(source.maxTouchPoints || 0);
    return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  } catch {
    return false;
  }
}

export function shouldUseBrowserPwaInstallPrompt(target?: IosInstallNavigator | Navigator | null): boolean {
  return !isIosPwaInstallCandidate(target);
}

export function getServiceWorkerContainer(target?: Navigator | null): ServiceWorkerContainer | null {
  const source = getNavigator(target);
  if (!source) return null;
  try {
    const serviceWorker = (source as Navigator & { serviceWorker?: ServiceWorkerContainer }).serviceWorker;
    if (!serviceWorker || typeof serviceWorker.register !== 'function') return null;
    return serviceWorker;
  } catch {
    return null;
  }
}

export function hasServiceWorkerController(serviceWorker: Pick<ServiceWorkerContainer, 'controller'> | null): boolean {
  try {
    return !!serviceWorker?.controller;
  } catch {
    return false;
  }
}

export async function runPwaInstallPrompt(prompt: InstallPromptLike): Promise<'accepted' | 'dismissed' | 'failed'> {
  try {
    await prompt.prompt();
    const choice = prompt.userChoice ? await prompt.userChoice : null;
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'failed';
  }
}

export function getPwaInstallDismissed(storage?: PwaStorage | null): boolean {
  try {
    return getStorage(storage)?.getItem(PWA_INSTALL_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setPwaInstallDismissed(dismissed: boolean, storage?: PwaStorage | null): void {
  try {
    const target = getStorage(storage);
    if (!target) return;
    if (dismissed) target.setItem(PWA_INSTALL_DISMISSED_KEY, 'true');
    else target.removeItem(PWA_INSTALL_DISMISSED_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (typeof window === 'undefined') return;
  const serviceWorker = getServiceWorkerContainer();
  if (!serviceWorker) return;

  const swUrl = getServiceWorkerUrl(import.meta.env.BASE_URL || '/');
  window.addEventListener('load', () => {
    serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL || '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state !== 'installed') return;
            const eventName = hasServiceWorkerController(serviceWorker)
              ? PWA_UPDATE_READY_EVENT
              : PWA_OFFLINE_READY_EVENT;
            window.dispatchEvent(new Event(eventName));
          });
        });
      })
      .catch((err: unknown) => {
        console.warn('[pwa] service worker registration failed', err);
      });
  });
}

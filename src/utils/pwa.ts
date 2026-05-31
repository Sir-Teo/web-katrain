export const PWA_OFFLINE_READY_EVENT = 'web-katrain:pwa-offline-ready';
export const PWA_UPDATE_READY_EVENT = 'web-katrain:pwa-update-ready';
export const PWA_INSTALL_DISMISSED_KEY = 'web-katrain:pwa-install-dismissed:v1';

type PwaStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(storage?: PwaStorage | null): PwaStorage | null {
  if (storage !== undefined) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function getServiceWorkerUrl(baseUrl: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalized}sw.js`;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
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
  if (!('serviceWorker' in navigator)) return;

  const swUrl = getServiceWorkerUrl(import.meta.env.BASE_URL || '/');
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL || '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state !== 'installed') return;
            const eventName = navigator.serviceWorker.controller
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

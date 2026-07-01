import type { KataGoBackendPreference } from '../types';

export type BrowserBackendAvailability = 'available' | 'unavailable' | 'unknown';

type NavigatorGpuLike = {
  gpu?: unknown;
};

function getNavigatorGpuLike(): NavigatorGpuLike | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as NavigatorGpuLike;
}

export function detectWebGpuAvailability(): BrowserBackendAvailability;
export function detectWebGpuAvailability(
  nav: NavigatorGpuLike | null | undefined
): BrowserBackendAvailability;
export function detectWebGpuAvailability(
  ...args: [(NavigatorGpuLike | null | undefined)?]
): BrowserBackendAvailability {
  // An explicitly passed null/undefined means "no navigator information",
  // which must stay 'unknown' even on runtimes with a global `navigator`.
  const nav = args.length > 0 ? args[0] : getNavigatorGpuLike();
  if (!nav) return 'unknown';
  return nav.gpu ? 'available' : 'unavailable';
}

export function isKataGoBackendAvailable(
  backend: KataGoBackendPreference,
  webGpuAvailability: BrowserBackendAvailability
): boolean {
  return backend !== 'webgpu' || webGpuAvailability !== 'unavailable';
}

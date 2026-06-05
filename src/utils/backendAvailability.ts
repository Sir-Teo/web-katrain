import type { KataGoBackendPreference } from '../types';

export type BrowserBackendAvailability = 'available' | 'unavailable' | 'unknown';

type NavigatorGpuLike = {
  gpu?: unknown;
};

function getNavigatorGpuLike(): NavigatorGpuLike | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as NavigatorGpuLike;
}

export function detectWebGpuAvailability(
  navArg?: NavigatorGpuLike | null | undefined
): BrowserBackendAvailability {
  const nav = arguments.length === 0 ? getNavigatorGpuLike() : navArg;
  if (!nav) return 'unknown';
  return nav.gpu ? 'available' : 'unavailable';
}

export function isKataGoBackendAvailable(
  backend: KataGoBackendPreference,
  webGpuAvailability: BrowserBackendAvailability
): boolean {
  return backend !== 'webgpu' || webGpuAvailability !== 'unavailable';
}

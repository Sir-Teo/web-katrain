import { isDesktopLayoutSize } from './responsiveLayout';
import { readLocalStorage } from './storage';

export const LIBRARY_OPEN_STORAGE_KEY = 'web-katrain:library_open:v1';
export const FIRST_RUN_LIBRARY_MIN_WIDTH = 1180;

export function shouldOpenLibraryByDefault(
  storedValue: string | null,
  viewport: { width: number; height: number } | null
): boolean {
  if (storedValue === 'false') return false;
  if (!viewport) return false;
  if (!isDesktopLayoutSize(viewport.width, viewport.height)) return false;
  if (storedValue === 'true') return true;
  return viewport.width >= FIRST_RUN_LIBRARY_MIN_WIDTH;
}

export function getInitialLibraryOpen(): boolean {
  const storedValue = readLocalStorage(LIBRARY_OPEN_STORAGE_KEY);
  if (typeof window === 'undefined') return false;
  try {
    return shouldOpenLibraryByDefault(storedValue, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  } catch {
    return false;
  }
}

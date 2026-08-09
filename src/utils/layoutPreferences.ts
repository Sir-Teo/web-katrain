import { isDesktopLayoutSize } from './responsiveLayout';
import { readLocalStorage } from './storage';

export const LIBRARY_OPEN_STORAGE_KEY = 'web-katrain:library_open:v1';
export const FIRST_RUN_LIBRARY_MIN_WIDTH = 1200;

export function shouldOpenLibraryByDefault(
  storedValue: string | null,
  viewport: { width: number; height: number } | null
): boolean {
  if (storedValue === 'false') return false;
  if (!viewport) return false;
  if (!isDesktopLayoutSize(viewport.width, viewport.height)) return false;
  if (viewport.width < FIRST_RUN_LIBRARY_MIN_WIDTH) return false;
  // Keep the playfield primary for a new desktop session. The Library is one
  // edge-tab away, while an explicit prior choice to leave it open stays sticky.
  return storedValue === 'true';
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

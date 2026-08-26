import { mediaQueryMatches } from './mediaQuery';

export const DESKTOP_LAYOUT_MIN_WIDTH = 1024;
export const DESKTOP_LAYOUT_MIN_HEIGHT = 500;
export const DESKTOP_LAYOUT_MEDIA = `(min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px) and (min-height: ${DESKTOP_LAYOUT_MIN_HEIGHT}px)`;
export const MOBILE_LAYOUT_MEDIA = `(max-width: ${DESKTOP_LAYOUT_MIN_WIDTH - 1}px), (max-height: ${DESKTOP_LAYOUT_MIN_HEIGHT - 1}px)`;

export function isDesktopLayoutSize(width: number, height: number): boolean {
  return width >= DESKTOP_LAYOUT_MIN_WIDTH && height >= DESKTOP_LAYOUT_MIN_HEIGHT;
}

export function isMobileLayoutSize(width: number, height: number): boolean {
  return !isDesktopLayoutSize(width, height);
}

export function isDesktopLayoutViewport(): boolean {
  if (typeof window === 'undefined') return true;
  return mediaQueryMatches(
    DESKTOP_LAYOUT_MEDIA,
    isDesktopLayoutSize(window.innerWidth, window.innerHeight)
  );
}

export function isMobileLayoutViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return mediaQueryMatches(
    MOBILE_LAYOUT_MEDIA,
    isMobileLayoutSize(window.innerWidth, window.innerHeight)
  );
}

/**
 * On a phone in portrait the board is width-limited, so the shell is left with
 * a tall band of empty space above and below it — measured at 35-38% of the
 * viewport on every current phone size. The match strip fills the top of that
 * band with the player/capture facts the bottom bar has to drop below 415px.
 *
 * The gate is derived from the viewport alone so it cannot oscillate: the
 * canvas gets about `height - MOBILE_BOARD_CHROME` and the board takes about
 * `width - MOBILE_BOARD_GUTTER`, so the spare band is `height - width - 166`.
 * Requiring 260px keeps the strip off viewports where it would have to steal
 * height from the board (tablet portrait, small landscape-ish phones).
 */
const MOBILE_MATCH_STRIP_MIN_SPARE = 260;

export function shouldShowMobileMatchStrip(width: number, height: number): boolean {
  if (isDesktopLayoutSize(width, height)) return false;
  return height - width >= MOBILE_MATCH_STRIP_MIN_SPARE;
}

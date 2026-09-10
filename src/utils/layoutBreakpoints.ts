/**
 * Where the desktop shell starts, with nothing else attached.
 *
 * These live apart from responsiveLayout.ts because more than the app needs
 * them: vite.config.ts reads the media query to decide whether a build should
 * hint the desktop shell's chunk, and scripts/check-viewports.mjs reads the
 * two numbers to decide which shell each viewport should be measured as. Both
 * run in Node, and the rest of responsiveLayout reaches for `window`, so
 * importing it there drags the DOM lib into a config that does not have it.
 *
 * responsiveLayout re-exports all three, so nothing in the app has to know
 * this file exists.
 */
export const DESKTOP_LAYOUT_MIN_WIDTH = 1024;
export const DESKTOP_LAYOUT_MIN_HEIGHT = 500;
export const DESKTOP_LAYOUT_MEDIA =
  `(min-width: ${DESKTOP_LAYOUT_MIN_WIDTH}px) and (min-height: ${DESKTOP_LAYOUT_MIN_HEIGHT}px)`;
export const MOBILE_LAYOUT_MEDIA =
  `(max-width: ${DESKTOP_LAYOUT_MIN_WIDTH - 1}px), (max-height: ${DESKTOP_LAYOUT_MIN_HEIGHT - 1}px)`;

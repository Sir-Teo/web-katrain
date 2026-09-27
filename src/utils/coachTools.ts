/**
 * Which Review-tab overlay toggles the desktop dashboard shows.
 *
 * Coach is the plain-language path for newer players, and six overlay chips
 * plus the review actions were a lot to take in next to the board. Coach shows
 * top moves and territory, the two a newer player reads first, and keeps the
 * rest behind "More tools". Pro shows everything, as before.
 *
 * An overlay that is already on stays visible either way: hiding the only
 * switch for something still drawn on the board would leave no way to turn it
 * off from where it is shown.
 */
export const COACH_PRIMARY_OVERLAYS = new Set(['analysisShowHints', 'analysisShowOwnership']);

export function isOverlayToggleVisible(
  key: string,
  options: { isPro: boolean; toolsOpen: boolean; on: boolean },
): boolean {
  return options.isPro || options.toolsOpen || options.on || COACH_PRIMARY_OVERLAYS.has(key);
}

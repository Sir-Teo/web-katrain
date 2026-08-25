/**
 * Hands focus back to the control that opened a menu or sheet, unless something
 * else has already claimed it.
 *
 * These restores are deferred to a timeout so they land after the surface has
 * unmounted. But an action inside the surface can also open a dialog, and the
 * dialog takes focus as it mounts — earlier than the timeout. Restoring
 * unconditionally then drags focus onto the trigger sitting behind the dialog's
 * own scrim, so the dialog never receives focus and its Tab wrap never engages.
 *
 * document.body is the resting place when a focused element is removed, so it
 * reads as "nothing claimed this" rather than a deliberate placement.
 */
export function restoreFocusIfUnclaimed(target: HTMLElement | null | undefined): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (active && active !== document.body) return;
  target?.focus({ preventScroll: true });
}

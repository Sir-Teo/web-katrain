import { useEffect, useRef } from 'react';
import { mediaQueryMatches } from '../utils/mediaQuery';
import { overlayBackStack } from '../utils/overlayBackStack';

/**
 * Dismissal by the platform's back gesture, for overlays that handle Escape
 * themselves.
 *
 * This is the half of `useEscapeToClose` that has nothing to do with the
 * keyboard, split out because a few dialogs cannot use the Escape half. They
 * listen in the *capture* phase and stop the event, deliberately: Layout keeps
 * window-level Escape handlers for scoring mode and focus mode that do not
 * check `defaultPrevented`, so a bubble-phase listener would close the dialog
 * *and* drop out of scoring. Those dialogs were therefore written without
 * `useEscapeToClose` -- and silently lost the back gesture with it, which is
 * the one `overlayBackStack` exists to provide. A back press with them open did
 * what that module's own notes describe: left the page, and closed the app
 * outright when installed.
 *
 * Back is kept to coarse pointers. On Android it is how anything on top is
 * dismissed. On a desktop, back means navigate, and this app is often the only
 * page in its tab, so redefining it there would surprise for no gain.
 */
export function useBackGestureToClose(onClose: () => void, active = true): void {
  // Held in a ref rather than depended on: callers pass inline arrows, so the
  // identity changes every render, and re-running this effect on a render would
  // push and pop a history entry each time.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    if (!mediaQueryMatches('(pointer: coarse)')) return;
    const stack = overlayBackStack();
    if (!stack) return;
    const id = stack.open(() => closeRef.current());
    return () => stack.release(id);
  }, [active]);
}

/**
 * The two ways out of an overlay that are not a button: Escape, and -- where
 * the platform means it -- the back gesture.
 *
 * The Escape listener bubbles and yields to `defaultPrevented`, so the first
 * overlay to claim the key wins and the rest stand down. A dialog that needs to
 * outrank Layout's own Escape handlers listens in the capture phase itself and
 * pairs that with `useBackGestureToClose` above.
 */
export function useEscapeToClose(onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, onClose]);

  useBackGestureToClose(onClose, active);
}

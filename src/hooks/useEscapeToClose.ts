import { useEffect, useRef } from 'react';
import { mediaQueryMatches } from '../utils/mediaQuery';
import { overlayBackStack } from '../utils/overlayBackStack';

/**
 * The two ways out of an overlay that are not a button: Escape, and -- where
 * the platform means it -- the back gesture.
 *
 * Back is kept to coarse pointers. On Android it is how anything on top is
 * dismissed, and without it a back press left the app with a dialog open. On a
 * desktop, back means navigate, and this app is often the only page in its tab,
 * so redefining it there would surprise for no gain.
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

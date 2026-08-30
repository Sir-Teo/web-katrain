import { useEffect, useRef, type RefObject } from 'react';

/** Elements that can take focus, ordered as they appear in the DOM. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]',
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    if (el.tabIndex < 0) return false;
    // offsetParent is null for display:none subtrees; the rect check also drops
    // zero-sized controls such as the hidden file inputs used for uploads.
    if (!el.offsetParent && el !== root) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

/**
 * Moves focus into a dialog when it opens, keeps Tab inside it while open, and
 * returns focus to the trigger on close, per the WAI-ARIA dialog pattern.
 *
 * Without this, opening a dialog leaves focus on the button behind it: Tab walks
 * the background page instead of the dialog, and screen readers are never taken
 * to the dialog's contents. Attach the returned ref to the element carrying
 * role="dialog" and give that element tabIndex={-1} so it can receive focus.
 *
 * aria-modal="true" only tells assistive tech that the rest of the page is inert
 * — it does not stop Tab from reaching background controls — so the wrap is
 * enforced here in a keydown handler rather than left to the browser.
 *
 * Only depends on `active`, so it runs on the open/close transition rather than on
 * every render — re-running it on each render would yank focus back out of the
 * dialog.
 *
 * Pass `focusContainer: false` for dialogs that already put focus on a specific
 * control of their own (a search field, a roving tablist). They still get the Tab
 * wrap and the focus restore; only the initial container focus is skipped, so the
 * hook does not fight the more specific placement.
 */
export function useInitialDialogFocus<T extends HTMLElement>(
  active = true,
  options?: {
    focusContainer?: boolean;
    initialFocusRef?: RefObject<HTMLElement | null>;
    returnFocus?: HTMLElement | null;
  },
) {
  const ref = useRef<T>(null);
  const focusContainer = options?.focusContainer ?? true;
  const initialFocusRef = options?.initialFocusRef ?? null;
  const returnFocus = options?.returnFocus ?? null;

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // A closing menu or popover can restore focus to its own trigger after this
    // dialog mounts. Defer explicit control focus by one frame so the dialog's
    // chosen safe action wins that race reliably.
    const initialFocusFrame = initialFocusRef
      ? window.requestAnimationFrame(() => initialFocusRef.current?.focus())
      : null;
    if (!initialFocusRef && focusContainer) node?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || !node) return;
      const focusable = focusableWithin(node);
      if (focusable.length === 0) {
        // Nothing to land on, so keep focus on the dialog itself rather than
        // letting it fall through to the page behind.
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node?.addEventListener('keydown', handleKeyDown);
    return () => {
      if (initialFocusFrame !== null) window.cancelAnimationFrame(initialFocusFrame);
      node?.removeEventListener('keydown', handleKeyDown);
      // isConnected guards the case where the dialog's own action removed the
      // trigger from the DOM.
      const focusTarget = returnFocus?.isConnected ? returnFocus : previouslyFocused;
      if (focusTarget?.isConnected) focusTarget.focus?.();
    };
    // focusContainer is a plain boolean, so listing it keeps the lint rule happy
    // without making the effect re-run on every render the way an unstable
    // onClose dependency would.
  }, [active, focusContainer, initialFocusRef, returnFocus]);

  return ref;
}

export const TEXT_ENTRY_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
].join(', ');

export const DIALOG_TARGET_SELECTOR = 'dialog, [role="dialog"], [aria-modal="true"]';

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const tagName = element.tagName?.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable === true) {
    return true;
  }

  const contentEditable = element.getAttribute?.('contenteditable');
  if (contentEditable != null && contentEditable.toLowerCase() !== 'false') return true;

  const role = element.getAttribute?.('role')?.toLowerCase();
  if (role === 'textbox' || role === 'searchbox') return true;

  return Boolean(element.closest?.(TEXT_ENTRY_TARGET_SELECTOR));
}

export function isDialogTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {
    tagName?: string;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const tagName = element.tagName?.toUpperCase();
  if (tagName === 'DIALOG') return true;

  const role = element.getAttribute?.('role')?.toLowerCase();
  if (role === 'dialog' || element.getAttribute?.('aria-modal') === 'true') return true;

  return Boolean(element.closest?.(DIALOG_TARGET_SELECTOR));
}

export function shouldIgnoreGlobalPasteTarget(target: EventTarget | null): boolean {
  return isTextEntryTarget(target) || isDialogTarget(target);
}

type DocumentLike = { querySelector?: (selector: string) => unknown } | null | undefined;

/**
 * Whether a dialog is open anywhere in `doc`.
 *
 * Where focus sits is not a reliable proxy for this: only some dialogs move
 * focus into themselves on open, and the rest leave it on the trigger button or
 * on `<body>`, where a per-element check finds nothing to block.
 */
export function isDialogOpen(doc: DocumentLike): boolean {
  return Boolean(doc?.querySelector?.(DIALOG_TARGET_SELECTOR));
}

/** Keys a focused control activates with, so a shortcut must not steal them. */
const ACTIVATION_KEYS = new Set(['Enter', ' ', 'Spacebar']);

/** Keys a composite widget uses to move within itself. */
const SELF_NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Roles whose keyboard contract includes the arrow/Home/End keys. */
const SELF_NAVIGATING_ROLES = ['menuitem', 'option', 'radio', 'slider', 'tab', 'treeitem'];

const SELF_NAVIGATING_SELECTOR = SELF_NAVIGATING_ROLES.map((role) => `[role="${role}"]`).join(', ');

const ACTIVATION_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
].join(', ');

function matchesRoleOrSelector(
  target: EventTarget | null,
  roles: string[],
  selector: string
): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {
    tagName?: string;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const role = element.getAttribute?.('role')?.toLowerCase();
  if (role && roles.includes(role)) return true;
  return Boolean(element.closest?.(selector));
}

function isSelfNavigatingTarget(target: EventTarget | null): boolean {
  return matchesRoleOrSelector(target, SELF_NAVIGATING_ROLES, SELF_NAVIGATING_SELECTOR);
}

function isActivationTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: string };
  const tagName = element.tagName?.toUpperCase();
  if (tagName === 'BUTTON' || tagName === 'A' || tagName === 'SUMMARY') return true;
  return matchesRoleOrSelector(target, ['button', 'checkbox', 'switch'], ACTIVATION_SELECTOR);
}

function targetBlocksKey(target: EventTarget | null, key: string): boolean {
  if (!target || typeof target !== 'object') return false;
  // An open dialog owns the keyboard. Without this, focus resting on a dialog
  // container — which is where dialogs put it on open — matches none of the
  // interactive cases below, so board shortcuts fire behind the modal: arrow
  // keys walk the game, "n" starts a new one. Dialogs close through their own
  // Escape handler, so withholding Escape here is safe too.
  if (isDialogTarget(target)) return true;
  // Typing must never trigger a shortcut, so text fields swallow every key.
  if (isTextEntryTarget(target)) return true;
  if (isSelfNavigatingTarget(target)) {
    return ACTIVATION_KEYS.has(key) || SELF_NAVIGATION_KEYS.has(key);
  }
  if (isActivationTarget(target)) return ACTIVATION_KEYS.has(key);
  return false;
}

/**
 * Whether `key` should be withheld from the global shortcut handler.
 *
 * Only the keys the focused control actually consumes are withheld. Blocking
 * every key whenever any control had focus meant that clicking a button — which
 * leaves it focused — silently killed arrow-key move navigation until the user
 * clicked elsewhere.
 */
export function shouldIgnoreShortcutForKey(
  key: string,
  eventTarget: EventTarget | null,
  activeElement: EventTarget | null,
  doc: DocumentLike = typeof document === 'undefined' ? null : document
): boolean {
  // An open dialog owns the keyboard, wherever focus happens to be.
  if (isDialogOpen(doc)) return true;
  return targetBlocksKey(eventTarget, key) || targetBlocksKey(activeElement, key);
}

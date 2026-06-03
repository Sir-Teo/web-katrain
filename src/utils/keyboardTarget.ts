export const TEXT_ENTRY_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
].join(', ');

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  TEXT_ENTRY_TARGET_SELECTOR,
  '[role="button"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="treeitem"]',
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

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  if (isTextEntryTarget(target)) return true;

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const tagName = element.tagName?.toUpperCase();
  if (tagName === 'BUTTON' || tagName === 'A' || tagName === 'SUMMARY') return true;

  const role = element.getAttribute?.('role')?.toLowerCase();
  if (role && ['button', 'checkbox', 'menuitem', 'option', 'radio', 'slider', 'switch', 'tab', 'treeitem'].includes(role)) {
    return true;
  }

  return Boolean(element.closest?.(INTERACTIVE_SELECTOR));
}

export function shouldIgnoreKeyboardShortcutTarget(
  eventTarget: EventTarget | null,
  activeElement: EventTarget | null
): boolean {
  return isEditableKeyboardTarget(eventTarget) || isEditableKeyboardTarget(activeElement);
}

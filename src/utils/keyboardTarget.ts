const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
].join(', ');

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
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
  if (tagName === 'BUTTON' || tagName === 'A' || tagName === 'SUMMARY') return true;

  const role = element.getAttribute?.('role')?.toLowerCase();
  if (role && ['button', 'checkbox', 'menuitem', 'option', 'radio', 'switch', 'tab'].includes(role)) {
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

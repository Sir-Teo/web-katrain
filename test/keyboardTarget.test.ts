import { describe, expect, it } from 'vitest';
import {
  DIALOG_TARGET_SELECTOR,
  isDialogTarget,
  isTextEntryTarget,
  shouldIgnoreGlobalPasteTarget,
  shouldIgnoreShortcutForKey,
  TEXT_ENTRY_TARGET_SELECTOR,
} from '../src/utils/keyboardTarget';

describe('isTextEntryTarget', () => {
  it('detects form fields and contenteditable paste targets', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({
      tagName: 'SPAN',
      closest: (selector: string) => (selector === TEXT_ENTRY_TARGET_SELECTOR ? ({} as Element) : null),
    } as unknown as EventTarget)).toBe(true);
    expect(TEXT_ENTRY_TARGET_SELECTOR).toContain('[contenteditable]:not([contenteditable="false"])');
    expect(TEXT_ENTRY_TARGET_SELECTOR).toContain('[role="textbox"]');
    expect(TEXT_ENTRY_TARGET_SELECTOR).toContain('[role="searchbox"]');
  });

  it('does not treat ordinary controls as text entry targets', () => {
    expect(isTextEntryTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});

const roleTarget = (role: string) => ({
  tagName: 'DIV',
  getAttribute: (name: string) => (name === 'role' ? role : null),
} as unknown as EventTarget);

describe('isDialogTarget', () => {
  it('detects dialog roots and descendants', () => {
    expect(isDialogTarget({ tagName: 'DIALOG' } as unknown as EventTarget)).toBe(true);
    expect(isDialogTarget({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'dialog' : null),
    } as unknown as EventTarget)).toBe(true);
    expect(isDialogTarget({
      tagName: 'BUTTON',
      closest: (selector: string) => (selector === DIALOG_TARGET_SELECTOR ? ({} as Element) : null),
    } as unknown as EventTarget)).toBe(true);
  });

  it('ignores ordinary non-dialog targets', () => {
    expect(isDialogTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isDialogTarget(null)).toBe(false);
  });
});

describe('shouldIgnoreGlobalPasteTarget', () => {
  it('blocks document paste imports from text fields and dialogs', () => {
    expect(shouldIgnoreGlobalPasteTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreGlobalPasteTarget({
      tagName: 'BUTTON',
      closest: (selector: string) => (selector === DIALOG_TARGET_SELECTOR ? ({} as Element) : null),
    } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreGlobalPasteTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
  });
});

describe('shouldIgnoreShortcutForKey', () => {
  const button = { tagName: 'BUTTON' } as unknown as EventTarget;

  it('lets navigation keys through while a button holds focus', () => {
    // Clicking a button leaves it focused. Blocking every key here silently
    // killed arrow-key move navigation until the user clicked elsewhere.
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'z', 'x', 'p']) {
      expect(shouldIgnoreShortcutForKey(key, button, null), key).toBe(false);
      expect(shouldIgnoreShortcutForKey(key, {} as EventTarget, button), key).toBe(false);
    }
  });

  it('still withholds the keys a focused button activates with', () => {
    for (const key of ['Enter', ' ', 'Spacebar']) {
      expect(shouldIgnoreShortcutForKey(key, button, null), key).toBe(true);
    }
    expect(shouldIgnoreShortcutForKey('Enter', {} as EventTarget, { tagName: 'A' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreShortcutForKey(' ', roleTarget('checkbox'), null)).toBe(true);
    expect(shouldIgnoreShortcutForKey(' ', roleTarget('switch'), null)).toBe(true);
  });

  it('withholds every key while text entry has focus', () => {
    for (const key of ['ArrowLeft', 'Enter', ' ', 'z', 'Escape']) {
      expect(shouldIgnoreShortcutForKey(key, { tagName: 'INPUT' } as unknown as EventTarget, null), key).toBe(true);
      expect(shouldIgnoreShortcutForKey(key, { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget, null), key).toBe(true);
    }
    expect(shouldIgnoreShortcutForKey('ArrowLeft', {} as EventTarget, { tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
  });

  it('withholds arrow keys from widgets that navigate within themselves', () => {
    for (const role of ['slider', 'tab', 'radio', 'option', 'treeitem', 'menuitem']) {
      expect(shouldIgnoreShortcutForKey('ArrowLeft', roleTarget(role), null), role).toBe(true);
      expect(shouldIgnoreShortcutForKey('Enter', roleTarget(role), null), role).toBe(true);
      // a plain letter shortcut is not part of those widgets' key contract
      expect(shouldIgnoreShortcutForKey('p', roleTarget(role), null), role).toBe(false);
    }
  });

  it('leaves shortcuts alone when nothing relevant has focus', () => {
    expect(shouldIgnoreShortcutForKey('ArrowLeft', {} as EventTarget, {} as EventTarget)).toBe(false);
    expect(shouldIgnoreShortcutForKey('Enter', null, null)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DIALOG_TARGET_SELECTOR,
  isDialogTarget,
  isEditableKeyboardTarget,
  isTextEntryTarget,
  shouldIgnoreGlobalPasteTarget,
  shouldIgnoreKeyboardShortcutTarget,
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

describe('isEditableKeyboardTarget', () => {
  it('detects form and contenteditable keyboard targets', () => {
    expect(isEditableKeyboardTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'textarea' } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'textbox' : null),
    } as unknown as EventTarget)).toBe(true);
  });

  it('detects focused interactive controls', () => {
    expect(isEditableKeyboardTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'a' } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'tab' : null),
    } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'slider' : null),
    } as unknown as EventTarget)).toBe(true);
    expect(isEditableKeyboardTarget({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'treeitem' : null),
    } as unknown as EventTarget)).toBe(true);
  });

  it('ignores ordinary targets and missing targets', () => {
    expect(isEditableKeyboardTarget({} as EventTarget)).toBe(false);
    expect(isEditableKeyboardTarget(null)).toBe(false);
  });
});

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

describe('shouldIgnoreKeyboardShortcutTarget', () => {
  it('blocks shortcuts from either the event target or active element', () => {
    expect(shouldIgnoreKeyboardShortcutTarget({ tagName: 'BUTTON' } as unknown as EventTarget, null)).toBe(true);
    expect(shouldIgnoreKeyboardShortcutTarget({} as EventTarget, { tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(shouldIgnoreKeyboardShortcutTarget({} as EventTarget, {} as EventTarget)).toBe(false);
  });
});

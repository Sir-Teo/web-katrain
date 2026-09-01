import { describe, expect, it } from 'vitest';
import {
  DIALOG_TARGET_SELECTOR,
  isDialogTarget,
  isInsideOtherDialog,
  isTextEntryTarget,
  isDialogOpen,
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

const noDialog = { querySelector: () => null };
const dialogOpen = { querySelector: (selector: string) => (selector === DIALOG_TARGET_SELECTOR ? ({} as Element) : null) };

describe('shouldIgnoreShortcutForKey', () => {
  const button = { tagName: 'BUTTON' } as unknown as EventTarget;

  it('lets navigation keys through while a button holds focus', () => {
    // Clicking a button leaves it focused. Blocking every key here silently
    // killed arrow-key move navigation until the user clicked elsewhere.
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'z', 'x', 'p']) {
      expect(shouldIgnoreShortcutForKey(key, button, null, noDialog), key).toBe(false);
      expect(shouldIgnoreShortcutForKey(key, {} as EventTarget, button, noDialog), key).toBe(false);
    }
  });

  it('still withholds the keys a focused button activates with', () => {
    for (const key of ['Enter', ' ', 'Spacebar']) {
      expect(shouldIgnoreShortcutForKey(key, button, null, noDialog), key).toBe(true);
    }
    expect(shouldIgnoreShortcutForKey('Enter', {} as EventTarget, { tagName: 'A' } as unknown as EventTarget, noDialog)).toBe(true);
    expect(shouldIgnoreShortcutForKey(' ', roleTarget('checkbox'), null, noDialog)).toBe(true);
    expect(shouldIgnoreShortcutForKey(' ', roleTarget('switch'), null, noDialog)).toBe(true);
  });

  it('withholds every key while text entry has focus', () => {
    for (const key of ['ArrowLeft', 'Enter', ' ', 'z', 'Escape']) {
      expect(shouldIgnoreShortcutForKey(key, { tagName: 'INPUT' } as unknown as EventTarget, null, noDialog), key).toBe(true);
      expect(shouldIgnoreShortcutForKey(key, { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget, null, noDialog), key).toBe(true);
    }
    expect(shouldIgnoreShortcutForKey('ArrowLeft', {} as EventTarget, { tagName: 'TEXTAREA' } as unknown as EventTarget, noDialog)).toBe(true);
  });

  it('withholds arrow keys from widgets that navigate within themselves', () => {
    for (const role of ['slider', 'tab', 'radio', 'option', 'treeitem', 'menuitem']) {
      expect(shouldIgnoreShortcutForKey('ArrowLeft', roleTarget(role), null, noDialog), role).toBe(true);
      expect(shouldIgnoreShortcutForKey('Enter', roleTarget(role), null, noDialog), role).toBe(true);
      // a plain letter shortcut is not part of those widgets' key contract
      expect(shouldIgnoreShortcutForKey('p', roleTarget(role), null, noDialog), role).toBe(false);
    }
  });

  it('withholds every key while an open dialog holds focus', () => {
    // Dialogs that move focus inward land it on their container, which matches
    // none of the interactive cases above — so board shortcuts used to fire
    // behind the modal (arrow keys walked the game, "n" started a new one).
    const dialogContainer = {
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'dialog' : null),
    } as unknown as EventTarget;
    const insideDialog = {
      tagName: 'DIV',
      closest: (selector: string) => (selector === DIALOG_TARGET_SELECTOR ? ({} as Element) : null),
    } as unknown as EventTarget;

    for (const key of ['ArrowLeft', 'ArrowRight', 'n', 'p', 'Enter', ' ', 'Escape']) {
      expect(shouldIgnoreShortcutForKey(key, dialogContainer, null, noDialog), key).toBe(true);
      expect(shouldIgnoreShortcutForKey(key, insideDialog, null, noDialog), key).toBe(true);
      expect(shouldIgnoreShortcutForKey(key, {} as EventTarget, dialogContainer, noDialog), key).toBe(true);
    }
  });

  it('withholds every key while a dialog is open but focus stayed outside it', () => {
    // Only some dialogs move focus inward; the rest leave it on the trigger
    // button or on <body>, where the per-target checks find nothing to block.
    for (const key of ['ArrowLeft', 'n', 'Escape']) {
      expect(shouldIgnoreShortcutForKey(key, null, null, dialogOpen), key).toBe(true);
      expect(
        shouldIgnoreShortcutForKey(key, { tagName: 'BODY' } as unknown as EventTarget, null, dialogOpen),
        key
      ).toBe(true);
    }
  });

  it('leaves shortcuts alone when nothing relevant has focus', () => {
    expect(shouldIgnoreShortcutForKey('ArrowLeft', {} as EventTarget, {} as EventTarget, noDialog)).toBe(false);
    expect(shouldIgnoreShortcutForKey('Enter', null, null, noDialog)).toBe(false);
  });
});

describe('isDialogOpen', () => {
  it('reports an open dialog anywhere in the document', () => {
    expect(isDialogOpen(dialogOpen)).toBe(true);
    expect(isDialogOpen(noDialog)).toBe(false);
    expect(isDialogOpen(null)).toBe(false);
    expect(isDialogOpen(undefined)).toBe(false);
  });
});

describe('isInsideOtherDialog', () => {
  // The mobile home overlay is itself a dialog and keeps Tab to itself with a
  // capture-phase document listener. A dialog opened on top of it -- the
  // auto-save restore prompt is the one users met -- was losing every Tab to
  // that listener, which saw focus outside the home and pulled it back, so the
  // prompt's two buttons could not be reached from the keyboard.
  const home = { contains: (node: unknown) => node === home };
  const otherDialog = {};

  it('is true for a node inside a dialog that is not the container', () => {
    const inOther = { closest: (selector: string) => (selector === DIALOG_TARGET_SELECTOR ? otherDialog : null) };
    expect(isInsideOtherDialog(inOther as unknown as EventTarget, home as unknown as EventTarget)).toBe(true);
  });

  it('is false for a node inside the container itself', () => {
    const inHome = { closest: (selector: string) => (selector === DIALOG_TARGET_SELECTOR ? home : null) };
    expect(isInsideOtherDialog(inHome as unknown as EventTarget, home as unknown as EventTarget)).toBe(false);
  });

  it('is false for a dialog nested inside the container', () => {
    const nested = { closest: () => nestedDialog };
    const nestedDialog = {};
    const container = { contains: (node: unknown) => node === nestedDialog };
    expect(isInsideOtherDialog(nested as unknown as EventTarget, container as unknown as EventTarget)).toBe(false);
  });

  it('is false outside any dialog, and for missing nodes', () => {
    expect(isInsideOtherDialog({ closest: () => null } as unknown as EventTarget, home as unknown as EventTarget)).toBe(false);
    expect(isInsideOtherDialog(null, home as unknown as EventTarget)).toBe(false);
    expect(isInsideOtherDialog({ closest: () => otherDialog } as unknown as EventTarget, null)).toBe(false);
  });
});

describe('the mobile home Tab keeper stands down for dialogs above it', () => {
  it('asks isInsideOtherDialog before wrapping focus', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/components/MobileHome.tsx', 'utf8');

    expect(source).toContain("import { isInsideOtherDialog } from '../utils/keyboardTarget';");
    expect(source).toContain(
      'if (isInsideOtherDialog(event.target, home) || isInsideOtherDialog(document.activeElement, home)) return;'
    );
  });
});

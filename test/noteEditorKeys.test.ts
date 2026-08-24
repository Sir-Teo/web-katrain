import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getNoteEditorKeyAction } from '../src/utils/noteEditorKeys';

describe('note editor keyboard actions', () => {
  it('saves on Enter while keeping Shift+Enter available for multiline notes', () => {
    expect(getNoteEditorKeyAction({ key: 'Enter' })).toBe('save');
    expect(getNoteEditorKeyAction({ key: 'NumpadEnter' })).toBe('save');
    expect(getNoteEditorKeyAction({ key: 'Enter', shiftKey: true })).toBe('none');
  });

  it('supports command save and Escape cancel without stealing IME composition', () => {
    expect(getNoteEditorKeyAction({ key: 's', ctrlKey: true })).toBe('save');
    expect(getNoteEditorKeyAction({ key: 'S', metaKey: true })).toBe('save');
    expect(getNoteEditorKeyAction({ key: 'Escape' })).toBe('cancel');
    expect(getNoteEditorKeyAction({ key: 'Enter', isComposing: true })).toBe('none');
  });

  it('leaves alternate enter chords alone for browser and platform text editing', () => {
    expect(getNoteEditorKeyAction({ key: 'Enter', altKey: true })).toBe('none');
    expect(getNoteEditorKeyAction({ key: 's', ctrlKey: true, altKey: true })).toBe('none');
  });

  it('exposes save and cancel shortcuts on note editor controls', () => {
    const source = readFileSync('src/components/NotesPanel.tsx', 'utf8');

    expect(source).toContain('title="Save note (Enter, Ctrl+S, Cmd+S)"');
    expect(source).toContain('aria-label="Save note, keyboard shortcut Enter, Control+S, or Command+S"');
    expect(source).toContain('title="Cancel note edit (Escape)"');
    expect(source).toContain('aria-label="Cancel note edit, keyboard shortcut Escape"');
    expect(source).toContain('aria-keyshortcuts="Enter Control+S Meta+S Escape"');
    expect(source).toContain('data-note-save="true"');
    expect(source).toContain('data-note-cancel="true"');
    expect(source).toContain('data-note-edit="true"');
    expect(source.match(/className="grid h-11 w-11[^\n]+lg:h-7 lg:w-7"/g)).toHaveLength(2);
  });

  it('offers one way to start an empty note, not three', () => {
    const source = readFileSync('src/components/NotesPanel.tsx', 'utf8');

    // The empty state is already a labelled button naming the shortcut, so a
    // header "Add" button beside it repeated the action and the hint, and the
    // text-size steppers had nothing to size.
    expect(source).toContain('    ) : noteHasContent ? (');
    expect(source).toContain("<span>Edit</span>");
    expect(source).not.toContain("<span>{noteHasContent ? 'Edit' : 'Add'}</span>");
    expect(source).toContain('{(noteHasContent || isEditingNote) && (');
  });
});

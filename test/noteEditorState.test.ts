import { describe, expect, it } from 'vitest';
import { getNoteEditorSyncDecision } from '../src/utils/noteEditorState';

describe('note editor state sync', () => {
  it('resets the draft when navigating to another move', () => {
    expect(
      getNoteEditorSyncDecision({
        previousNodeId: 'n1',
        currentNodeId: 'n2',
        currentNote: 'Current move note',
        isEditing: true,
      })
    ).toEqual({
      draft: 'Current move note',
      editing: false,
    });
  });

  it('opens the editor automatically for a new empty move note', () => {
    expect(
      getNoteEditorSyncDecision({
        previousNodeId: 'n1',
        currentNodeId: 'n2',
        currentNote: '   ',
        isEditing: false,
      })
    ).toEqual({
      draft: '   ',
      editing: true,
    });
  });

  it('syncs external note changes only when the user is not editing the same move', () => {
    expect(
      getNoteEditorSyncDecision({
        previousNodeId: 'n1',
        currentNodeId: 'n1',
        currentNote: 'Saved note',
        isEditing: false,
      })
    ).toEqual({
      draft: 'Saved note',
      editing: false,
    });

    expect(
      getNoteEditorSyncDecision({
        previousNodeId: 'n1',
        currentNodeId: 'n1',
        currentNote: 'Store changed while draft is dirty',
        isEditing: true,
      })
    ).toBeNull();
  });
});

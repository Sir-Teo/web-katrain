import { describe, expect, it } from 'vitest';
import { getNoteDraftRescue, getNoteEditorSyncDecision } from '../src/utils/noteEditorState';

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

  it('stays in read view for a new empty move note', () => {
    expect(
      getNoteEditorSyncDecision({
        previousNodeId: 'n1',
        currentNodeId: 'n2',
        currentNote: '   ',
        isEditing: false,
      })
    ).toEqual({
      draft: '   ',
      editing: false,
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

/**
 * Navigating closed the editor and replaced the draft with the arriving node's
 * note, so anything typed and not saved was gone -- no prompt, no toast,
 * nothing to undo. Reaching another node mid-note is ordinary during review:
 * a click in the move tree, a stone on the board, an arrow key.
 */
describe('keeping a note the board moved away from', () => {
  const rescue = (over: Partial<Parameters<typeof getNoteDraftRescue>[0]> = {}) =>
    getNoteDraftRescue({
      previousNodeId: 'a',
      currentNodeId: 'b',
      isEditing: true,
      draft: 'half a thought',
      previousNote: '',
      ...over,
    });

  it('keeps it on the node it was written for, not the one arriving', () => {
    expect(rescue()).toEqual({ nodeId: 'a', note: 'half a thought' });
  });

  it('keeps an edit to a note that already existed', () => {
    expect(rescue({ previousNote: 'before', draft: 'before and after' }))
      .toEqual({ nodeId: 'a', note: 'before and after' });
  });

  it('keeps a deliberate deletion of an existing note', () => {
    expect(rescue({ previousNote: 'written earlier', draft: '' }))
      .toEqual({ nodeId: 'a', note: '' });
  });

  it('writes nothing when the editor was opened and left alone', () => {
    // Otherwise every glance at the note box would stamp an empty note on a node.
    expect(rescue({ draft: '' })).toBeNull();
    expect(rescue({ draft: 'unchanged', previousNote: 'unchanged' })).toBeNull();
  });

  it('writes nothing when the editor is closed', () => {
    expect(rescue({ isEditing: false })).toBeNull();
  });

  it('writes nothing while staying on the same node', () => {
    // Typing is not a save; only leaving the node is.
    expect(rescue({ currentNodeId: 'a' })).toBeNull();
  });
});

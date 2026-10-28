export type NoteEditorSyncDecision = {
  draft: string;
  editing: boolean;
};

export type NoteEditorSyncInput = {
  previousNodeId: string;
  currentNodeId: string;
  currentNote: string;
  isEditing: boolean;
};

export function getNoteEditorSyncDecision({
  previousNodeId,
  currentNodeId,
  currentNote,
  isEditing,
}: NoteEditorSyncInput): NoteEditorSyncDecision | null {
  if (previousNodeId !== currentNodeId) {
    return {
      draft: currentNote,
      editing: false,
    };
  }

  if (!isEditing) {
    return {
      draft: currentNote,
      editing: false,
    };
  }

  return null;
}

export type NoteDraftRescueInput = {
  previousNodeId: string;
  currentNodeId: string;
  isEditing: boolean;
  /** What is in the editor right now. */
  draft: string;
  /** The note the node being left already had. */
  previousNote: string;
};

/**
 * What to keep when the board moves out from under an open note editor.
 *
 * Navigating closes the editor and replaces the draft with the new node's
 * note, so anything typed and not yet saved was gone -- no prompt, no toast,
 * nothing to undo. Reaching a different node is ordinary during review: a
 * click in the move tree, a stone on the board, an arrow key. Measured by
 * typing a sentence and stepping one move away and back: the node's note was
 * still empty.
 *
 * Saving is the only answer that cannot lose the text. The note belongs to the
 * node it was written for, which is the one being left, not the one arriving.
 */
export function getNoteDraftRescue({
  previousNodeId,
  currentNodeId,
  isEditing,
  draft,
  previousNote,
}: NoteDraftRescueInput): { nodeId: string; note: string } | null {
  if (!isEditing || previousNodeId === currentNodeId) return null;
  // Nothing was changed, so there is nothing to keep -- and in particular an
  // editor opened and left alone must not write an empty note over a node.
  if (draft === previousNote) return null;
  return { nodeId: previousNodeId, note: draft };
}

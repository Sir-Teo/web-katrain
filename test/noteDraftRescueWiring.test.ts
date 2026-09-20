import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A source check, because the bug lives in effect ordering that
 * `renderToStaticMarkup` cannot exercise.
 *
 * Navigating replaced the note draft with the arriving node's note and closed
 * the editor, so anything typed and not yet saved was gone -- no prompt, no
 * toast, nothing to undo. `getNoteDraftRescue` is unit-tested on its own; what
 * needs guarding is that the panel still *calls* it, before the sync that
 * throws the draft away, and writes to the node being left rather than the one
 * arriving.
 */
const source = readFileSync('src/components/NotesPanel.tsx', 'utf8');

describe('the note editor keeps what was typed', () => {
  it('asks whether to keep the draft before syncing it away', () => {
    const rescueAt = source.indexOf('getNoteDraftRescue({');
    const syncAt = source.indexOf('getNoteEditorSyncDecision({');
    expect(rescueAt, 'getNoteDraftRescue is not called').toBeGreaterThan(-1);
    expect(syncAt, 'getNoteEditorSyncDecision is not called').toBeGreaterThan(-1);
    // The sync replaces the draft; rescuing after it would save the wrong text.
    expect(rescueAt).toBeLessThan(syncAt);
  });

  it('writes the rescued note by id, not onto whichever node is current', () => {
    // `setCurrentNodeNote` would put the text on the node just navigated to.
    expect(source).toContain('setNodeNote(rescue.nodeId, rescue.note)');
  });

  it('reads the draft from a ref, so the effect is not tied to every keystroke', () => {
    // Navigation does not change `noteDraft`, so a dep on it would not help:
    // the effect must see what was typed as of the render it runs after.
    expect(source).toContain('draft: noteDraftRef.current');
    expect(source).toContain('previousNote: previousNoteTextRef.current');
  });

  it('keeps the draft mirror as an effect, which lint requires', () => {
    // Writing a ref during render is a react-hooks/refs error.
    expect(source).toMatch(/useEffect\(\(\) => \{\s*noteDraftRef\.current = noteDraft;\s*\}, \[noteDraft\]\);/);
  });
});

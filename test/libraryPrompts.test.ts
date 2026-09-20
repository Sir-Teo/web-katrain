import { describe, expect, it } from 'vitest';
import {
  describeLibraryClear,
  describeLibraryReplacement,
  libraryItemCountLabel,
} from '../src/utils/libraryPrompts';

describe('libraryItemCountLabel', () => {
  it('counts one in the singular', () => {
    expect(libraryItemCountLabel(1)).toBe('1 library item');
    expect(libraryItemCountLabel(8)).toBe('8 library items');
    expect(libraryItemCountLabel(0)).toBe('0 library items');
  });
});

describe('what is asked before the Library is destroyed', () => {
  /**
   * Restore replaces the Library rather than merging into it, and its name
   * reads as gaining games. Choosing a one-game backup against the bundled
   * library turned eight items into one with no dialog at all.
   */
  it('names what goes and what arrives before replacing', () => {
    expect(describeLibraryReplacement(8, 1)).toBe(
      'Replace all 8 library items with the 1 item in this backup? This cannot be undone.'
    );
    expect(describeLibraryReplacement(1, 24)).toBe(
      'Replace all 1 library item with the 24 items in this backup? This cannot be undone.'
    );
  });

  it('says plainly when the backup would empty the Library', () => {
    const message = describeLibraryReplacement(8, 0);
    expect(message).toContain('empty backup');
    expect(message).toContain('empties the Library');
    // Never "the 0 items in this backup".
    expect(message).not.toContain('0 item');
  });

  it('warns that clearing cannot be undone', () => {
    expect(describeLibraryClear(8)).toBe('Clear all 8 library items? This cannot be undone.');
    expect(describeLibraryClear(1)).toBe('Clear all 1 library item? This cannot be undone.');
  });

  it('warns about permanence in every prompt, whichever it is', () => {
    // The warning is the only thing standing between a click and lost games.
    const prompts = [
      describeLibraryClear(0),
      describeLibraryClear(5),
      describeLibraryReplacement(5, 0),
      describeLibraryReplacement(5, 1),
      describeLibraryReplacement(5, 9),
    ];
    for (const prompt of prompts) expect(prompt, prompt).toMatch(/cannot be undone/);
  });
});

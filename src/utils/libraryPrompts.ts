/**
 * The questions asked before something in the Library is destroyed.
 *
 * These live outside the panel for the reason `libraryImportSummary` does:
 * the wording is the only warning, and a missing or vague one is invisible
 * until someone loses their games. Restore had no question at all -- choosing
 * a one-game backup turned eight items into one with no dialog and nothing to
 * undo it with -- while Clear, which destroys exactly as much, asked properly.
 * Both now read the same way, from here.
 */

/** "1 library item" / "8 library items". */
export const libraryItemCountLabel = (count: number): string =>
  `${count} library item${count === 1 ? '' : 's'}`;

/** Clearing the Library: everything goes, and nothing arrives. */
export const describeLibraryClear = (count: number): string =>
  `Clear all ${libraryItemCountLabel(count)}? This cannot be undone.`;

/**
 * Restoring a backup: it replaces the Library rather than merging into it,
 * which the name does not suggest, so the question names both numbers.
 */
export const describeLibraryReplacement = (current: number, incoming: number): string =>
  incoming === 0
    ? `Replace all ${libraryItemCountLabel(current)} with an empty backup? This empties the Library and cannot be undone.`
    : `Replace all ${libraryItemCountLabel(current)} with the ${incoming} item${incoming === 1 ? '' : 's'} in this backup? This cannot be undone.`;

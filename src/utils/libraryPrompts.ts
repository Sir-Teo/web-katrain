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

type LibraryBackupRepairs = { rejected: number; repaired: number };

const recordCountLabel = (count: number): string => `${count} record${count === 1 ? '' : 's'}`;

/**
 * What reading a backup left out or fixed, asked about before it replaces
 * anything: a restore used to count only what it kept, so records it could
 * not read went unmentioned.
 */
export const describeLibraryBackupRepairs = ({ rejected, repaired }: LibraryBackupRepairs): string => {
  const parts = [
    rejected > 0 ? `${recordCountLabel(rejected)} in this backup could not be read and will be skipped` : '',
    repaired > 0 ? `${recordCountLabel(repaired)} with a missing or broken id, name, date or folder will be repaired` : '',
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join('; ')}.` : '';
};

/** The same, once the restore is done. */
export const summarizeLibraryBackupRepairs = ({ rejected, repaired }: LibraryBackupRepairs): string => {
  const parts = [
    rejected > 0 ? `skipped ${rejected} unreadable record${rejected === 1 ? '' : 's'}` : '',
    repaired > 0 ? `repaired ${recordCountLabel(repaired)}` : '',
  ].filter(Boolean);
  if (parts.length === 0) return '';
  const sentence = parts.join('; ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
};

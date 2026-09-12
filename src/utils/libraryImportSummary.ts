import { stripUnsafeFilenameControls } from './filename';
import { withFailureReason } from './importSummary';
import { PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE } from './photoBoard';
import { MAX_SGF_IMPORT_LABEL } from './sgfImportLimits';

export interface LibraryImportCounts {
  /** Everything added, files and folders alike; a ZIP can bring in folders. */
  importedEntries: number;
  /** Games, which is what the message counts. */
  importedFiles: number;
  openedPhotoBoard: boolean;
  skippedUnsupportedPhotoImages: number;
  skippedOversizedSgfFiles: number;
  skippedInvalidSgfFiles: number;
  /** Threw while being read: an unreadable file, a corrupt ZIP. */
  unreadableFiles: number;
  /** Recognized game entries rejected inside ZIPs, counted independently of loose files. */
  skippedArchiveGames?: number;
  /** Keep just the first actionable example, not an unbounded list of errors. */
  firstFailure?: string;
}

export interface LibraryImportReport {
  message: string;
  tone: 'success' | 'error' | 'info';
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * What to tell someone after a drag-and-drop or file-picker import.
 *
 * This lives outside the panel because getting it wrong is invisible. Import
 * skips a file for four separate reasons and counts three of them, but the
 * message that runs when anything at all was imported -- the usual case --
 * mentioned only two: drop five SGFs with two over the size limit and it said
 * "Imported 3 files." and nothing else, even though the code had the number in
 * hand. Files that *threw* while being read were not counted at all, so a
 * corrupt ZIP could take its whole contents away in silence.
 *
 * Every count now has to appear in the message, which a test can check and a
 * reader can see at a glance.
 */
function describeImportCounts(counts: LibraryImportCounts): LibraryImportReport {
  const {
    importedEntries,
    importedFiles,
    openedPhotoBoard,
    skippedUnsupportedPhotoImages,
    skippedOversizedSgfFiles,
    skippedInvalidSgfFiles,
    unreadableFiles,
    skippedArchiveGames = 0,
  } = counts;

  const skipped = [
    skippedUnsupportedPhotoImages > 0
      ? ` Skipped ${plural(skippedUnsupportedPhotoImages, 'unsupported board image')}.`
      : '',
    skippedOversizedSgfFiles > 0
      ? ` Skipped ${plural(skippedOversizedSgfFiles, 'file')} over ${MAX_SGF_IMPORT_LABEL}.`
      : '',
    skippedInvalidSgfFiles > 0 ? ` Skipped ${plural(skippedInvalidSgfFiles, 'invalid game file')}.` : '',
    skippedArchiveGames > 0 ? ` Skipped ${plural(skippedArchiveGames, 'archive game')}.` : '',
    unreadableFiles > 0 ? ` Could not read ${plural(unreadableFiles, 'file')}.` : '',
  ].join('');

  if (importedEntries === 0) {
    const failureKinds = [skippedUnsupportedPhotoImages, skippedOversizedSgfFiles, skippedInvalidSgfFiles, skippedArchiveGames, unreadableFiles]
      .filter((count) => count > 0).length;
    if (skippedArchiveGames > 0 || failureKinds > 1 || (openedPhotoBoard && failureKinds > 0)) {
      return {
        message: `${openedPhotoBoard ? 'Opened photo board from image.' : 'No games were imported.'}${skipped}`,
        tone: 'error',
      };
    }
    if (openedPhotoBoard) return { message: 'Opened photo board from image.', tone: 'info' };
    if (skippedUnsupportedPhotoImages > 0) {
      return { message: PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE, tone: 'error' };
    }
    if (skippedOversizedSgfFiles > 0) {
      return {
        message: `Game files are limited to ${MAX_SGF_IMPORT_LABEL}. ${plural(skippedOversizedSgfFiles, 'file')} skipped.`,
        tone: 'error',
      };
    }
    if (skippedInvalidSgfFiles > 0) return { message: 'No valid games were imported.', tone: 'error' };
    if (unreadableFiles > 0) {
      return { message: `Could not read ${plural(unreadableFiles, 'file')}.`, tone: 'error' };
    }
    return { message: 'No SGF, GIB, NGF, ZIP, or board image files were imported.', tone: 'info' };
  }

  return {
    message: `Imported ${plural(importedFiles, 'file')}${openedPhotoBoard ? ' and opened photo board image' : ''}.${skipped}`,
    // Losing files is not a success, and the empty case already says so.
    tone: skipped ? 'error' : 'success',
  };
}

/** A filename and recovery reason that fit a notification, with full counts above it. */
export function describeLibraryImportFailure(name: string, error: unknown): string {
  const cleanName = stripUnsafeFilenameControls(name);
  const label = cleanName.length > 120 ? `${cleanName.slice(0, 117)}…` : cleanName;
  const reason = error instanceof Error ? error.message.trim() : '';
  const shortReason = reason.length > 360 ? `${reason.slice(0, 357)}…` : reason;
  return withFailureReason(`Could not import "${label}".`, new Error(shortReason));
}

export function describeLibraryImport(counts: LibraryImportCounts): LibraryImportReport {
  const report = describeImportCounts(counts);
  if (counts.firstFailure) return { message: `${report.message} ${counts.firstFailure}`, tone: 'error' };
  return report;
}

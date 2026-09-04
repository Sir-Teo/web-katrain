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
export function describeLibraryImport(counts: LibraryImportCounts): LibraryImportReport {
  const {
    importedEntries,
    importedFiles,
    openedPhotoBoard,
    skippedUnsupportedPhotoImages,
    skippedOversizedSgfFiles,
    skippedInvalidSgfFiles,
    unreadableFiles,
  } = counts;

  if (importedEntries === 0) {
    if (openedPhotoBoard) return { message: 'Opened photo board from image.', tone: 'info' };
    if (skippedUnsupportedPhotoImages > 0) {
      return { message: PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE, tone: 'error' };
    }
    if (skippedOversizedSgfFiles > 0) {
      return {
        message: `SGF files are limited to ${MAX_SGF_IMPORT_LABEL}. ${plural(skippedOversizedSgfFiles, 'file')} skipped.`,
        tone: 'error',
      };
    }
    if (skippedInvalidSgfFiles > 0) return { message: 'No valid SGF games were imported.', tone: 'error' };
    if (unreadableFiles > 0) {
      return { message: `Could not read ${plural(unreadableFiles, 'file')}.`, tone: 'error' };
    }
    return { message: 'No SGF, ZIP, or board image files were imported.', tone: 'info' };
  }

  const skipped = [
    skippedUnsupportedPhotoImages > 0
      ? ` Skipped ${plural(skippedUnsupportedPhotoImages, 'unsupported board image')}.`
      : '',
    skippedOversizedSgfFiles > 0
      ? ` Skipped ${plural(skippedOversizedSgfFiles, 'file')} over ${MAX_SGF_IMPORT_LABEL}.`
      : '',
    skippedInvalidSgfFiles > 0 ? ` Skipped ${plural(skippedInvalidSgfFiles, 'invalid SGF file')}.` : '',
    unreadableFiles > 0 ? ` Could not read ${plural(unreadableFiles, 'file')}.` : '',
  ].join('');

  return {
    message: `Imported ${plural(importedFiles, 'file')}${openedPhotoBoard ? ' and opened photo board image' : ''}.${skipped}`,
    // Losing files is not a success, and the empty case already says so.
    tone: skipped ? 'error' : 'success',
  };
}

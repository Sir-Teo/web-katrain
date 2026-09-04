import { describe, expect, it } from 'vitest';
import { describeLibraryImport, type LibraryImportCounts } from '../src/utils/libraryImportSummary';

const counts = (over: Partial<LibraryImportCounts> = {}): LibraryImportCounts => ({
  importedEntries: 0,
  importedFiles: 0,
  openedPhotoBoard: false,
  skippedUnsupportedPhotoImages: 0,
  skippedOversizedSgfFiles: 0,
  skippedInvalidSgfFiles: 0,
  unreadableFiles: 0,
  ...over,
});

describe('what an import tells you', () => {
  it('reports a clean import as a plain success', () => {
    const report = describeLibraryImport(counts({ importedEntries: 3, importedFiles: 3 }));
    expect(report).toEqual({ message: 'Imported 3 files.', tone: 'success' });
  });

  it('counts one file in the singular', () => {
    expect(describeLibraryImport(counts({ importedEntries: 1, importedFiles: 1 })).message).toBe(
      'Imported 1 file.'
    );
  });

  /**
   * The bug this file exists for. Import counted oversized files and named them
   * only when *nothing* imported, so the ordinary case -- some in, some too big
   * -- said "Imported 3 files." and stopped. The number was already in hand.
   */
  it('names files skipped for size even when others imported', () => {
    const report = describeLibraryImport(
      counts({ importedEntries: 3, importedFiles: 3, skippedOversizedSgfFiles: 2 })
    );
    expect(report.message).toBe('Imported 3 files. Skipped 2 files over 5 MB.');
    expect(report.tone).toBe('error');
  });

  /** The other half: a file that threw was not counted anywhere at all. */
  it('names files it could not read', () => {
    const report = describeLibraryImport(
      counts({ importedEntries: 4, importedFiles: 4, unreadableFiles: 1 })
    );
    expect(report.message).toBe('Imported 4 files. Could not read 1 file.');
    expect(report.tone).toBe('error');
  });

  it('stacks every reason it skipped something', () => {
    const report = describeLibraryImport(
      counts({
        importedEntries: 9,
        importedFiles: 9,
        skippedUnsupportedPhotoImages: 1,
        skippedOversizedSgfFiles: 3,
        skippedInvalidSgfFiles: 2,
        unreadableFiles: 4,
      })
    );
    expect(report.message).toBe(
      'Imported 9 files. Skipped 1 unsupported board image. Skipped 3 files over 5 MB.' +
        ' Skipped 2 invalid SGF files. Could not read 4 files.'
    );
  });

  it('mentions every count it was given, whichever one it is', () => {
    // The point of the type is that a new reason cannot be added without a
    // place in the message; this checks each existing one reaches it.
    const keys = [
      'skippedUnsupportedPhotoImages',
      'skippedOversizedSgfFiles',
      'skippedInvalidSgfFiles',
      'unreadableFiles',
    ] as const;
    for (const key of keys) {
      const report = describeLibraryImport(counts({ importedEntries: 2, importedFiles: 2, [key]: 7 }));
      expect(report.message, key).toContain('7');
      expect(report.tone, key).toBe('error');
    }
  });

  it('still says the photo board opened', () => {
    expect(
      describeLibraryImport(counts({ importedEntries: 2, importedFiles: 2, openedPhotoBoard: true })).message
    ).toBe('Imported 2 files and opened photo board image.');
    expect(describeLibraryImport(counts({ openedPhotoBoard: true }))).toEqual({
      message: 'Opened photo board from image.',
      tone: 'info',
    });
  });

  describe('when nothing came in', () => {
    it('says so plainly when there was nothing to import', () => {
      expect(describeLibraryImport(counts())).toEqual({
        message: 'No SGF, ZIP, or board image files were imported.',
        tone: 'info',
      });
    });

    it('gives the size limit', () => {
      expect(describeLibraryImport(counts({ skippedOversizedSgfFiles: 1 }))).toEqual({
        message: 'SGF files are limited to 5 MB. 1 file skipped.',
        tone: 'error',
      });
    });

    it('reports files it could not read, which it used to drop in silence', () => {
      expect(describeLibraryImport(counts({ unreadableFiles: 2 }))).toEqual({
        message: 'Could not read 2 files.',
        tone: 'error',
      });
    });

    it('reports invalid SGFs', () => {
      expect(describeLibraryImport(counts({ skippedInvalidSgfFiles: 3 })).message).toBe(
        'No valid SGF games were imported.'
      );
    });
  });
});

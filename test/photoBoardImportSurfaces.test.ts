import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeLibraryImport } from '../src/utils/libraryImportSummary';
import { PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE } from '../src/utils/photoBoard';

describe('photo board import surfaces', () => {
  it('uses a precise unsupported-image message for app open and drop paths', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(source).toContain('PHOTO_BOARD_IMAGE_ACCEPT');
    expect(source).toContain('PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE');
    expect(source).toContain('isUnsupportedPhotoBoardImageFile(file)');
    expect(source).toContain('toast(PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE, \'error\');');
    expect(source).toContain("toast('Choose an SGF, GIB, or NGF game, board photo, or KataGo model weights.', 'error');");
  });

  it('skips unsupported board photo formats during library imports', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('PHOTO_BOARD_IMAGE_ACCEPT');
    expect(source).toContain('let skippedUnsupportedPhotoImages = 0;');
    expect(source).toContain('isUnsupportedPhotoBoardImageFile(file)');
    expect(source).toContain('skippedUnsupportedPhotoImages += 1;');

    // The message itself now lives in describeLibraryImport, which phrases
    // every import outcome, so assert what the count produces rather than
    // matching the panel's source for a string it no longer holds.
    expect(
      describeLibraryImport({
        importedEntries: 0,
        importedFiles: 0,
        openedPhotoBoard: false,
        skippedUnsupportedPhotoImages: 1,
        skippedOversizedSgfFiles: 0,
        skippedInvalidSgfFiles: 0,
        unreadableFiles: 0,
      })
    ).toEqual({ message: PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE, tone: 'error' });
  });
});

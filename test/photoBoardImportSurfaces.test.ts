import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('photo board import surfaces', () => {
  it('uses a precise unsupported-image message for app open and drop paths', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(source).toContain('PHOTO_BOARD_IMAGE_ACCEPT');
    expect(source).toContain('PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE');
    expect(source).toContain('isUnsupportedPhotoBoardImageFile(file)');
    expect(source).toContain('toast(PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE, \'error\');');
    expect(source).toContain("toast('Choose an SGF file, board photo, or KataGo model weights.', 'error');");
  });

  it('skips unsupported board photo formats during library imports', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('PHOTO_BOARD_IMAGE_ACCEPT');
    expect(source).toContain('PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE');
    expect(source).toContain('let skippedUnsupportedPhotoImages = 0;');
    expect(source).toContain('isUnsupportedPhotoBoardImageFile(file)');
    expect(source).toContain('skippedUnsupportedPhotoImages += 1;');
  });
});

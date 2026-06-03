import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LibraryPanel accessibility', () => {
  it('names toolbar form controls explicitly', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('aria-label="Search library"');
    expect(source).toContain('aria-label="Sort library"');
    expect(source).toContain('aria-label="Move selected to folder"');
  });

  it('sanitizes folder download names with the shared filename guard', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain("import { stripUnsafeFilenameControls } from '../utils/filename';");
    expect(source).toContain('stripUnsafeFilenameControls(name)');
  });
});

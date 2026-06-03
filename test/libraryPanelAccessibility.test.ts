import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LibraryPanel accessibility', () => {
  it('names toolbar form controls explicitly', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('aria-label="Search library"');
    expect(source).toContain('aria-label="Sort library"');
    expect(source).toContain('aria-label="Move selected to folder"');
  });

  it('names compact library row and folder navigation actions', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    const rowActionLabels = [
      'selectFileLabel',
      'duplicateFileLabel',
      'downloadFileLabel',
      'renameFileLabel',
      'deleteFileLabel',
      'toggleFolderLabel',
      'selectFolderLabel',
      'duplicateFolderLabel',
      'exportFolderLabel',
      'renameFolderLabel',
      'deleteFolderLabel',
    ];

    for (const label of rowActionLabels) {
      expect(source).toContain(`aria-label={${label}}`);
    }

    expect(source).toContain('aria-label="Go to parent folder"');
    expect(source).toContain('aria-label="Go to library root"');
    expect(source).toContain('aria-label={`Open folder ${crumb.name}`}');
    expect(source).toContain('aria-label="Move selected items"');

    const rowButtonBlocks = source.match(/<button[\s\S]*?library-tree-node-(?:action|select|arrow)[\s\S]*?<\/button>/g) ?? [];
    expect(rowButtonBlocks.length).toBeGreaterThan(0);
    for (const block of rowButtonBlocks) {
      expect(block).toContain('aria-label=');
    }
  });

  it('sanitizes folder download names with the shared filename guard', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain("import { stripUnsafeFilenameControls } from '../utils/filename';");
    expect(source).toContain('stripUnsafeFilenameControls(name)');
  });

  it('validates direct SGF file imports before storing them', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain("import { assertValidLibrarySgfImport } from '../utils/libraryImportValidation';");
    expect(source).toContain('assertValidLibrarySgfImport(text);');
    expect(source).toContain('No valid SGF games were imported.');
    expect(source).toContain('invalid SGF file');
  });
});

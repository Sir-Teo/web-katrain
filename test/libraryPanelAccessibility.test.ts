import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('LibraryPanel accessibility', () => {
  it('names toolbar form controls explicitly', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('aria-label="Search library"');
    expect(source).toContain('aria-label="Clear library search"');
    expect(source).toContain('data-library-search="true"');
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
      'moreFolderActionsLabel',
    ];

    for (const label of rowActionLabels) {
      expect(source).toContain(`aria-label={${label}}`);
    }

    expect(source).toContain('aria-haspopup="menu"');

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

  it('keeps infrequent library maintenance actions in one keyboard-accessible menu', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('aria-label="More library actions"');
    expect(source).toContain('aria-expanded={headerMenuOpen}');
    expect(source).toContain('onKeyDown={handleHeaderMenuKeyDown}');
    expect(source).toContain('> Export library as ZIP');
    expect(source).toContain('> Sync from OGS');
    expect(source).toContain('> Download backup');
    expect(source).toContain('> Restore backup');
    expect(source).toContain('> Clear library');
    expect(source).not.toContain('library-header-secondary-action');
  });

  it('provides true touch-sized mobile library controls', () => {
    const styles = readFileSync('src/index.css', 'utf8');

    expect(styles).toContain(".library-tree-node[data-library-row='folder'] .library-tree-node-more");
    expect(styles).toContain('grid-template-columns: 44px 44px 16px minmax(0, 1fr) auto 44px;');
    expect(styles).toContain('min-height: 44px;');
  });

  it('keeps the standalone mobile library open without repeating its workspace title', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('open: isMobile || listOpen');
    expect(source).toContain('hideHeader: isMobile');
    expect(source).toContain("isMobile ? 'h-11 min-h-11 w-11 min-w-11' : 'h-9 w-9'");
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

  it('states the full scope of irreversible Library deletions', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('const descendantCount = isFolderItem');
    expect(source).toContain('const affectedCount = items.filter');
    expect(source).toContain('This cannot be undone.');
    expect(source).not.toContain('Delete ${visibleSelectedIds.size} item(s) from Library?');
    expect(source).toMatch(/LibraryConfirmDialog[\s\S]*onClick=\{onClose\} autoFocus/);
  });
});

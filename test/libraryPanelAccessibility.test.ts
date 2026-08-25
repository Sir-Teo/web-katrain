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
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    const styles = readFileSync('src/index.css', 'utf8');

    expect(source).toContain('data-library-toolbar="true"');
    expect(source).toContain('className="library-select-all h-6 w-6');
    expect(source).toContain('className="library-breadcrumb-button');
    expect(source.match(/library-header-collapsible-action/g) ?? []).toHaveLength(2);
    expect(source).toContain('<FaPlus size={12} /> Create new folder');
    expect(source).toContain('<FaFolderOpen size={12} /> Import files');
    expect(source).toContain("maxHeight: isMobile");
    expect(source).toContain("var(--mobile-tabbar-height)");
    expect(source.match(/window\.addEventListener\('resize', close\)/g) ?? []).toHaveLength(2);
    expect(styles).toMatch(/\.library-context-menu \{[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior: contain;/);
    expect(styles).toContain(".library-tree-node[data-library-row='folder'] .library-tree-node-more");
    expect(styles).toContain('grid-template-columns: 44px 44px 16px minmax(0, 1fr) auto 44px;');
    expect(styles).toMatch(/@media \(max-width: 1023px\)[\s\S]*\[data-library-toolbar='true'\] input\[type='search'\],[\s\S]*\.library-breadcrumb-button \{[\s\S]*min-height: 44px;/);
    expect(styles).toMatch(/\[data-library-toolbar='true'\] \.library-select-all \{[\s\S]*min-width: 44px;[\s\S]*width: 44px;[\s\S]*height: 44px;/);
    expect(source).toContain("'library-panel ui-panel border-r flex flex-col overflow-x-hidden relative'");
    expect(styles).toMatch(/\.library-panel \{[\s\S]*container-type: inline-size;/);
    expect(styles).toMatch(/@container \(max-width: 430px\)[\s\S]*\.library-panel \.library-header-collapsible-action \{[\s\S]*display: none;/);
  });

  it('keeps the standalone mobile library open without repeating its workspace title', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    expect(source).toContain('open: isMobile || listOpen');
    expect(source).toContain('hideHeader: isMobile');
    expect(source).toContain("isMobile ? 'h-11 min-h-11 w-11 min-w-11' : 'h-9 w-9'");
  });

  it('keeps selection exit beside the selection count instead of adding a toolbar row', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    const selectionSummaryIndex = source.indexOf('{sortedItems.length} items');
    const clearSelectionIndex = source.indexOf('aria-label="Clear selection"');

    expect(selectionSummaryIndex).toBeGreaterThan(-1);
    expect(clearSelectionIndex).toBeGreaterThan(selectionSummaryIndex);
    expect(source.match(/aria-label="Clear selection"/g) ?? []).toHaveLength(1);
  });

  it('carries the folder trail on the toolbar row rather than a band of its own', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    const toolbarIndex = source.indexOf('<div className="panel-toolbar">');
    const breadcrumbsIndex = source.indexOf('className="library-breadcrumbs');
    const summaryIndex = source.indexOf('{sortedItems.length} items');

    // The trail sat under a toolbar row that was empty between the root button
    // and the item count — 26px of phone panel for one short line.
    expect(breadcrumbsIndex).toBeGreaterThan(toolbarIndex);
    expect(breadcrumbsIndex).toBeLessThan(summaryIndex);
    expect(source).not.toContain('library-breadcrumbs px-3 py-1');
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


  it('lets the game list fill the panel instead of stopping at a fixed height', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const panel = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

    // Measured with 128 games at 1440x900: the old 240px cap showed seven rows
    // and left about 410px of the panel empty, so everything past the seventh
    // sat behind a scroll of a 231px window. Sizing to the viewport gives 611px
    // there and still falls back to 240px on the shortest desktop window.
    expect(css).toContain('max-height: max(240px, calc(100dvh - 280px));');
    // Only the desktop branch uses it; mobile already sizes itself this way.
    expect(panel).toContain("isMobile ? 'max-h-[calc(100dvh-220px)]' : 'panel-compact-list'");
  });
});

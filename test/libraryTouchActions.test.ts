import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

/**
 * A file row's actions live on a strip that only `:hover` and `:focus-within`
 * reveal, and the strip is `display: none` under `hover: none`. So on a phone
 * the context menu is the whole of a saved game's actions, and anything the
 * strip has that the menu lacks is unreachable rather than merely hidden.
 */
describe('a saved game keeps its actions on a touch screen', () => {
  it('hides the hover strip where there is no hover', () => {
    expect(css).toContain('@media (max-width: 1023px), (max-height: 499px), (hover: none) {');
    expect(css).toContain(
      "    .library-tree-node[data-library-row='file'] .library-tree-node-actions {\n      display: none;\n    }"
    );
  });

  it('carries star and tags in the menu, as the strip does', () => {
    expect(panel).toContain('onClick={() => runContextAction(() => handleToggleFavorite(contextMenuItem))}');
    expect(panel).toContain('onClick={() => runContextAction(() => handleEditTags(contextMenuItem))}');
    expect(panel).toContain('<FaTag size={12} /> Edit tags');
  });

  it('advertises the menu with the same button a folder row has', () => {
    // A long press is the only other way in, and nothing announces it.
    expect(panel).toContain('const moreFileActionsLabel = `More actions for ${item.name}`;');
    expect(panel).toContain('onClick={(event) => openButtonContextMenu(event, item)}');
    expect(panel).toContain('aria-label={moreFileActionsLabel}');

    // Hidden by the base rule, so it appears only in the touch/narrow block.
    expect(css).toContain('  .library-tree-node-more {\n    display: none;\n  }');
    expect(css).toContain(
      "    .library-tree-node[data-library-row='file'] .library-tree-node-more {\n      display: inline-flex;"
    );
    // Room for it, and a 44px target once it is there.
    expect(css).toContain('grid-template-columns: 44px 16px minmax(0, 1fr) auto 44px;');
    expect(css).toContain('      grid-column: 5;\n      grid-row: 1 / 3;\n      width: 44px;\n      height: 44px;');
    // The press state is shared, not folder-scoped as it used to be.
    expect(css).toContain('    .library-tree-node-more:hover,\n    .library-tree-node-more:focus-visible {');
  });

  it('offers star and tags for files only, since folders have neither', () => {
    const start = panel.indexOf('handleToggleFavorite(contextMenuItem)');
    const before = panel.slice(0, start);
    expect(before.lastIndexOf('{isFile(contextMenuItem) && (')).toBeGreaterThan(
      before.lastIndexOf('{isFolder(contextMenuItem) && (')
    );
  });
});

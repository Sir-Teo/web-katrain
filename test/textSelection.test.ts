import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
const dashboardCss = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
const board = readFileSync('src/components/GoBoard.tsx', 'utf8');
const panel = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

describe('text selection is themed everywhere, not just the dashboard', () => {
  it('states the highlight once, in the base layer', () => {
    // It used to be .wk-dashboard-scoped, so the mobile shell, every dialog
    // and the whole review side selected in the browser's own blue over four
    // palettes that have nothing blue in them.
    expect(css).toContain('  ::selection {\n    background: var(--ui-accent-soft);\n    color: var(--ui-text);\n  }');
    expect(dashboardCss).not.toContain('.wk-dashboard ::selection {');
  });
});

describe('a long press does not select what it is acting on', () => {
  it('leaves library rows unselectable, as the board already is', () => {
    // Both surfaces answer a long press with their own menu or markup; a
    // selection started by the same press leaves a highlight behind it.
    expect(panel).toContain('onContextMenu={(event) => openContextMenu(event, item)}');
    expect(css).toContain('  .library-tree-node {\n    user-select: none;\n    -webkit-touch-callout: none;\n  }');
    expect(board).toContain("'relative shadow-lg rounded-sm select-none',");
  });

  it('costs nothing, because those rows are draggable and own their menu', () => {
    // Neither pointer could have selected this text: a drag reorders the row
    // and a right-click opens the app's menu.
    expect(panel).toContain('draggable');
    expect(panel).toContain('const openContextMenu = (event: React.MouseEvent, item: LibraryItem | null) => {');
  });
});

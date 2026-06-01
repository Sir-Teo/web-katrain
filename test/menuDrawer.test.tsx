import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MenuDrawer } from '../src/components/layout/MenuDrawer';
import type { LibraryFile } from '../src/utils/library';

const recentFile: LibraryFile = {
  id: 'recent-1',
  type: 'file',
  name: 'Teaching Game',
  parentId: null,
  createdAt: Date.UTC(2026, 0, 1),
  updatedAt: Date.UTC(2026, 0, 2, 12, 30),
  sgf: '(;GM[1]SZ[19])',
  moveCount: 42,
  size: 1536,
  metadata: {},
};

describe('MenuDrawer', () => {
  it('shows move count and size for recent games', () => {
    const html = renderToStaticMarkup(
      <MenuDrawer
        open
        onClose={() => undefined}
        onQuickNewGame={() => undefined}
        onNewGame={() => undefined}
        onSave={() => undefined}
        onSaveToLibrary={() => undefined}
        onLoad={() => undefined}
        onScanBoard={() => undefined}
        onCopy={() => undefined}
        onPaste={() => undefined}
        onSettings={() => undefined}
        onCommandPalette={() => undefined}
        onKeyboardHelp={() => undefined}
        onAbout={() => undefined}
        recentItems={[recentFile]}
        onOpenRecent={() => undefined}
      />
    );

    expect(html).toContain('Teaching Game');
    expect(html).toContain('42 moves · 1.5 KB');
  });

  it('shows the save-copy shortcut beside the library save action', () => {
    const html = renderToStaticMarkup(
      <MenuDrawer
        open
        onClose={() => undefined}
        onQuickNewGame={() => undefined}
        onNewGame={() => undefined}
        onSave={() => undefined}
        onSaveToLibrary={() => undefined}
        onLoad={() => undefined}
        onScanBoard={() => undefined}
        onCopy={() => undefined}
        onPaste={() => undefined}
        onSettings={() => undefined}
        onCommandPalette={() => undefined}
        onKeyboardHelp={() => undefined}
        onAbout={() => undefined}
      />
    );

    expect(html).toContain('Save Copy to Library');
    expect(html).toContain('Ctrl+Shift+S');
  });
});

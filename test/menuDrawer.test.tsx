import { readFileSync } from 'node:fs';
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
      />,
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
      />,
    );

    expect(html).toContain('Save Copy to Library');
    expect(html).toContain('Ctrl+Shift+S');
  });

  it('explains that quick new game uses defaults and checks unsaved changes', () => {
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
        quickNewGameBoardSize={13}
      />,
    );

    expect(html).toContain('Quick new game (13×13): uses your saved defaults and replaces the current game after the unsaved-changes check.');
    expect(html).toContain('Defaults');
  });

  it('offers the app locale in the mobile menu settings section', () => {
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
        appLocale="ja"
        onLocaleChange={() => undefined}
      />,
    );

    expect(html).toContain('for="menu-app-locale"');
    expect(html).toContain('id="menu-app-locale"');
    expect(html).toContain('data-menu-locale="true"');
    expect(html).toContain('Document language');
    expect(html).toContain('Metadata');
    expect(html).toContain('Japanese');
  });

  it('keeps the drawer title and close action available while scrolling', () => {
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
      />,
    );

    expect(html).toContain('data-menu-header="true"');
    expect(html).toContain('sticky top-0');
    expect(html).toMatch(/class="[^"]*ui-control[^"]*" aria-label="Close menu"/);
  });

  it('groups common mobile actions into compact responsive grids', () => {
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
        onLessons={() => undefined}
        onCopy={() => undefined}
        onPaste={() => undefined}
        onSettings={() => undefined}
        onCommandPalette={() => undefined}
        onKeyboardHelp={() => undefined}
        onAbout={() => undefined}
      />,
    );

    expect(html).toContain('data-menu-drawer-panel="true"');
    expect(html).toContain('data-menu-action-grid="game"');
    expect(html).toContain('data-menu-action-grid="edit"');
    expect(html).toContain('data-menu-action-grid="study"');
    expect(html).toContain('data-menu-action-grid="settings"');
    expect(html).toContain('grid-cols-2');
  });

  it('balances incomplete action rows instead of rendering ghost cells', () => {
    const css = readFileSync('src/index.css', 'utf8');

    expect(css).toMatch(/\[data-menu-action-grid='game'\] > button:last-child:nth-child\(7\) \{[^}]*grid-column: 1 \/ -1;/);
    expect(css).toMatch(/\[data-menu-action-grid='edit'\],[\s\S]{0,120}\[data-menu-action-grid='settings'\] \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/);
    expect(css).toMatch(/\[data-menu-action-grid='settings'\] > button:nth-child\(n \+ 3\) \{[^}]*border-top: 1px solid var\(--ui-border\);/);
  });
});

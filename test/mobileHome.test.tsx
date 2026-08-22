import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileHome } from '../src/components/MobileHome';
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

const baseProps = {
  open: true,
  blackName: 'Black',
  whiteName: 'White',
  boardSize: 19,
  moveCount: 42,
  engineMeta: 'KataGo · 20 visits',
  recentItems: [],
  onClose: () => undefined,
  onQuickNewGame: () => undefined,
  onNewGame: () => undefined,
  onOpenSgf: () => undefined,
  onScanBoard: () => undefined,
  onSaveToLibrary: () => undefined,
  onCopySgf: () => undefined,
  onPasteSgf: () => undefined,
  onOpenLibrary: () => undefined,
  onOpenReport: () => undefined,
  onOpenSettings: () => undefined,
  onOpenRecent: () => undefined,
};

describe('MobileHome', () => {
  it('surfaces connected gamepad navigation in the mobile header', () => {
    const html = renderToStaticMarkup(
      <MobileHome
        {...baseProps}
        gamepadName="Xbox Wireless Controller"
        gamepadCount={2}
        onGamepadNavigationDisable={() => undefined}
      />,
    );

    expect(html).toContain('data-mobile-gamepad-status="connected"');
    expect(html).toContain('data-mobile-gamepad-label="Xbox Wireless C..."');
    expect(html).toContain('data-mobile-gamepad-count="2"');
    expect(html).toContain('2 controllers connected; using the most recently active');
    expect(html).toContain('border-[var(--ui-accent)] bg-[var(--ui-accent-soft)]');
  });

  it('keeps the header uncluttered when no gamepad is connected', () => {
    const html = renderToStaticMarkup(<MobileHome {...baseProps} />);

    expect(html).not.toContain('data-mobile-gamepad-status="connected"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="mobile-home-title"');
    expect(html).toContain('data-mobile-home="true"');
    expect(html).toContain('aria-label="Open board"');
  });

  it('keeps saving and SGF copying reachable from the mobile home launcher', () => {
    const html = renderToStaticMarkup(<MobileHome {...baseProps} />);

    expect(html).toContain('Save Copy to Library');
    expect(html).toContain('Copy SGF');
    expect(html).toContain('aria-label="Manage game and app"');
  });

  it('uses full-width actions and promotes recent games above management utilities', () => {
    const html = renderToStaticMarkup(<MobileHome {...baseProps} recentItems={[recentFile]} />);

    expect(html).toContain('min-h-12 w-full');
    expect(html).toContain('mobile-home-actions--primary');
    expect(html).toContain('mobile-home-actions--secondary');
    expect(html.indexOf('Teaching Game')).toBeLessThan(html.indexOf('Save Copy to Library'));
  });

  it('makes the scan action discoverable as camera or image import', () => {
    const html = renderToStaticMarkup(<MobileHome {...baseProps} />);

    expect(html).toContain('Photo Board');
    expect(html).toContain('Camera or image');
  });

  it('explains the quick new game replacement risk on mobile home', () => {
    const html = renderToStaticMarkup(<MobileHome {...baseProps} quickNewGameBoardSize={13} />);

    expect(html).toContain('Quick new game (13×13): uses your saved defaults and replaces the current game after the unsaved-changes check.');
    expect(html).toContain('13×13 defaults');
  });

  it('shows move count and size for recent games', () => {
    const html = renderToStaticMarkup(<MobileHome {...baseProps} recentItems={[recentFile]} />);

    expect(html).toContain('Teaching Game');
    expect(html).toContain('42 moves · 1.5 KB');
  });

  it('caps recent games so management actions stay near the first screen', () => {
    const recentItems = Array.from({ length: 4 }, (_, index) => ({
      ...recentFile,
      id: `recent-${index + 1}`,
      name: `Teaching Game ${index + 1}`,
    }));
    const html = renderToStaticMarkup(<MobileHome {...baseProps} recentItems={recentItems} />);

    expect(html).toContain('Teaching Game 3');
    expect(html).not.toContain('Teaching Game 4');
    expect(html).toContain('Save Copy to Library');
  });
});

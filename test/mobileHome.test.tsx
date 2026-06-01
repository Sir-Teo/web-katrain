import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileHome } from '../src/components/MobileHome';

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
    expect(html).toContain('aria-label="Open board"');
  });
});

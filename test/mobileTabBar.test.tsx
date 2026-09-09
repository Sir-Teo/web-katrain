import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MobileTabBar } from '../src/components/layout/MobileTabBar';

describe('MobileTabBar', () => {
  it('suppresses pointer focus residue without removing keyboard focus styling', () => {
    const html = renderToStaticMarkup(
      <MobileTabBar activeTab="board" onTabChange={() => undefined} />,
    );
    const source = readFileSync('src/components/layout/MobileTabBar.tsx', 'utf8');
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('data-mobile-tab-focus-origin="keyboard"');
    expect(source).toContain('onPointerDown={() => setPointerFocusedTab(tab.id)}');
    expect(source).toContain("setPointerFocusedTab(event.detail === 0 ? null : tab.id)");
    expect(source).toContain("pointerFocusedTab === tab.id ? 'mobile-tab-pointer-focus' : ''");
    expect(layout).toContain('fixed bottom-0 left-0 right-0 z-[44]');
    expect(css).toMatch(/\.mobile-tabbar \{[\s\S]*position: relative;[\s\S]*isolation: isolate;[\s\S]*z-index: 1;/);
    expect(css).toMatch(/\.mobile-tab-pointer-focus:focus-visible\s*\{[^}]*outline: none;/);
    expect(css).toMatch(/button:focus-visible,[\s\S]*outline: 2px solid var\(--ui-accent\)/);
  });

  // The badge is the only place the app says a game carries notes. An
  // aria-label replaces the button's whole subtree, so while the label read
  // "Review" the count reached nobody who could not see the red circle.
  it('says how many notes the badge is counting', () => {
    const html = renderToStaticMarkup(
      <MobileTabBar activeTab="board" onTabChange={() => undefined} commentBadge={3} />,
    );

    expect(html).toContain('aria-label="Review, 3 notes"');
  });

  it('counts one note in the singular', () => {
    const html = renderToStaticMarkup(
      <MobileTabBar activeTab="board" onTabChange={() => undefined} commentBadge={1} />,
    );

    expect(html).toContain('aria-label="Review, 1 note"');
  });

  it('reads the real count past the "9+" the circle has room for', () => {
    const html = renderToStaticMarkup(
      <MobileTabBar activeTab="board" onTabChange={() => undefined} commentBadge={24} />,
    );

    expect(html).toContain('aria-label="Review, 24 notes"');
    expect(html).toContain('>9+<');
  });

  it('leaves the plain label alone with nothing to count', () => {
    for (const badge of [undefined, 0]) {
      const html = renderToStaticMarkup(
        <MobileTabBar activeTab="board" onTabChange={() => undefined} commentBadge={badge} />,
      );

      expect(html).toContain('aria-label="Review"');
      expect(html).not.toContain('bg-rose-500');
    }
  });
});

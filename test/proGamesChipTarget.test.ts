import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modal = readFileSync('src/components/ProGamesModal.tsx', 'utf8');
const sweep = readFileSync('scripts/check-viewports.mjs', 'utf8');

/**
 * `min-h-11 ... desktop-shell:min-h-0` appears in eleven files: 44px under a
 * finger, no floor at all under a mouse. Almost everywhere the element's own
 * padding carries it well past 24px anyway. The featured-game chips are the
 * exception -- py-0.5 around 11px text measures 23px, one pixel under WCAG 2.2
 * SC 2.5.8, which is the floor this app's own sweep holds every other desktop
 * dialog target to.
 */
describe('the featured pro-game chips', () => {
  it('keeps a floor under a mouse instead of dropping to none', () => {
    expect(modal).toContain("'min-h-11 shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] transition-colors desktop-shell:min-h-6',");
  });

  it('still carries the touch floor', () => {
    // The desktop variant narrows the floor; it must not remove the 44px one.
    expect(modal).toContain('min-h-11 shrink-0 rounded-full');
  });

  it('leaves the chips that clear 24px on their own padding alone', () => {
    // The search field and Surprise me button are py-2 and text-sm; their own
    // box is already past the floor, so they keep the plain min-h-0.
    expect(modal).toContain('py-2 pl-9 pr-3 text-sm text-[var(--ui-text)] desktop-shell:min-h-0');
    expect(modal).toContain('px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] desktop-shell:min-h-0');
  });
});

describe('the sweep opens dialogs that have no shortcut', () => {
  it('reaches them through the palette', () => {
    expect(sweep).toContain('const openViaPalette = (commandId) => async () => {');
    expect(sweep).toContain("document.querySelector('[data-command-palette-item=\"' + commandId + '\"]')?.click();");
  });

  it('smoke-tests the three read-only dialogs it unlocked', () => {
    for (const [name, title, id] of [
      ['about', 'about-title', 'about'],
      ['lessons', 'lessons-title', 'lessons'],
      ['pro games', 'pro-games-title', 'pro-games'],
    ]) {
      expect(sweep, name).toContain(`name: '${name}',`);
      expect(sweep, name).toContain(`selector: '[aria-labelledby="${title}"]',`);
      expect(sweep, name).toContain(`open: openViaPalette('${id}'),`);
    }
  });

  it('opens each one through a command the palette actually offers', () => {
    // A renamed command id would open nothing, which reads as "did not open".
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    for (const id of ['about', 'lessons', 'pro-games']) {
      expect(layout, id).toContain(`id: '${id}',`);
    }
  });
});

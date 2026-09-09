import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');

describe('touch press feedback', () => {
  it('turns off the browser tap highlight', () => {
    // The default highlight is a square-cornered rectangle, so it overhangs
    // every rounded control here and paints over the board on a tap.
    expect(css).toContain('-webkit-tap-highlight-color: transparent;');
  });

  it('replaces it with a press state on devices that cannot hover', () => {
    // Tailwind v4 compiles `hover:` to `@media (hover: hover)`, and the
    // hand-written :hover rules never match a finger, so without this a phone
    // would acknowledge a tap with nothing at all.
    const start = css.indexOf('@media (hover: none) {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n  }\n', start));
    expect(block).toContain("button:not(:disabled):active");
    expect(block).toContain("[role='button']:not([aria-disabled='true']):active");
    expect(block).toContain('opacity: 0.62;');
  });

  it('fades rather than scales, so a menu measured mid-press lands right', () => {
    // LibraryPanel.openButtonContextMenu reads getBoundingClientRect() during
    // the click that opens the menu; a transform on :active would move the box
    // it measures. Keep the touch press state free of transforms.
    const start = css.indexOf('@media (hover: none) {');
    const block = css.slice(start, css.indexOf('\n  }\n', start));
    expect(block).not.toContain('transform:');

    const panel = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    expect(panel).toContain('const openButtonContextMenu = (event: React.MouseEvent<HTMLButtonElement>, item: LibraryItem) => {');
    expect(panel).toContain('const rect = event.currentTarget.getBoundingClientRect();');
  });
});

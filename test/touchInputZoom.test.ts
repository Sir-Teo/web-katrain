import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const panel = readFileSync('src/components/LibraryPanel.tsx', 'utf8');

describe('focusing a field on a phone does not zoom the app', () => {
  it('floors form controls at 16px where there is no hover', () => {
    // iOS Safari zooms the page in when a control smaller than 16px takes
    // focus, and does not zoom back out on blur. Every text field here is
    // Tailwind's text-sm (14px) or text-xs (12px).
    const start = css.indexOf('  @media (hover: none) {\n    input:not(');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('\n  }\n', css.indexOf('font-size: 16px !important;', start)));
    expect(block).toContain("input:not([type='checkbox'])");
    expect(block).toContain("select,\n    textarea {\n      font-size: 16px !important;");
    // Checkboxes, radios, sliders, colour and file pickers have no text to
    // zoom for and are laid out by size.
    for (const type of ['checkbox', 'radio', 'range', 'color', 'file']) {
      expect(block, type).toContain(`:not([type='${type}'])`);
    }
  });

  it('does not buy the fix by disabling pinch-zoom', () => {
    // maximum-scale=1 would stop the zoom by taking zoom away from everyone.
    expect(html).toContain('content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
    expect(html).not.toContain('maximum-scale');
    expect(html).not.toContain('user-scalable');
  });

  it('exempts the desktop rail move counter, and says why', () => {
    // A 38px slot in a 34px pill on a rail measured at 5.8px of headroom; a
    // coarse pointer reaches it only on a tablet in the desktop shell.
    expect(css).toContain('.wk-dashboard .move-counter input {\n      font-size: 12.5px !important;\n    }');
  });
});

describe('the library search field', () => {
  it('reserves the clear button room only while the button is there', () => {
    // 36px of right padding was held on an empty field for a button that only
    // renders with a query -- and held it from the placeholder, which is the
    // only text an empty field has.
    expect(panel).toContain("query ? 'pr-9' : 'pr-2',");
    expect(panel).toContain('{query && (');
    expect(panel).toContain('aria-label="Clear library search"');
  });
});

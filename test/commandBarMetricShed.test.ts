import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = () => readFileSync('src/components/dashboard/dashboard.css', 'utf8');

describe('command bar metric qualifiers', () => {
  it('sheds on a narrow board column, not just a narrow viewport', () => {
    // There was already a rule dropping these at data-layout="compact", but
    // layout mode reads the viewport: opening the library at 1440px squeezed the
    // column to 802px and truncated "White favored" to "White f...".
    const text = css();
    const at = text.indexOf('.wk-dashboard .cb-metric .sub { display: none; }');
    expect(at).toBeGreaterThan(-1);

    const enclosing = text.lastIndexOf('@container boardcol', at);
    expect(enclosing).toBeGreaterThan(-1);
    expect(text.slice(enclosing, text.indexOf('{', enclosing))).toContain('max-width: 1000px');
  });

  it('keeps the viewport-based rule as well', () => {
    // The two cover different things: one a small screen, one a squeezed column.
    expect(css()).toContain('.wk-dashboard[data-layout="compact"] .cb-metric .sub');
  });
});

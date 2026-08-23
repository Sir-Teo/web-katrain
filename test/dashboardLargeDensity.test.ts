import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop dashboard large density', () => {
  it('honors the large density preference without changing the default scale', () => {
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(css).toContain(":root[data-ui-density='large'] .wk-dashboard");
    expect(css).toContain("font-size: 15px;");
    expect(css).toContain("min-height: 38px;");
    expect(css).toContain("min-height: 34px;");
    expect(css).toContain("min-height: 32px;");
    expect(css).toContain("@container boardcol (max-width: 699px)");
  });
});

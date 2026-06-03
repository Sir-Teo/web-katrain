import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('compact numeric editors', () => {
  it('hides native number steppers only on compact move and branch editors', () => {
    const indexCss = readFileSync('src/index.css', 'utf8');
    const dashboardCss = readFileSync('src/components/dashboard/dashboard.css', 'utf8');

    expect(dashboardCss).toContain('.wk-dashboard .move-counter input::-webkit-outer-spin-button');
    expect(dashboardCss).toContain(".wk-dashboard .move-counter input[type='number']");
    expect(dashboardCss).toContain('appearance: textfield');

    expect(indexCss).toContain('.ui-bar input[type="number"][aria-label="Move number"]::-webkit-outer-spin-button');
    expect(indexCss).toContain('.panel-toolbar input[type="number"][aria-label="Branch number"]::-webkit-outer-spin-button');
    expect(indexCss).toContain('.ui-bar input[type="number"][aria-label="Move number"]');
    expect(indexCss).toContain('.panel-toolbar input[type="number"][aria-label="Branch number"]');
    expect(indexCss).toContain('appearance: textfield');
    expect(indexCss).not.toContain('input[type="number"]::-webkit-outer-spin-button');
  });
});

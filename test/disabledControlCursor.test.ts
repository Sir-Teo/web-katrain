import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');

describe('disabled control cursor', () => {
  it('states the cursor once for every disabled control', () => {
    // Four component classes had answered this one at a time; the Tailwind
    // controls had no rule at all. The base rule is what makes the state read
    // the same whichever button it lands on.
    const rule = /button:disabled,\s*input:disabled,\s*select:disabled,\s*textarea:disabled,[\s\S]{0,200}?\{\s*cursor: not-allowed;/;

    expect(css).toMatch(rule);
  });

  it('covers the roles that stand in for a disabled button', () => {
    // aria-disabled is how a menu item or tab says the same thing; :disabled
    // does not match them.
    for (const selector of [
      "[role='button'][aria-disabled='true']",
      "[role='menuitem'][aria-disabled='true']",
      "[role='tab'][aria-disabled='true']",
    ]) {
      expect(css).toContain(selector);
    }
  });

  it('keeps the per-component rules it generalises', () => {
    // Removing these would change specificity for the classes that also set a
    // background or opacity in the same block.
    for (const selector of [
      '.panel-icon-button:disabled',
      '.panel-action-button:disabled',
      '.analysis-command-bar__button:disabled',
      '.manual-score-launch:disabled',
    ]) {
      expect(css).toContain(selector);
    }
  });
});

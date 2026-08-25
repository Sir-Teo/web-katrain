import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = () => readFileSync('src/index.css', 'utf8');

const enclosingMediaQuery = (needle: string) => {
  const text = css();
  const at = text.indexOf(needle);
  expect(at).toBeGreaterThan(-1);
  for (let i = at; i >= 0; i -= 1) {
    if (!text.startsWith('@media', i)) continue;
    const segment = text.slice(i, at);
    // Only a query still open at the needle encloses it.
    if ((segment.match(/\{/g) ?? []).length > (segment.match(/\}/g) ?? []).length) {
      return text.slice(i, text.indexOf('{', i)).trim();
    }
  }
  return null;
};

describe('command palette shortcut chips', () => {
  it('hides at the same breakpoint as every other keyboard hint', () => {
    // These were hidden only below 360px, so every phone wider than that showed
    // 62 Ctrl+... labels while the menu drawer and the shortcuts-modal footer
    // dropped theirs. Same rule now, so they cannot drift apart again.
    expect(enclosingMediaQuery('.command-palette-shortcut,')).toBe('@media (max-width: 1023px)');
    expect(enclosingMediaQuery('.mobile-shortcut-hint,')).toBe('@media (max-width: 1023px)');
  });

  it('keeps them in one rule with the other hints', () => {
    expect(css()).toMatch(/\.mobile-shortcut-hint,\s*\n\s*\.command-palette-shortcut,/);
  });
});

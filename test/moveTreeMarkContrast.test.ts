import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8');
const tree = readFileSync('src/components/MoveTree.tsx', 'utf8');

const srgb = (channel: number) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * srgb(r!) + 0.7152 * srgb(g!) + 0.0722 * srgb(b!);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** A theme's block, from the `:root` selector that opens it to its brace. */
function tokensOf(themeSelector: string): Record<string, string> {
  const start = css.indexOf(themeSelector);
  expect(start, themeSelector).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf('\n  }', start));
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,6});/g)].map((m) => [m[1]!, m[2]!])
  );
}

const base = tokensOf("  :root,\n  :root[data-ui-theme='noir'] {");
const light = tokensOf("  :root[data-ui-theme='light'] {");
const MARKS = ['--tree-edge', '--tree-current', '--tree-best'] as const;

describe('the move tree marks read on every theme', () => {
  it('defines each mark on the base and overrides it for light', () => {
    // Kaya and Studio inherit the base values: they are dark panels too, and
    // the originals measured 6.7 to 11.2 against them.
    for (const token of MARKS) {
      expect(base[token], token).toBeTruthy();
      expect(light[token], token).toBeTruthy();
      expect(light[token], token).not.toBe(base[token]);
    }
  });

  it('clears the 3:1 a graphic needs, on its own theme panel', () => {
    for (const token of MARKS) {
      expect(contrast(base[token]!, base['--ui-panel']!), `${token} on noir`).toBeGreaterThan(3);
      expect(contrast(light[token]!, light['--ui-panel']!), `${token} on light`).toBeGreaterThan(3);
    }
  });

  it('is what the marks are actually drawn with', () => {
    expect(css).toContain('  .move-tree-edge {\n    stroke: var(--tree-edge);\n  }');
    expect(css).toContain('    stroke: var(--tree-current);');
    expect(css).toContain('    fill: var(--tree-best);');
    expect(css).toContain('    stroke: var(--tree-best);');
    expect(tree).toContain('className="move-tree-edge"');
    expect(tree).toContain('className="move-tree-node-ring-current"');
    // The two that were fixed hexes in the component are gone from it.
    expect(tree).not.toContain('#9CA3AF');
    expect(tree).not.toContain('#FACC15');
  });

  it('leaves the marks that already passed everywhere', () => {
    // #EF4444 3.76 on light, #dc2626 4.83, #a855f7 3.96 -- measured, not missed.
    const panels = [base['--ui-panel']!, light['--ui-panel']!];
    for (const hex of ['#EF4444', '#dc2626', '#a855f7']) {
      for (const panel of panels) {
        expect(contrast(hex, panel), `${hex} on ${panel}`).toBeGreaterThan(3);
      }
    }
  });
});

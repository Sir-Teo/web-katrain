import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the phone move list columns', () => {
  it('places moves by colour, so a White-first game keeps Black on the left', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    expect(source).toContain("isMobile && move ? `move-tree-list-split-${move.player}` : ''");
    expect(css).toMatch(/\.move-tree-list-split > \.move-tree-list-split-black \{\s*grid-column: 1;\s*border-right: 1px solid var\(--ui-border\);/);
    expect(css).toMatch(/\.move-tree-list-split > \.move-tree-list-split-white \{\s*grid-column: 2;/);
    // Counting children put the divider on the outer edge and White on the left.
    expect(css).not.toContain('.move-tree-list-split > button:nth-child(odd)');
  });
});

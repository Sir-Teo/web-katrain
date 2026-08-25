import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('move tree root node', () => {
  it('fills transparent so its whole disc is clickable', () => {
    const source = readFileSync('src/components/MoveTree.tsx', 'utf8');
    const fillLine = source
      .split('\n')
      .find((line) => line.includes('const fill = isRoot ?'));

    expect(fillLine).toBeDefined();
    // SVG shapes filled 'none' do not hit-test their interior, so a root drawn
    // that way answered clicks only on its 1px ring — the edge polyline behind
    // it swallowed the rest, and jumping back to move 0 from the tree missed.
    expect(fillLine).toContain("isRoot ? 'transparent'");
    expect(fillLine).not.toContain("isRoot ? 'none'");
  });
});

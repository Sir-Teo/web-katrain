import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const controlBlocks = (css: string): string[] => {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf('.move-tree-floating-controls {', from);
    if (start === -1) break;
    const end = css.indexOf('}', start);
    blocks.push(css.slice(start, end));
    from = end;
  }
  return blocks;
};

describe('move tree floating controls', () => {
  it('takes its own band on every viewport instead of sitting on the tree', () => {
    const blocks = controlBlocks(readFileSync('src/index.css', 'utf8'));
    expect(blocks.length).toBeGreaterThan(1);

    // A mainline game is one row of nodes across the top of the pane, so the
    // zero-height bar covered a stretch of moves — five of thirty-four in the
    // desktop sidebar, seven on a phone, where nothing hovers to reveal them.
    // Both panes are content-sized under a cap, so the bar can take up flow.
    const base = blocks[0]!;
    expect(base).toContain('height: auto;');
    expect(base).toContain('padding-bottom: 0.375rem;');
    expect(blocks.every((block) => !block.includes('height: 0'))).toBe(true);
  });

  it('renders the controls ahead of the tree so the band sits above it', () => {
    const source = readFileSync('src/components/MoveTree.tsx', 'utf8');

    expect(source.indexOf('move-tree-floating-controls')).toBeLessThan(
      source.indexOf('data-move-tree="true"')
    );
  });
});

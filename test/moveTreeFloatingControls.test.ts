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
  it('takes its own band on phones instead of sitting on the tree', () => {
    const blocks = controlBlocks(readFileSync('src/index.css', 'utf8'));
    expect(blocks.length).toBeGreaterThan(1);

    // A mainline game is one row of nodes across the top of the pane, so the
    // zero-height bar covered about seven of its moves, with no hover on touch
    // to reveal what was under them. The phone override has to take up flow.
    const phone = blocks[blocks.length - 1]!;
    expect(phone).toContain('height: auto;');
    expect(phone).toContain('padding-bottom: 0.5rem;');
  });

  it('renders the controls ahead of the tree so the band sits above it', () => {
    const source = readFileSync('src/components/MoveTree.tsx', 'utf8');

    expect(source.indexOf('move-tree-floating-controls')).toBeLessThan(
      source.indexOf('data-move-tree="true"')
    );
  });
});

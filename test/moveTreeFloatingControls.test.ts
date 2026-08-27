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

  it('lays the tree map upward from its zero-height strip so all of it shows', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const start = css.indexOf('.move-tree-minimap {');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf('}', start));

    // The strip is zero-height on purpose — the map floats over the tree rather
    // than taking a row of it — but a flex line of zero height lays its item out
    // downward from the sticky edge unless told otherwise, and 71px of the 88px
    // map hung below the scrollport. All a reader saw was its top sliver.
    expect(block).toContain('height: 0;');
    expect(block).toContain('bottom: 0.5rem;');
    expect(block).toContain('align-items: flex-end;');
  });

  it('renders the controls ahead of the tree so the band sits above it', () => {
    const source = readFileSync('src/components/MoveTree.tsx', 'utf8');

    expect(source.indexOf('move-tree-floating-controls')).toBeLessThan(
      source.indexOf('data-move-tree="true"')
    );
  });
});

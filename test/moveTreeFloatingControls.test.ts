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

  it('hangs the controls, the map and the notice off the pane, not the scroller', () => {
    const source = readFileSync('src/components/MoveTree.tsx', 'utf8');
    const css = readFileSync('src/index.css', 'utf8');

    // Sticky cannot hold anything against a horizontal scroll here: a block
    // child's containing block is exactly as wide as the scrollport, so there
    // is no room to offset and the element rides away with the tree. At move
    // 231 of a 231-move game — the view the panel opens on — the control band,
    // the map and the layout notice all sat ~3,700px off-screen.
    const shellIndex = source.indexOf('className="move-tree-shell');
    const barIndex = source.indexOf('move-tree-floating-controls');
    const scrollerIndex = source.indexOf("className=\"relative min-h-0 w-full flex-1 overflow-auto\"");
    const svgIndex = source.indexOf('data-move-tree="true"');
    const mapIndex = source.indexOf('data-move-tree-minimap="true"');

    expect(shellIndex).toBeGreaterThan(-1);
    expect(scrollerIndex).toBeGreaterThan(-1);
    // Band above the scroller, tree inside it, map after it closes again.
    expect(shellIndex).toBeLessThan(barIndex);
    expect(barIndex).toBeLessThan(scrollerIndex);
    expect(scrollerIndex).toBeLessThan(svgIndex);
    expect(svgIndex).toBeLessThan(mapIndex);
    expect(source).toContain('className="move-tree-overlay-strip"');
    expect(source).toContain('className="move-tree-layout-notice"');
    expect(source.indexOf('className="move-tree-overlay-strip"')).toBeLessThan(mapIndex);

    // The band and the strip are still sticky, because the pane itself scrolls
    // in the vertical tree layout — what they must not be is sticky inside the
    // box that scrolls sideways.
    for (const [selector, decl] of [
      ['.move-tree-floating-controls {', 'top: 0;'],
      ['.move-tree-overlay-strip {', 'bottom: 0.5rem;'],
    ] as const) {
      const start = css.indexOf(selector);
      expect(start).toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf('}', start));
      expect(block).toContain('position: sticky;');
      expect(block).toContain(decl);
    }
  });
});

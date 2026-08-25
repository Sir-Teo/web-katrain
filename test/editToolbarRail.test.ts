import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop edit palette rail', () => {
  const css = () => readFileSync('src/components/dashboard/dashboard.css', 'utf8');

  it('anchors the rail to the stage when the library column is collapsed', () => {
    // --library-w is the library's width when showing, not the width it
    // occupies: the grid gives that column 0px while collapsed, but the
    // variable keeps its full value. Offsetting by it pushed the palette a
    // library's width right, over columns A-D — 76 intersections that could
    // not be clicked in the one mode built for placing stones.
    expect(css()).toMatch(
      /\.wk-dashboard\[data-library="closed"\][\s\S]{0,120}\.edit-toolbar-panel--docked \{\s*\n\s*left: 16px;/
    );
  });

  it('still offsets past the library while it is showing', () => {
    expect(css()).toContain('left: calc(var(--library-w) + 16px);');
  });

  it('keeps the stage reserving a rail for it', () => {
    expect(css()).toContain('padding-left: calc(var(--stage-pad) + 184px);');
  });
});

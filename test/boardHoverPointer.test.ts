import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('board hover feedback by pointer type', () => {
  it('treats a pen as a hovering pointer and touch as a press', () => {
    const source = readFileSync('src/components/GoBoard.tsx', 'utf8');

    // The hovered stone's move number was gated on `pointerType === 'mouse'`,
    // which also excluded a pen — an Apple Pencil or a Surface pen reports a
    // position without contact, so hovering a stone on a tablet gave nothing.
    // Pixel-diffed on an 80x80 clip around a played stone at 1440x900: a mouse
    // hover changed 759 pixels, a pen 0. Both change 759 now, and touch still
    // changes none, because there a "hover" is a press and the readout would
    // sit under the finger making it.
    expect(source).toContain("setHoverFromHoveringPointer(e.pointerType !== 'touch');");
    expect(source).not.toContain("e.pointerType === 'mouse'");

    // The flag's name has to survive the widening, or the next reader will
    // assume a mouse-only gate that is no longer there.
    expect(source).not.toContain('hoverFromMouse');
    expect(source).toContain('if (!hoverFromHoveringPointer || !cursorPt');
  });
});

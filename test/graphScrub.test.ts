import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexAtGraphX } from '../src/utils/graphScrub';

const graph = readFileSync('src/components/ScoreWinrateGraph.tsx', 'utf8');
const at = (clientX: number, count = 41) => indexAtGraphX({ clientX, left: 100, width: 400, count });

describe('reading a move off a point on the graph', () => {
  it('maps the ends to the ends', () => {
    expect(at(100)).toBe(0);
    expect(at(500)).toBe(40);
  });

  it('maps the middle to the middle', () => {
    expect(at(300)).toBe(20);
  });

  it('rounds to the nearest point rather than the one before', () => {
    // One step is 10px here; 306 is nearer point 21 than 20.
    expect(at(306)).toBe(21);
    expect(at(304)).toBe(20);
  });

  it('clamps to the ends outside the box, rather than stopping', () => {
    // A drag holds the pointer captured, so the finger leaves the box
    // routinely; past the right edge it should sit on the last move.
    expect(at(0)).toBe(0);
    expect(at(99)).toBe(0);
    expect(at(501)).toBe(40);
    expect(at(5000)).toBe(40);
  });

  it('returns nothing when there is nothing to divide by', () => {
    // A box that has not been laid out, and a graph of one point.
    expect(indexAtGraphX({ clientX: 100, left: 100, width: 0, count: 41 })).toBe(null);
    expect(indexAtGraphX({ clientX: 100, left: 100, width: 400, count: 1 })).toBe(null);
    expect(indexAtGraphX({ clientX: NaN, left: 100, width: 400, count: 41 })).toBe(null);
  });
});

describe('a finger can scrub the graph, not just a pointer', () => {
  it('takes pointer events rather than mouse events', () => {
    // Mouse-only listeners meant a tap worked -- browsers synthesise a
    // mousemove before the click -- but the gesture the graph is shaped for,
    // running along it to scan the game, did nothing on a touch screen.
    expect(graph).toContain('onPointerDown={handlePointerDown}');
    expect(graph).toContain('onPointerMove={handlePointerMove}');
    expect(graph).toContain('onPointerUp={endScrub}');
    expect(graph).toContain('onPointerCancel={endScrub}');
    expect(graph).not.toContain('onMouseMove=');
    expect(graph).not.toContain('onMouseLeave=');
  });

  it('previews on movement for a mouse, and only under a finger for touch', () => {
    // There is no hovering on a touch screen, and previewing whatever the page
    // scrolled under would be noise.
    expect(graph).toContain("if (e.pointerType === 'mouse') return;");
    expect(graph).toContain("if (e.pointerType !== 'mouse' && !isScrubbing) return;");
  });

  it('lets the panel keep scrolling vertically while the drag is horizontal', () => {
    // Without a touch-action the browser claims the horizontal gesture and the
    // drag never arrives; `none` would take the panel's scroll away with it.
    expect(graph).toContain("touchAction: hasGraphData ? 'pan-y' : undefined");
  });

  it('follows the finger outside the box, and lands where it left off', () => {
    expect(graph).toContain('e.currentTarget.setPointerCapture?.(e.pointerId);');
    expect(graph).toContain('e.currentTarget.releasePointerCapture?.(e.pointerId);');
    expect(graph).toContain('if (hoverIndex !== null && displayNodes[hoverIndex]) jumpToNode(displayNodes[hoverIndex]);');
  });
});

import { describe, expect, it } from 'vitest';
import { getBoardTooltipPlacement } from '../src/utils/boardTooltipPlacement';

describe('board tooltip placement', () => {
  it('opens inward from the lower-right side of the board', () => {
    const placement = getBoardTooltipPlacement({
      anchorX: 380,
      anchorY: 360,
      boardWidth: 400,
      boardHeight: 380,
      cellSize: 40,
    });

    expect(placement.left).toBeLessThan(380);
    expect(placement.top).toBeLessThan(360);
    expect(placement.transform).toBe('translateX(-100%) translateY(-100%)');
  });

  it('keeps tooltip width within the board body on compact boards', () => {
    const placement = getBoardTooltipPlacement({
      anchorX: 86,
      anchorY: 18,
      boardWidth: 95,
      boardHeight: 95,
      cellSize: 10,
    });

    expect(placement.maxWidth).toBeLessThanOrEqual(95 - 16);
    expect(placement.minWidth).toBeLessThanOrEqual(placement.maxWidth);
    expect(placement.transform).toBe('translateX(-100%)');
  });
});

describe('board tooltip width', () => {
  it('fits the side it opens toward, not the whole board', () => {
    // K10 on a 19x19 board drawn 364px wide, as on a phone: the tooltip opens
    // right, where 170px remain, and must not claim the full 240px.
    const placement = getBoardTooltipPlacement({
      anchorX: 182,
      anchorY: 182,
      boardWidth: 364,
      boardHeight: 364,
      cellSize: 18.5,
    });

    expect(placement.transform).toBeUndefined();
    expect(placement.left + placement.maxWidth).toBeLessThanOrEqual(364);
  });

  it('keeps the full width where the board has room for it', () => {
    const placement = getBoardTooltipPlacement({
      anchorX: 100,
      anchorY: 100,
      boardWidth: 800,
      boardHeight: 800,
      cellSize: 40,
    });

    expect(placement.maxWidth).toBe(240);
  });
});

describe('board tooltips in the surrounding stage', () => {
  const stage = { boardWidth: 600, boardHeight: 600, cellSize: 30, boardLeft: 200, boardTop: 30,
    containerWidth: 1000, containerHeight: 700, tooltipHeight: 250 };

  it('uses the nearby left margin without covering any board intersection', () => {
    const p = getBoardTooltipPlacement({ ...stage, anchorX: 100, anchorY: 500 });
    expect(p.region).toBe('gutter');
    expect(p.transform).toBe('translateX(-100%)');
    expect(p.left).toBeLessThan(stage.boardLeft);
    expect(p.left - p.maxWidth).toBeGreaterThanOrEqual(8);
  });

  it('uses the right margin for a candidate on the right', () => {
    const p = getBoardTooltipPlacement({ ...stage, anchorX: 500, anchorY: 100 });
    expect(p.region).toBe('gutter');
    expect(p.left).toBeGreaterThan(stage.boardLeft + stage.boardWidth);
    expect(p.left + p.maxWidth).toBeLessThanOrEqual(stage.containerWidth - 8);
    expect(p.top + stage.tooltipHeight).toBeLessThanOrEqual(stage.containerHeight - 8);
  });

  it('uses the other margin when only one side has room', () => {
    const p = getBoardTooltipPlacement({ ...stage, boardLeft: 30, anchorX: 100, anchorY: 100 });
    expect(p.region).toBe('gutter');
    expect(p.left).toBeGreaterThan(630);
  });

  it('keeps the normal placement on a narrow stage and clamps measured height', () => {
    const p = getBoardTooltipPlacement({ ...stage, containerWidth: 640, containerHeight: 650,
      boardLeft: 20, anchorX: 500, anchorY: 500 });
    expect(p.region).toBe('board');
    expect(p.transform).toBe('translateX(-100%)');
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + stage.tooltipHeight).toBeLessThanOrEqual(642);
  });

  it('can retain the wider board placement when a card is too tall in a margin', () => {
    const p = getBoardTooltipPlacement({ ...stage, anchorX: 100, anchorY: 100, allowGutter: false });
    expect(p.region).toBe('board');
    expect(p.maxWidth).toBe(240);
  });
});

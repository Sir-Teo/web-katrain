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

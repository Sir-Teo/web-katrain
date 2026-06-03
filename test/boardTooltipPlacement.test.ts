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

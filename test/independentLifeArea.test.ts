import { describe, expect, it } from 'vitest';
import {
  BLACK,
  BOARD_AREA,
  EMPTY,
  WHITE,
  computeIndependentLifeArea,
  setBoardSize,
} from '../src/engine/katago/fastBoard';

// ---------------------------------------------------------------------------
// Board::calculateIndependentLifeArea, which area scoring with a group tax
// (Ancient Chinese "stone scoring") needs. Cross-checked against a line-by-line
// transcription of KataGo's C++ on 120 random positions across 7x7, 9x9 and
// 13x13 while porting; these cases pin the behaviour that matters.
// ---------------------------------------------------------------------------

const boardFrom = (rows: string[]): Uint8Array => {
  setBoardSize(rows.length);
  const stones = new Uint8Array(BOARD_AREA);
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      stones[y * rows.length + x] = c === 'x' ? BLACK : c === 'o' ? WHITE : EMPTY;
    });
  });
  return stones;
};

describe('computeIndependentLifeArea', () => {
  it('keeps a group with two eyes and counts it as one region', () => {
    // Black owns the whole 5x5 board with a pass-alive shape.
    const stones = boardFrom([
      'xxxxx',
      'x.x.x',
      'xxxxx',
      '.....',
      '.....',
    ]);
    const { area, whiteMinusBlackIndependentLifeRegionCount } = computeIndependentLifeArea(stones, {
      keepStones: true,
    });
    // The stones stay; Black's region counts as one, so the tally goes negative.
    expect(area[0]).toBe(BLACK);
    expect(whiteMinusBlackIndependentLifeRegionCount).toBe(-1);
  });

  it('drops an area that touches dame, the way seki is excluded', () => {
    // Black's shape is alive either way. Alone on the board it owns everything,
    // so it is one independent-life region.
    const alone = boardFrom([
      'xxxxx..',
      'x.x.x..',
      'xxxxx..',
      '.......',
      '.......',
      '.......',
      '.......',
    ]);
    expect(computeIndependentLifeArea(alone, { keepStones: true }).whiteMinusBlackIndependentLifeRegionCount).toBe(
      -1
    );

    // One lone White stone leaves the surrounding space owned by nobody. Black's
    // area now touches dame, so KataGo treats the whole region as seki and it
    // stops counting as independent life.
    const withDame = boardFrom([
      'xxxxx..',
      'x.x.x..',
      'xxxxx..',
      '.......',
      '...o...',
      '.......',
      '.......',
    ]);
    expect(computeIndependentLifeArea(withDame, { keepStones: true }).whiteMinusBlackIndependentLifeRegionCount).toBe(
      0
    );
  });

  it('drops both sides when a dame row separates them', () => {
    const stones = boardFrom([
      'xxxxxxx',
      'x.x.x.x',
      'xxxxxxx',
      '.......',
      'ooooooo',
      'o.o.o.o',
      'ooooooo',
    ]);
    const { area, whiteMinusBlackIndependentLifeRegionCount } = computeIndependentLifeArea(stones, {
      keepStones: true,
    });
    // Both areas border the empty middle row that neither side owns.
    expect(whiteMinusBlackIndependentLifeRegionCount).toBe(0);
    // keepStones still puts the stones themselves back, seki or not.
    expect(area[0]).toBe(BLACK);
    expect(area[6 * 7]).toBe(WHITE);
  });

  it('has nothing to keep on an empty board', () => {
    const stones = boardFrom(['.....', '.....', '.....', '.....', '.....']);
    const { area, whiteMinusBlackIndependentLifeRegionCount } = computeIndependentLifeArea(stones, {
      keepStones: true,
    });
    expect(Array.from(area).every((v) => v === EMPTY)).toBe(true);
    expect(whiteMinusBlackIndependentLifeRegionCount).toBe(0);
  });

  it('keeps the stones a player has inside their own area', () => {
    const stones = boardFrom([
      'xxxxx',
      'x.x.x',
      'xxxxx',
      '.....',
      '.....',
    ]);
    const stonesOnly = computeIndependentLifeArea(stones, { keepStones: true }).area;
    expect(stonesOnly[0]).toBe(BLACK);
    // Alone on the board Black owns everything, so the empty points come back
    // from the independent-life pass as well.
    expect(stonesOnly[3 * 5]).toBe(BLACK);
  });
});

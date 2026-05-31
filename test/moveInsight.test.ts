import { describe, expect, it } from 'vitest';
import { getMoveInsight } from '../src/utils/moveInsight';
import type { Move } from '../src/types';

const blackMove = (x: number, y: number): Move => ({ x, y, player: 'black' });

describe('move insights', () => {
  it('names standard corner points on a 19x19 board', () => {
    expect(getMoveInsight(blackMove(3, 15), 19)).toMatchObject({
      label: '4-4 star point',
      tone: 'corner',
    });
    expect(getMoveInsight(blackMove(2, 16), 19)).toMatchObject({
      label: '3-3 corner point',
      tone: 'corner',
    });
    expect(getMoveInsight(blackMove(3, 16), 19)).toMatchObject({
      label: '3-4 corner point',
      tone: 'corner',
    });
  });

  it('distinguishes center and side star points', () => {
    expect(getMoveInsight(blackMove(9, 9), 19)).toMatchObject({
      label: 'Tengen',
      tone: 'center',
    });
    expect(getMoveInsight(blackMove(3, 9), 19)).toMatchObject({
      label: 'Side star point',
      tone: 'side',
    });
  });

  it('describes side lines and pass moves', () => {
    expect(getMoveInsight(blackMove(9, 16), 19)).toMatchObject({
      label: '3rd-line side move',
      tone: 'side',
    });
    expect(getMoveInsight(blackMove(-1, -1), 19)).toMatchObject({
      label: 'Pass',
      tone: 'pass',
    });
  });

  it('returns null for root or out-of-board moves', () => {
    expect(getMoveInsight(null, 19)).toBeNull();
    expect(getMoveInsight(blackMove(19, 3), 19)).toBeNull();
  });
});

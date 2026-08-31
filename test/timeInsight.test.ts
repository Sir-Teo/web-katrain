import { describe, expect, it } from 'vitest';
import { describeTimePressure, RUSHED_FRACTION, summarizePlayerTime } from '../src/utils/timeInsight';
import type { MoveTime } from '../src/utils/moveTimes';
import type { Player } from '../src/types';

const t = (
  nodeId: string,
  moveNumber: number,
  player: Player,
  secondsSpent: number | null
): MoveTime => ({
  nodeId,
  moveNumber,
  player,
  timeLeftSeconds: null,
  periodsLeft: null,
  secondsSpent,
  inByoYomi: false,
});

/** n moves for one player at a steady pace, so the median is predictable. */
const steady = (player: Player, seconds: number[], offset = 0): MoveTime[] =>
  seconds.map((s, i) => t(`n${offset + i}`, offset + i + 1, player, s));

describe('summarizePlayerTime', () => {
  it('uses the median rather than the mean for the typical move', () => {
    // One eight-minute think among eleven quick moves. The mean would be ~46s
    // and describe nobody's actual play.
    const times = steady('black', [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 480]);
    const insight = summarizePlayerTime({
      player: 'black',
      times,
      pointsLostByNodeId: new Map(),
      mistakeThreshold: 2,
    });
    expect(insight.medianSeconds).toBe(10);
    expect(insight.measuredMoves).toBe(11);
    expect(insight.totalSeconds).toBe(580);
    expect(insight.slowest).toMatchObject({ seconds: 480 });
  });

  it('ignores moves whose time the file does not determine', () => {
    const times = [t('a', 1, 'black', 10), t('b', 2, 'black', null), t('c', 3, 'black', 20)];
    const insight = summarizePlayerTime({
      player: 'black',
      times,
      pointsLostByNodeId: new Map(),
      mistakeThreshold: 2,
    });
    expect(insight.measuredMoves).toBe(2);
    expect(insight.totalSeconds).toBe(30);
  });

  it('keeps the two players apart', () => {
    const times = [...steady('black', [10, 10, 10]), ...steady('white', [40, 40, 40], 10)];
    const black = summarizePlayerTime({ player: 'black', times, pointsLostByNodeId: new Map(), mistakeThreshold: 2 });
    const white = summarizePlayerTime({ player: 'white', times, pointsLostByNodeId: new Map(), mistakeThreshold: 2 });
    expect(black.medianSeconds).toBe(10);
    expect(white.medianSeconds).toBe(40);
  });

  it('counts a mistake as rushed only below half the median', () => {
    const times = steady('black', [20, 20, 20, 20, 20, 9, 11]);
    const insight = summarizePlayerTime({
      player: 'black',
      times,
      // n5 (9s) and n6 (11s) both lost points; the cutoff is 10s.
      pointsLostByNodeId: new Map([['n5', 6], ['n6', 6]]),
      mistakeThreshold: 2,
    });
    expect(insight.medianSeconds).toBe(20);
    expect(insight.rushedMistakes.map((m) => m.moveNumber)).toEqual([6]);
  });

  it('orders rushed mistakes by cost, not by move order', () => {
    const times = steady('black', [20, 20, 20, 20, 20, 2, 2, 2]);
    const insight = summarizePlayerTime({
      player: 'black',
      times,
      pointsLostByNodeId: new Map([['n5', 3], ['n6', 11], ['n7', 7]]),
      mistakeThreshold: 2,
    });
    expect(insight.rushedMistakes.map((m) => m.pointsLost)).toEqual([11, 7, 3]);
  });

  it('reports the median over mistakes, or null when there were none', () => {
    const times = steady('black', [10, 20, 30, 40]);
    const none = summarizePlayerTime({ player: 'black', times, pointsLostByNodeId: new Map(), mistakeThreshold: 2 });
    expect(none.medianOnMistakes).toBeNull();
    const some = summarizePlayerTime({
      player: 'black',
      times,
      pointsLostByNodeId: new Map([['n0', 5], ['n2', 5]]),
      mistakeThreshold: 2,
    });
    expect(some.medianOnMistakes).toBe(20); // median of 10 and 30
  });

  it('handles a player with no measured moves at all', () => {
    const insight = summarizePlayerTime({
      player: 'white',
      times: steady('black', [10, 10]),
      pointsLostByNodeId: new Map(),
      mistakeThreshold: 2,
    });
    expect(insight).toMatchObject({ measuredMoves: 0, totalSeconds: 0, medianSeconds: 0, slowest: null });
    expect(insight.rushedMistakes).toEqual([]);
  });
});

describe('describeTimePressure', () => {
  const rushedInsight = () =>
    summarizePlayerTime({
      player: 'black',
      times: steady('black', [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 4, 5]),
      pointsLostByNodeId: new Map([['n10', 9.4], ['n11', 3]]),
      mistakeThreshold: 2,
    });

  it('names the count, the cutoff, the typical move and the worst case', () => {
    expect(describeTimePressure(rushedInsight())).toBe(
      "2 mistakes were played in under 15s, well below this player's 30s typical move. " +
        'The costliest was move 11, 9.4 points in 4s.'
    );
  });

  it('says nothing when there is not enough measured play to mean anything', () => {
    const thin = summarizePlayerTime({
      player: 'black',
      times: steady('black', [30, 2]),
      pointsLostByNodeId: new Map([['n1', 9]]),
      mistakeThreshold: 2,
    });
    expect(describeTimePressure(thin)).toBeNull();
  });

  it('says nothing when no mistake was rushed', () => {
    const calm = summarizePlayerTime({
      player: 'black',
      times: steady('black', [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]),
      pointsLostByNodeId: new Map([['n10', 9]]),
      mistakeThreshold: 2,
    });
    expect(describeTimePressure(calm)).toBeNull();
  });

  it('agrees with the exported cutoff fraction', () => {
    const insight = rushedInsight();
    expect(insight.medianSeconds * RUSHED_FRACTION).toBe(15);
  });
});

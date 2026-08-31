import { describe, expect, it } from 'vitest';
import {
  computeMoveTimes,
  formatMoveTime,
  hasMoveTimeData,
  parseByoYomi,
  parseMainTimeSeconds,
} from '../src/utils/moveTimes';
import type { GameNode, Player } from '../src/types';

type NodeSpec = { player: Player; props?: Record<string, string[]> };

const line = (specs: NodeSpec[]): GameNode[] =>
  specs.map((spec, index) => ({
    id: `n${index}`,
    move: { x: index % 19, y: 0, player: spec.player },
    properties: spec.props ?? {},
  }) as unknown as GameNode);

describe('parseMainTimeSeconds', () => {
  it('reads TM', () => {
    expect(parseMainTimeSeconds({ TM: ['1800'] })).toBe(1800);
    expect(parseMainTimeSeconds({ TM: ['0'] })).toBe(0);
  });

  it('rejects absent and nonsense values', () => {
    expect(parseMainTimeSeconds(undefined)).toBeNull();
    expect(parseMainTimeSeconds({})).toBeNull();
    expect(parseMainTimeSeconds({ TM: ['soon'] })).toBeNull();
    expect(parseMainTimeSeconds({ TM: ['-5'] })).toBeNull();
  });
});

describe('parseByoYomi', () => {
  it('reads the NxM byo-yomi form the common servers write', () => {
    expect(parseByoYomi({ OT: ['5x30 byo-yomi'] })).toEqual({ periods: 5, periodSeconds: 30 });
    expect(parseByoYomi({ OT: ['3 x 60 byo-yomi'] })).toEqual({ periods: 3, periodSeconds: 60 });
  });

  it('leaves clocks it does not model alone', () => {
    // Canadian overtime is "stones per period", not periods of seconds, and
    // Fischer adds increment rather than counting periods down.
    expect(parseByoYomi({ OT: ['25/300 Canadian'] })).toBeNull();
    expect(parseByoYomi({ OT: ['30 fischer'] })).toBeNull();
    expect(parseByoYomi({ OT: [''] })).toBeNull();
    expect(parseByoYomi(undefined)).toBeNull();
  });
});

describe('computeMoveTimes', () => {
  it('derives thinking time from successive clock readings', () => {
    const times = computeMoveTimes(
      line([
        { player: 'black', props: { BL: ['1750'] } },
        { player: 'white', props: { WL: ['1790'] } },
        { player: 'black', props: { BL: ['1600'] } },
        { player: 'white', props: { WL: ['1700'] } },
      ]),
      { TM: ['1800'] }
    );
    expect(times.map((t) => t.secondsSpent)).toEqual([50, 10, 150, 90]);
    expect(times.map((t) => t.moveNumber)).toEqual([1, 2, 3, 4]);
    expect(times.every((t) => !t.inByoYomi)).toBe(true);
  });

  it('cannot derive the first move without a main time to subtract from', () => {
    const times = computeMoveTimes(line([{ player: 'black', props: { BL: ['1750'] } }]));
    expect(times[0]!.secondsSpent).toBeNull();
    expect(times[0]!.timeLeftSeconds).toBe(1750);
  });

  it('still derives later moves once two readings exist', () => {
    const times = computeMoveTimes(
      line([
        { player: 'black', props: { BL: ['1750'] } },
        { player: 'white', props: { WL: ['1700'] } },
        { player: 'black', props: { BL: ['1690'] } },
      ])
    );
    expect(times.map((t) => t.secondsSpent)).toEqual([null, null, 60]);
  });

  it('reports byo-yomi period renewal as unknown rather than zero', () => {
    // The clock reading goes back up when a period renews; the seconds actually
    // spent inside the period are discarded by the renewal.
    const times = computeMoveTimes(
      line([
        { player: 'black', props: { BL: ['12'], OB: ['5'] } },
        { player: 'black', props: { BL: ['30'], OB: ['5'] } },
      ]),
      { TM: ['1800'], OT: ['5x30 byo-yomi'] }
    );
    expect(times[1]!.secondsSpent).toBeNull();
    expect(times[1]!.inByoYomi).toBe(true);
  });

  it('reports a crossed period boundary as unknown', () => {
    const times = computeMoveTimes(
      line([
        { player: 'black', props: { BL: ['20'], OB: ['5'] } },
        { player: 'black', props: { BL: ['28'], OB: ['4'] } },
      ]),
      { TM: ['1800'], OT: ['5x30 byo-yomi'] }
    );
    expect(times[1]!.secondsSpent).toBeNull();
    expect(times[1]!.periodsLeft).toBe(4);
  });

  it('tracks the two players independently', () => {
    const times = computeMoveTimes(
      line([
        { player: 'black', props: { BL: ['500'] } },
        { player: 'white', props: { WL: ['100'] } },
        { player: 'black', props: { BL: ['480'] } },
      ]),
      { TM: ['600'] }
    );
    expect(times.map((t) => t.secondsSpent)).toEqual([100, 500, 20]);
  });

  it('skips nodes without a move and numbers the rest in order', () => {
    const nodes = line([{ player: 'black', props: { BL: ['10'] } }]);
    const withRoot = [{ id: 'root', move: null, properties: {} } as unknown as GameNode, ...nodes];
    expect(computeMoveTimes(withRoot).map((t) => t.moveNumber)).toEqual([1]);
  });

  it('returns nothing usable for a game with no clock data', () => {
    const times = computeMoveTimes(line([{ player: 'black' }, { player: 'white' }]), { TM: ['1800'] });
    expect(times).toHaveLength(2);
    expect(hasMoveTimeData(times)).toBe(false);
  });

  it('reports data as present once one move is derivable', () => {
    const times = computeMoveTimes(
      line([{ player: 'black', props: { BL: ['1750'] } }]),
      { TM: ['1800'] }
    );
    expect(hasMoveTimeData(times)).toBe(true);
  });
});

describe('formatMoveTime', () => {
  it('formats below and above a minute', () => {
    expect(formatMoveTime(0)).toBe('0s');
    expect(formatMoveTime(8.4)).toBe('8s');
    expect(formatMoveTime(59)).toBe('59s');
    expect(formatMoveTime(60)).toBe('1:00');
    expect(formatMoveTime(64)).toBe('1:04');
    expect(formatMoveTime(750)).toBe('12:30');
  });
});

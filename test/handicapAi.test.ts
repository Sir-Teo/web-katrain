import { describe, expect, it } from 'vitest';
import {
  HANDICAP_PDA_LIMIT,
  automaticHandicapPda,
  clampHandicapPda,
  countRootHandicapStones,
  describeHandicapPda,
  handicapPlayoutDoublingAdvantage,
} from '../src/utils/handicapAi';
import type { GameNode } from '../src/types';

const rootWith = (ab?: string[], extra?: Record<string, string[]>): GameNode =>
  ({
    id: 'root',
    parent: null,
    children: [],
    move: null,
    properties: ab || extra ? { ...(ab ? { AB: ab } : {}), ...extra } : undefined,
  }) as unknown as GameNode;

describe('automaticHandicapPda', () => {
  // Reference values produced by KaTrain's own HandicapStrategy formula.
  it.each([
    [0, 6.5, -0.013393],
    [0, 0.5, -0.174107],
    [2, 0.5, -0.549107],
    [4, 0.5, -1.299107],
    [6, 0.5, -2.049107],
  ])('matches KaTrain for %i stones at komi %f', (stones, komi, expected) => {
    expect(automaticHandicapPda({ handicapStones: stones, komi })).toBeCloseTo(expected, 6);
  });

  it('saturates at KataGo\'s limit for very large handicaps', () => {
    expect(automaticHandicapPda({ handicapStones: 9, komi: 0.5 })).toBe(-HANDICAP_PDA_LIMIT);
    expect(automaticHandicapPda({ handicapStones: 20, komi: 0.5 })).toBe(-HANDICAP_PDA_LIMIT);
  });

  it('flips sign when komi alone leaves White ahead', () => {
    expect(automaticHandicapPda({ handicapStones: 0, komi: 40 })).toBeCloseTo(0.883929, 6);
  });
});

describe('clampHandicapPda', () => {
  it('keeps values inside KataGo\'s range', () => {
    expect(clampHandicapPda(1.5)).toBe(1.5);
    expect(clampHandicapPda(9)).toBe(HANDICAP_PDA_LIMIT);
    expect(clampHandicapPda(-9)).toBe(-HANDICAP_PDA_LIMIT);
    expect(clampHandicapPda(Number.NaN)).toBe(0);
  });
});

describe('countRootHandicapStones', () => {
  it('counts the root setup stones', () => {
    expect(countRootHandicapStones(rootWith(['dd', 'pp', 'dp']))).toBe(3);
    expect(countRootHandicapStones(rootWith())).toBe(0);
  });

  it('takes the file at its word when it declares a handicap', () => {
    // The stones may not be in AB at all -- loadGame places them itself from
    // HA -- so a declared handicap has to win over whatever setup is present.
    expect(countRootHandicapStones(rootWith(undefined, { HA: ['4'] }))).toBe(4);
    expect(countRootHandicapStones(rootWith(['dd'], { HA: ['0'] }))).toBe(0);
    expect(countRootHandicapStones(rootWith(['dd', 'pp'], { HA: ['not a number'] }))).toBe(2);
  });

  it('does not read an arranged position as a handicap', () => {
    // A tsumego, a pasted diagram and a framed problem all arrive as AB plus
    // AW. Counting the black stones put an "H8" on life-and-death problems and
    // gave the handicap AI a search bias for a game nobody was giving stones
    // in. White setup stones are the tell: a handicap places black and nothing
    // else.
    expect(countRootHandicapStones(rootWith(['aa', 'bb', 'cc'], { AW: ['ab'] }))).toBe(0);

    // The screenshot that found this: one black and three white setup stones,
    // shown in the game header as "H1".
    expect(countRootHandicapStones(rootWith(['aa'], { AW: ['ab', 'ca', 'bb'] }))).toBe(0);

    // But an undeclared handicap game -- black stones alone -- still counts.
    expect(countRootHandicapStones(rootWith(['dd', 'pd', 'dp', 'pp']))).toBe(4);
  });

  it('does not call a single black stone a handicap', () => {
    // There is no such thing as a one-stone handicap; a lone AB stone is a
    // position someone set up.
    expect(countRootHandicapStones(rootWith(['dd']))).toBe(0);
  });
});

describe('handicapPlayoutDoublingAdvantage', () => {
  it('derives the value from the game when automatic', () => {
    expect(
      handicapPlayoutDoublingAdvantage({ automatic: true, manualPda: 2, handicapStones: 4, komi: 0.5 })
    ).toBeCloseTo(-1.299107, 6);
  });

  it('uses the manual value when not automatic', () => {
    expect(
      handicapPlayoutDoublingAdvantage({ automatic: false, manualPda: 2, handicapStones: 4, komi: 0.5 })
    ).toBe(2);
    expect(
      handicapPlayoutDoublingAdvantage({ automatic: false, manualPda: 99, handicapStones: 0, komi: 6.5 })
    ).toBe(HANDICAP_PDA_LIMIT);
  });
});

describe('describeHandicapPda', () => {
  it('names the side the advantage helps', () => {
    expect(describeHandicapPda(-1.3)).toContain('White');
    expect(describeHandicapPda(1.3)).toContain('Black');
    expect(describeHandicapPda(0)).toContain('normal game');
  });
});

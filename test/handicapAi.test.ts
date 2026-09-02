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

const rootWith = (ab?: string[]): GameNode =>
  ({ id: 'root', parent: null, children: [], move: null, properties: ab ? { AB: ab } : undefined } as unknown as GameNode);

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

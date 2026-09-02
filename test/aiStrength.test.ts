import { describe, expect, it } from 'vitest';
import { describeAiStrength, estimateAiRank, formatRankLabel } from '../src/utils/aiStrength';
import { useGameStore } from '../src/store/gameStore';
import type { GameSettings } from '../src/types';

const baseSettings = (): GameSettings => ({ ...useGameStore.getState().settings });

const withSettings = (patch: Partial<GameSettings>): GameSettings => ({ ...baseSettings(), ...patch });

describe('estimateAiRank', () => {
  // Reference values produced by KaTrain's own ai_rank_estimation tables.
  it.each([
    ['weighted', { aiWeightedWeakenFac: 1.25 }, -0.448979],
    ['weighted', { aiWeightedWeakenFac: 2.0 }, -7.712112],
    ['scoreloss', { aiScoreLossStrength: 0.2 }, -0.561792],
    ['scoreloss', { aiScoreLossStrength: 0.5 }, 3.3763],
    ['pick', { aiPickPickFrac: 0.35, aiPickPickN: 5 }, -4.248677],
    ['local', { aiLocalPickFrac: 0.0, aiLocalPickN: 15 }, -1.49518],
    ['tenuki', { aiTenukiPickFrac: 0.4, aiTenukiPickN: 5 }, -1.534072],
    ['territory', { aiTerritoryPickFrac: 0.3, aiTerritoryPickN: 5 }, -1.184051],
    ['influence', { aiInfluencePickFrac: 0.3, aiInfluencePickN: 5 }, -0.670687],
  ] as const)('matches KaTrain for %s %o', (strategy, patch, expected) => {
    const estimate = estimateAiRank(strategy as GameSettings['aiStrategy'], withSettings(patch));
    expect(estimate.rank).toBeCloseTo(expected, 5);
    expect(estimate.calibrated).toBe(true);
  });

  it('reads the calibrated rank bot straight off its setting', () => {
    expect(estimateAiRank('rank', withSettings({ aiRankKyu: 4 })).rank).toBe(-3);
    expect(estimateAiRank('rank', withSettings({ aiRankKyu: 0 })).rank).toBe(1);
  });

  it('reports the full-strength strategies as uncalibrated', () => {
    for (const strategy of ['default', 'handicap', 'antimirror'] as const) {
      const estimate = estimateAiRank(strategy, baseSettings());
      expect(estimate.rank).toBe(9);
      expect(estimate.calibrated).toBe(false);
      expect(estimate.label).toBe('9d');
    }
    expect(estimateAiRank('policy', baseSettings()).label).toBe('5d');
    expect(estimateAiRank('simple', baseSettings()).label).toBe('2d');
  });

  it('has nothing to say about the jigo bot', () => {
    const estimate = estimateAiRank('jigo', baseSettings());
    expect(estimate.rank).toBeNull();
    expect(estimate.label).toBeNull();
  });
});

describe('formatRankLabel', () => {
  // KaTrain rank_label: >= 0.5 is dan, otherwise 1 - rank kyu.
  it.each([
    [9, '9d'],
    [1, '1d'],
    [0.5, '1d'],
    [0, '1k'],
    [-3, '4k'],
    [-0.448979, '1k'],
    [-7.712112, '9k'],
  ])('formats %f as %s', (rank, label) => {
    expect(formatRankLabel(rank)).toBe(label);
  });

  it('has no label without a rank', () => {
    expect(formatRankLabel(null)).toBeNull();
    expect(formatRankLabel(Number.NaN)).toBeNull();
  });
});

describe('describeAiStrength', () => {
  it('says whether the number is measured or fixed', () => {
    expect(describeAiStrength(estimateAiRank('rank', withSettings({ aiRankKyu: 4 })))).toContain('about 4k');
    expect(describeAiStrength(estimateAiRank('default', baseSettings()))).toContain('full strength');
    expect(describeAiStrength(estimateAiRank('jigo', baseSettings()))).toContain('No calibrated strength');
  });
});

describe('human-net bot strength', () => {
  it('names the profile it imitates instead of a search calibration', () => {
    const estimate = estimateAiRank('human', withSettings({ humanSlProfile: 'rank_5k' }));
    expect(estimate.label).toBe('5 kyu');
    expect(estimate.calibrated).toBe(false);
    expect(describeAiStrength(estimate)).toBe("Plays like a 5 kyu player, from KataGo's human network.");
  });
});

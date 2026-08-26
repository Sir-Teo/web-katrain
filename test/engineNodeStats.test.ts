import { describe, expect, it } from 'vitest';
import { computeWeightFromEval, recomputeNodeStatsForTest } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';

// ---------------------------------------------------------------------------
// Node statistics.
//
// KataGo does not accumulate a node's numbers as a running sum: after every
// playout it rebuilds them from its children (recomputeNodeStats), reweighting
// the children first by noise pruning and then by how bad they look next to
// their siblings, and finally mixing in the node's own network evaluation.
// A visit's weight is 1 unless the net predicts its own shortterm error, in
// which case an uncertain evaluation counts for less (useUncertainty).
// ---------------------------------------------------------------------------

const child = (over: Partial<Parameters<typeof recomputeNodeStatsForTest>[0]['children'][number]> = {}) => ({
  prior: 0.25,
  visits: 10,
  value: 0.2,
  scoreLead: 3,
  scoreMean: 3,
  scoreMeanSq: 9,
  utility: 0.25,
  ...over,
});

describe('node stat aggregation', () => {
  it('mixes the children and the node\'s own evaluation by weight', () => {
    setBoardSize(9);
    const result = recomputeNodeStatsForTest({
      playerToMove: 'black',
      own: { value: 0, scoreLead: 0, scoreMean: 0, scoreMeanSq: 0, utility: 0 },
      children: [child(), child()],
    });
    // Two children of weight 10 plus the node's own weight 1.
    expect(result.weightSum).toBeCloseTo(21, 9);
    // Identical children, so the only pull away from their value is the own eval.
    expect(result.valueAvg).toBeCloseTo((20 * 0.2) / 21, 9);
    expect(result.scoreLeadAvg).toBeCloseTo((20 * 3) / 21, 9);
    expect(result.utilityAvg).toBeCloseTo((20 * 0.25) / 21, 9);
  });

  it('leaves a childless node reporting exactly its own evaluation', () => {
    setBoardSize(9);
    const result = recomputeNodeStatsForTest({
      playerToMove: 'white',
      own: { value: -0.4, scoreLead: -6, scoreMean: -6, scoreMeanSq: 40, utility: -0.5 },
      children: [],
    });
    expect(result.weightSum).toBe(1);
    expect(result.valueAvg).toBeCloseTo(-0.4, 12);
    expect(result.scoreLeadAvg).toBeCloseTo(-6, 12);
    expect(result.utilityAvg).toBeCloseTo(-0.5, 12);
    expect(result.utilitySqAvg).toBeCloseTo(0.25, 12);
  });

  it('downweights a child that is much worse than its siblings', () => {
    setBoardSize(9);
    const good = child({ value: 0.5, utility: 0.5, scoreLead: 8, scoreMean: 8, scoreMeanSq: 64, visits: 40 });
    const bad = child({ value: -0.9, utility: -0.9, scoreLead: -12, scoreMean: -12, scoreMeanSq: 144, visits: 40 });

    const mixed = recomputeNodeStatsForTest({
      playerToMove: 'black',
      own: { value: 0.4, scoreLead: 7, scoreMean: 7, scoreMeanSq: 49, utility: 0.45 },
      children: [good, bad],
    });
    const plainMean = (40 * 0.5 + 40 * -0.9 + 1 * 0.4) / 81;
    // Black to move, so the bad child should carry less than its share of the weight
    // and the reported value should sit above the flat average.
    expect(mixed.valueAvg).toBeGreaterThan(plainMean);
  });

  it('prunes weight that the policy prior cannot justify', () => {
    setBoardSize(9);
    // A low-prior child that somehow holds a big share of the weight and is worse:
    // KataGo's noise pruning takes some of that weight back.
    const strong = child({ prior: 0.9, visits: 30, value: 0.3, utility: 0.3 });
    const suspicious = child({ prior: 0.001, visits: 30, value: -0.3, utility: -0.3 });
    const result = recomputeNodeStatsForTest({
      playerToMove: 'black',
      own: { value: 0.3, scoreLead: 4, scoreMean: 4, scoreMeanSq: 16, utility: 0.3 },
      children: [strong, suspicious],
    });
    expect(result.weightSum).toBeLessThan(61); // some child weight was pruned away
    expect(result.valueAvg).toBeGreaterThan(0);
  });
});

describe('uncertainty weighting', () => {
  const baseArgs = { blackScoreMean: 0, recentScoreCenter: 0 };

  it('keeps every visit at weight 1 for nets without the shortterm heads', () => {
    setBoardSize(19);
    expect(
      computeWeightFromEval({ ...baseArgs, shorttermWinlossError: -1, shorttermScoreError: -1 })
    ).toBe(1);
  });

  it('matches KataGo computeWeightFromNNOutput when the net predicts its error', () => {
    setBoardSize(19);
    // Transcription of the C++ for this case: coeff 0.25, exponent 1, max weight 8.
    const sqrtArea = 19;
    const twoOverPi = 2 / Math.PI;
    const dScore = (scale: number, center: number) => {
      const scaleFactor = scale * sqrtArea;
      const adjusted = 0 - center;
      return (scaleFactor / (scaleFactor * scaleFactor + adjusted * adjusted)) * twoOverPi;
    };
    const derivative = dScore(2.0, 0) * 0.1 + dScore(0.75, 0) * 0.3;
    const uncertainty = 1.0 * 0.2 + derivative * 4;
    const expected = 0.25 / (uncertainty + 0.25 / 8);

    const weight = computeWeightFromEval({
      ...baseArgs,
      shorttermWinlossError: 0.2,
      shorttermScoreError: 4,
    });
    expect(weight).toBeCloseTo(expected, 12);
  });

  it('gives a confident evaluation more weight than an uncertain one', () => {
    setBoardSize(19);
    const confident = computeWeightFromEval({ ...baseArgs, shorttermWinlossError: 0.02, shorttermScoreError: 0.5 });
    const uncertain = computeWeightFromEval({ ...baseArgs, shorttermWinlossError: 0.3, shorttermScoreError: 8 });
    expect(confident).toBeGreaterThan(uncertain);
    expect(confident).toBeLessThanOrEqual(8); // uncertaintyMaxWeight
    expect(uncertain).toBeGreaterThan(0);
  });
});

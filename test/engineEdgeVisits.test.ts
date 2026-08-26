import { describe, expect, it } from 'vitest';
import {
  MctsSearch,
  computePlaySelectionValuesForTest,
  recomputeNodeStatsForTest,
} from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, hasModel, loadHarnessModel } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// Edge visits (cpp/search/searchnode.h, NodeStats::childWeight).
//
// A parent owns only the fraction of a child's weight that its own edge visits
// paid for. The two counts are equal in an ordinary tree, and come apart when
// KataGo spends a weightless playout: the child gets evaluated, but the parent
// is not charged for it and does not take the value on board until a later
// playout pays the edge back (Search::maybeCatchUpEdgeVisits).
// ---------------------------------------------------------------------------

const own = { value: 0.5, scoreLead: 0, scoreMean: 0, scoreMeanSq: 0, utility: 0, weight: 1 };
const oneChild = (edgeVisits?: number) =>
  recomputeNodeStatsForTest({
    playerToMove: 'black',
    own,
    children: [
      { prior: 0.9, visits: 10, edgeVisits, value: -1, scoreLead: 0, scoreMean: 0, scoreMeanSq: 0, utility: 0 },
    ],
  });

describe('edge visits', () => {
  it('gives the parent only the share of the child its edge paid for', () => {
    // Ten child visits plus the node's own evaluation.
    const paid = oneChild();
    expect(paid.weightSum).toBeCloseTo(11, 10);
    expect(paid.valueAvg).toBeCloseTo((10 * -1 + 1 * 0.5) / 11, 10);

    // Half the visits went unpaid, so half the child's weight does not count and
    // the node's own evaluation carries proportionally more.
    const halfPaid = oneChild(5);
    expect(halfPaid.weightSum).toBeCloseTo(6, 10);
    expect(halfPaid.valueAvg).toBeCloseTo((5 * -1 + 1 * 0.5) / 6, 10);
    // The squared weight is scaled by the same factor, squared.
    expect(halfPaid.weightSqSum).toBeCloseTo(0.5 * 0.5 * 10 + 1, 10);
  });

  it('ignores a child no edge visit has reached yet', () => {
    const seeded = oneChild(0);
    expect(seeded.weightSum).toBeCloseTo(1, 10);
    expect(seeded.valueAvg).toBeCloseTo(0.5, 10);
  });

  it('scales play selection values by the edge visits too', () => {
    const values = (edgeVisits?: number) =>
      computePlaySelectionValuesForTest({
        playerToMove: 'black',
        parentVisits: 30,
        parentUtilitySum: 0,
        parentUtilitySqSum: 0,
        isRoot: false,
        children: [
          { prior: 0.5, visits: 20, edgeVisits, utilitySum: 0, utilitySqSum: 0 },
          { prior: 0.5, visits: 10, utilitySum: 0, utilitySqSum: 0 },
        ],
      })!.values;

    // Fully paid for, the twenty-visit move leads.
    expect(values()[0]!).toBeGreaterThan(values()[1]!);
    // With only five of those visits paid for it falls behind, at exactly the
    // weight its edge bought.
    expect(values(5)[0]!).toBeCloseTo(5, 10);
    expect(values(5)[0]!).toBeLessThan(values(5)[1]!);
    // Unpaid entirely, it is not a candidate at all.
    expect(values(0)[0]!).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// enableMorePassingHacks, which KataGo turns on for the analysis and GTP setups.
// ---------------------------------------------------------------------------

describe.skipIf(!hasModel())('more passing hacks', () => {
  const searchAfter = async (lastMove: { x: number; y: number; player: 'black' | 'white' }) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const board = emptyBoard(9);
    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: [lastMove],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 30,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 16, maxTimeMs: 120000, batchSize: 2 });
    return search.getAnalysis({ topK: 40, analysisPvLen: 1 });
  };

  it('looks at passing once a pass would end the game', async () => {
    // White passed, so black's pass would end the game. The policy has almost no
    // interest in passing on an empty board, so only the hack gets it looked at.
    const analysis = await searchAfter({ x: -1, y: -1, player: 'white' });
    expect(analysis.moves.some((m) => m.x < 0 && m.y < 0)).toBe(true);
  }, 120000);

  it('leaves passing alone when it would not end the game', async () => {
    const analysis = await searchAfter({ x: 4, y: 4, player: 'white' });
    expect(analysis.moves.some((m) => m.x < 0 && m.y < 0)).toBe(false);
  }, 120000);
});

import { describe, expect, it } from 'vitest';
import { boardFromDiagram, hasModel, loadHarnessModel } from './helpers/engineHarness';
import { MctsSearch, computePlaySelectionValuesForTest } from '../src/engine/katago/analyzeMcts';
import { BOARD_SIZE, setBoardSize } from '../src/engine/katago/fastBoard';

// ---------------------------------------------------------------------------
// Play selection values and LCB.
//
// KataGo does not pick or rank moves by raw visit count: Search::getPlaySelectionValues
// (cpp/search/searchresults.cpp) starts from child weight, takes weight back off
// children that got more visits than the final explore values justify, and then
// hands the best-LCB move enough weight to beat everyone else. The analysis output
// is ordered by that value, and the PV follows it at every depth.
//
// The reference numbers below are transcribed from the C++ rather than captured
// from our own output, so a drift in our port shows up as a failure here.
// ---------------------------------------------------------------------------

// KataGo defaults for the analysis/GTP setups (cpp/program/setup.cpp).
const LCB_STDEVS = 5.0;
const UTILITY_RANGE_RADIUS = 1.0 + 0.1 + 0.3; // winLoss + staticScore + dynamicScore

/** Transcription of Search::getSelfUtilityLCBAndRadius, with unit weight per visit. */
function referenceLcbAndRadius(args: {
  visits: number;
  utilityAvg: number;
  utilitySqAvg: number;
  blackToMove: boolean;
}): { lcb: number; radius: number } {
  const zeroRadius = 2.0 * UTILITY_RANGE_RADIUS * LCB_STDEVS;
  if (args.visits <= 0) return { lcb: -zeroRadius, radius: zeroRadius };

  let weightSum = args.visits;
  let weightSqSum = args.visits;
  let ess = (weightSum * weightSum) / weightSqSum;

  let utilitySqAvg = Math.max(args.utilitySqAvg, args.utilityAvg * args.utilityAvg + 1e-8);
  const priorWeight = weightSum / (ess * ess * ess);
  utilitySqAvg =
    (utilitySqAvg * weightSum + (utilitySqAvg + UTILITY_RANGE_RADIUS * UTILITY_RANGE_RADIUS) * priorWeight) /
    (weightSum + priorWeight);
  weightSum += priorWeight;
  weightSqSum += priorWeight * priorWeight;
  ess = (weightSum * weightSum) / weightSqSum;

  const selfUtility = args.blackToMove ? args.utilityAvg : -args.utilityAvg;
  const variance = utilitySqAvg - args.utilityAvg * args.utilityAvg;
  const radius = Math.sqrt(Math.max(0, variance / ess)) * LCB_STDEVS;
  return { lcb: selfUtility - radius, radius };
}

const child = (visits: number, utility: number, utilityVariance: number, prior: number) => ({
  prior,
  visits,
  utilitySum: utility * visits,
  utilitySqSum: (utility * utility + utilityVariance) * visits,
});

describe('play selection values', () => {
  it('matches KataGo getSelfUtilityLCBAndRadius across visit counts', () => {
    const cases = [
      { visits: 1, utility: 0.2, variance: 0.04 },
      { visits: 3, utility: -0.1, variance: 0.01 },
      { visits: 25, utility: 0.35, variance: 0.09 },
      { visits: 400, utility: 0.02, variance: 0.0004 },
    ];
    for (const blackToMove of [true, false]) {
      const result = computePlaySelectionValuesForTest({
        playerToMove: blackToMove ? 'black' : 'white',
        parentVisits: cases.reduce((n, c) => n + c.visits, 0),
        parentUtilitySum: 0,
        parentUtilitySqSum: 0,
        isRoot: false,
        children: cases.map((c) => child(c.visits, c.utility, c.variance, 0.1)),
      });
      expect(result).not.toBeNull();
      cases.forEach((c, i) => {
        const expected = referenceLcbAndRadius({
          visits: c.visits,
          utilityAvg: c.utility,
          utilitySqAvg: c.utility * c.utility + c.variance,
          blackToMove,
        });
        expect(result!.radius[i]!).toBeCloseTo(expected.radius, 12);
        expect(result!.lcb[i]!).toBeCloseTo(expected.lcb, 12);
      });
    }
  });

  it('gives unvisited children the widest possible radius', () => {
    const result = computePlaySelectionValuesForTest({
      playerToMove: 'black',
      parentVisits: 10,
      parentUtilitySum: 1,
      parentUtilitySqSum: 0.2,
      isRoot: false,
      children: [child(10, 0.1, 0.01, 0.5), child(0, 0, 0, 0.5)],
    });
    const zeroRadius = 2.0 * UTILITY_RANGE_RADIUS * LCB_STDEVS;
    expect(result!.values[1]).toBe(0);
    expect(result!.radius[1]).toBeCloseTo(zeroRadius, 12);
    expect(result!.lcb[1]).toBeCloseTo(-zeroRadius, 12);
  });

  it('promotes a less-visited move whose value is better and tighter', () => {
    // A has more visits but a mediocre, noisy value; B is better and much more
    // certain. KataGo's LCB bonus is exactly what lets B win the ranking.
    const result = computePlaySelectionValuesForTest({
      playerToMove: 'black',
      parentVisits: 200,
      parentUtilitySum: 20,
      parentUtilitySqSum: 6,
      isRoot: false,
      children: [child(120, 0.05, 0.09, 0.4), child(70, 0.25, 0.0004, 0.4)],
    });
    expect(result!.values[0]).toBe(120);
    expect(result!.values[1]!).toBeGreaterThan(result!.values[0]!);
    // The bonus is capped at a factor of 5 in weight terms (radiusFactor <= 5).
    expect(result!.values[1]!).toBeLessThanOrEqual(70 * 25);
  });

  it('leaves the ranking alone when the most-visited move is also the safest', () => {
    const result = computePlaySelectionValuesForTest({
      playerToMove: 'white',
      parentVisits: 200,
      parentUtilitySum: -10,
      parentUtilitySqSum: 4,
      isRoot: false,
      children: [child(150, -0.3, 0.0004, 0.6), child(50, 0.1, 0.09, 0.2)],
    });
    // White to move, so more negative black-perspective utility is better for the mover.
    expect(result!.values[0]!).toBeGreaterThan(result!.values[1]!);
  });

  it('takes weight back from over-visited root children', () => {
    // At the root KataGo replaces each non-best child's weight with the weight the
    // final explore selection values would have given it, which can only shrink it.
    const children = [child(300, 0.3, 0.01, 0.6), child(200, -0.2, 0.01, 0.05)];
    const result = computePlaySelectionValuesForTest({
      playerToMove: 'black',
      parentVisits: 500,
      parentUtilitySum: 100,
      parentUtilitySqSum: 40,
      parentNnUtility: 0.2,
      isRoot: true,
      children,
    });
    expect(result!.values[1]!).toBeLessThan(200);
    const notRoot = computePlaySelectionValuesForTest({
      playerToMove: 'black',
      parentVisits: 500,
      parentUtilitySum: 100,
      parentUtilitySqSum: 40,
      parentNnUtility: 0.2,
      isRoot: false,
      children,
    });
    expect(notRoot!.values[1]).toBe(200);
  });
});

const MID9 = `
  .........
  ..X.O....
  ...X.O...
  .X..O....
  ....X.O..
  ..O.X....
  ...O.X...
  .........
  .........
`;

describe.skipIf(!hasModel())('analysis output ordering', () => {
  it('orders moves by play selection value and reports a consistent pv', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(MID9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 80, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 8, analysisPvLen: 6 });

    expect(analysis.moves.length).toBeGreaterThan(1);
    analysis.moves.forEach((m, i) => {
      expect(m.order).toBe(i);
      if (i > 0) {
        const prev = analysis.moves[i - 1]!;
        expect(prev.playSelectionValue).toBeGreaterThanOrEqual(m.playSelectionValue);
      }
      // Black to move: the lower confidence bound sits below the mean winrate.
      expect(m.lcb).toBeLessThanOrEqual(m.winRate);
      expect(m.pvVisits.length).toBe(m.pv.length);
      expect(m.pvVisits[0]).toBe(m.visits);
      for (let d = 1; d < m.pvVisits.length; d++) {
        expect(m.pvVisits[d]!).toBeLessThanOrEqual(m.pvVisits[d - 1]!);
        expect(m.pvVisits[d]!).toBeGreaterThan(0);
      }
    });
  }, 120000);

  it('reports lcb above the winrate when white is to move', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(MID9),
      currentPlayer: 'white',
      moveHistory: [],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 60, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 5, analysisPvLen: 4 });
    for (const m of analysis.moves) {
      // Reported in black's frame, so white's lower bound is an upper bound here.
      expect(m.lcb).toBeGreaterThanOrEqual(m.winRate);
    }
  }, 120000);
});

describe.skipIf(!hasModel())('avoiding moves at the root', () => {
  it('never plays a move the request took off the table', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const board = boardFromDiagram(MID9);

    const plain = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await plain.run({ visits: 60, maxTimeMs: 120000, batchSize: 4 });
    const top = plain.getAnalysis({ topK: 3, analysisPvLen: 1 }).moves[0]!;
    expect(top.x).toBeGreaterThanOrEqual(0);

    const avoid = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    avoid[top.y * BOARD_SIZE + top.x] = 1;
    const restricted = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
      avoidRootMoves: avoid,
    });
    await restricted.run({ visits: 60, maxTimeMs: 120000, batchSize: 4 });
    const analysis = restricted.getAnalysis({ topK: 20, analysisPvLen: 1 });

    expect(analysis.moves.length).toBeGreaterThan(0);
    for (const move of analysis.moves) {
      expect(`${move.x},${move.y}`).not.toBe(`${top.x},${top.y}`);
    }
    // The policy overlay still shows the whole board; only the search is restricted.
    expect(analysis.policy[top.y * BOARD_SIZE + top.x]!).toBeGreaterThan(0);
  }, 300000);
});

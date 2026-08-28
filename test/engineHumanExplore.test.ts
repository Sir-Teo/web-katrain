import { describe, expect, it } from 'vitest';
import { MctsSearch, exploreScalingHuman } from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// humanSLRootExploreProbWeightless (cpp/search/searchexplorehelpers.cpp).
//
// KataGo's stronger human bot spends most of its playouts leaving the root by the
// human policy rather than the net's, so the moves a player of that rank would
// consider get real evaluations. Those playouts are weightless: the root is not
// charged for them, so they widen what the search knows without distorting what
// it reports.
// ---------------------------------------------------------------------------

describe('human explore scaling', () => {
  it('follows KataGo getExploreScalingHuman', () => {
    // (humanSLCpuctExploration + humanSLCpuctPermanent * sqrt(w)) * sqrt(w + 0.01)
    expect(exploreScalingHuman(0)).toBeCloseTo(0.5 * Math.sqrt(0.01), 10);
    expect(exploreScalingHuman(4)).toBeCloseTo((0.5 + 2 * 2) * Math.sqrt(4.01), 10);
  });

  it('outgrows the plain sqrt the net-policy scaling is built on', () => {
    // humanSLCpuctPermanent multiplies the cpuct by sqrt(weight) as well, so the
    // scaling climbs faster than the sqrt(weight) term the net's own cpuct has.
    const weights = [1, 100];
    const grew = exploreScalingHuman(weights[1]!) / exploreScalingHuman(weights[0]!);
    expect(grew).toBeGreaterThan(Math.sqrt(weights[1]! / weights[0]!));
  });
});

describe.skipIf(!runsEngineSuites())('human root exploration', () => {
  // A policy that only ever wants the 1-1 point, which the network itself would
  // never look at on an empty board. Nothing is marked illegal, so the difference
  // is entirely down to how the search descends.
  const CORNER = 0;
  const humanPolicy = (() => {
    const policy = new Float32Array(BOARD_AREA + 1);
    policy[CORNER] = 1;
    return policy;
  })();

  const searchWith = async (prob: number) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: emptyBoard(9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 81,
      ownershipMode: 'root',
      wideRootNoise: 0,
      humanPolicy,
      // No forced human moves: this test is about the descent, not the candidate list.
      humanMoveCount: 0,
      humanSlRootExploreProbWeightless: prob,
    });
    await search.run({ visits: 24, maxTimeMs: 120000, batchSize: 2 });
    return search.getAnalysis({ topK: 81, analysisPvLen: 1 });
  };

  it('evaluates the moves the human policy wants', async () => {
    const analysis = await searchWith(0.8);
    expect(analysis.moves.some((m) => m.x === 0 && m.y === 0)).toBe(true);
  }, 120000);

  it('leaves the search alone when the probability is zero', async () => {
    const analysis = await searchWith(0);
    expect(analysis.moves.some((m) => m.x === 0 && m.y === 0)).toBe(false);
  }, 120000);

  it('does not let those playouts speak for the root', async () => {
    const analysis = await searchWith(0.8);
    const corner = analysis.moves.find((m) => m.x === 0 && m.y === 0)!;
    const best = analysis.moves[0]!;
    // The corner was searched, but the root never paid for those visits, so it
    // carries no play selection weight and cannot be reported as the move.
    expect(corner.visits).toBeGreaterThan(0);
    expect(corner.playSelectionValue).toBeLessThan(best.playSelectionValue);
    expect(best.x === 0 && best.y === 0).toBe(false);
  }, 120000);
});

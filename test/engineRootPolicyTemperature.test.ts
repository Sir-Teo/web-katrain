import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, hasModel, loadHarnessModel } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// rootPolicyTemperature (cpp/search/searchhelpers.cpp maybeAddPolicyNoiseAndTemp),
// one of the widening knobs KataGo's analysis engine takes per query.
//
// Above 1 the root policy is flattened, so the search spreads its visits over more
// moves. Unlike wide root noise nothing random is added, and KataGo reshapes only
// the priors the search explores by -- the policy it reports stays raw.
// ---------------------------------------------------------------------------

describe.skipIf(!hasModel())('root policy temperature', () => {
  const analyze = async (rootPolicyTemperature: number) => {
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
      maxChildren: 20,
      ownershipMode: 'root',
      wideRootNoise: 0,
      // Symmetry pruning would leave only one move per orbit on an empty board.
      rootSymmetryPruning: false,
      rootPolicyTemperature,
    });
    await search.run({ visits: 40, maxTimeMs: 120000, batchSize: 4 });
    return search.getAnalysis({ topK: 20, analysisPvLen: 1 });
  };

  const priorsByPoint = (moves: Array<{ x: number; y: number; prior: number }>) => {
    const map = new Map<string, number>();
    for (const m of moves) map.set(`${m.x},${m.y}`, m.prior);
    return map;
  };

  it('leaves the reported policy raw whatever the temperature', async () => {
    const plain = await analyze(1);
    const hot = await analyze(2);
    expect(plain.policy).toBeDefined();
    for (let i = 0; i <= BOARD_AREA; i++) {
      expect(hot.policy![i]!).toBeCloseTo(plain.policy![i]!, 10);
    }
  }, 120000);

  it('flattens the priors the search explores by', async () => {
    const plain = priorsByPoint((await analyze(1)).moves);
    const hot = priorsByPoint((await analyze(2)).moves);

    // Find the two leading moves of the untouched run and compare their spread.
    const ranked = [...plain.entries()].sort((a, b) => b[1] - a[1]);
    const [topKey, topPrior] = ranked[0]!;
    const [secondKey, secondPrior] = ranked[1]!;
    const hotTop = hot.get(topKey);
    const hotSecond = hot.get(secondKey);
    expect(hotTop).toBeDefined();
    expect(hotSecond).toBeDefined();

    // The gap between them narrows: that is the whole effect.
    expect(secondPrior / topPrior).toBeLessThan(hotSecond! / hotTop!);
    expect(hotTop!).toBeLessThan(topPrior);
  }, 120000);

  it('sharpens them below 1', async () => {
    const plain = priorsByPoint((await analyze(1)).moves);
    const cold = priorsByPoint((await analyze(0.5)).moves);
    const ranked = [...plain.entries()].sort((a, b) => b[1] - a[1]);
    const [topKey, topPrior] = ranked[0]!;
    const [secondKey, secondPrior] = ranked[1]!;
    expect(secondPrior / topPrior).toBeGreaterThan(cold.get(secondKey)! / cold.get(topKey)!);
    expect(cold.get(topKey)!).toBeGreaterThan(topPrior);
  }, 120000);

  it('spreads the search over more moves', async () => {
    const plain = await analyze(1);
    const hot = await analyze(2);
    const visitedAbove = (moves: Array<{ visits: number }>, n: number) =>
      moves.filter((m) => m.visits > n).length;
    // Same visit budget, spread thinner.
    expect(visitedAbove(hot.moves, 1)).toBeGreaterThanOrEqual(visitedAbove(plain.moves, 1));
    expect(hot.moves[0]!.visits).toBeLessThanOrEqual(plain.moves[0]!.visits);
  }, 120000);
});

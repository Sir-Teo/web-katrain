import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { createEmptyBoard } from '../src/utils/boardSize';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';

/**
 * A batch size that is not a number must not stop the search.
 *
 * `Math.max(1, Math.min(value, 64))` reads as a clamp but is not one: given a
 * string or NaN both comparisons are false, so the "clamped" batch size is
 * NaN. `jobs.length < NaN` is false at once, so the batch stays empty, the
 * root never gains a visit, and the outer loop spins against the clock and
 * returns nothing. Settings reach here from localStorage, which the app does
 * not write alone.
 */
describe.skipIf(!hasModel())('a search given a batch size that is not a number', () => {
  const search = async () => {
    setBoardSize(9);
    return MctsSearch.create({
      model: await loadHarnessModel(),
      board: createEmptyBoard(9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: true,
      ownershipMode: 'none',
      maxChildren: 20,
      wideRootNoise: 0,
      rootSymmetryPruning: false,
    });
  };

  it('still searches when the batch size is NaN', async () => {
    const s = await search();
    await s.run({ visits: 8, maxTimeMs: 20000, batchSize: Number.NaN });
    expect(s.getAnalysis({ topK: 3, analysisPvLen: 0 }).moves.some((move) => move.visits > 0)).toBe(true);
  }, 60000);

  it('still searches when the batch size arrived as a string', async () => {
    const s = await search();
    await s.run({ visits: 8, maxTimeMs: 20000, batchSize: 'four' as unknown as number });
    expect(s.getAnalysis({ topK: 3, analysisPvLen: 0 }).moves.some((move) => move.visits > 0)).toBe(true);
  }, 60000);
});

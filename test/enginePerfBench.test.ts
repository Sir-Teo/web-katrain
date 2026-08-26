import { describe, it } from 'vitest';
import { boardFromDiagram, hasModel, loadHarnessModel } from './helpers/engineHarness';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';

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

// Not an assertion, just a timing readout for tuning the search.
describe.skipIf(!hasModel() || !process.env.BENCH)('search timing', () => {
  it('times 200 visits on 9x9', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(MID9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: true,
      conservativePass: true,
      maxChildren: 32,
      ownershipMode: 'tree',
      wideRootNoise: 0.04,
    });
    const t0 = Date.now();
    await search.run({ visits: 200, maxTimeMs: 300000, batchSize: 4 });
    const t1 = Date.now();
    const analysis = search.getAnalysis({ topK: 8, analysisPvLen: 6 });
    const t2 = Date.now();
    console.log(`search ${t1 - t0}ms for ${analysis.rootVisits} visits, getAnalysis ${t2 - t1}ms`);
  }, 300000);
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
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

type BenchResult = { visits: number; searchMs: number; analysisMs: number; visitsPerSecond: number };

const readBaseline = (path: string): BenchResult | null => {
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BenchResult>;
    return typeof parsed?.searchMs === 'number' && Number.isFinite(parsed.searchMs)
      ? (parsed as BenchResult)
      : null;
  } catch {
    return null;
  }
};

const writeResult = (path: string, result: BenchResult): void => {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    console.warn(`Could not write ${path}:`, error);
  }
};

/**
 * A timing readout for the hand-written MCTS, off by default because it needs
 * the model and takes about ten seconds.
 *
 *   BENCH=1 npm run bench
 *   BENCH=1 BENCH_OUT=/tmp/before.json npm run bench
 *   BENCH=1 BENCH_BASELINE=/tmp/before.json npm run bench   # prints the delta
 *   BENCH=1 BENCH_MAX_SEARCH_MS=20000 npm run bench         # and fails if slower
 *
 * Wall-clock on a shared runner is noisy, so there is no threshold unless you
 * ask for one — this is for comparing two runs on one machine, the way
 * web-xiangqi's bench-nps.cjs is used.
 */
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

    const searchMs = t1 - t0;
    const result: BenchResult = {
      visits: analysis.rootVisits,
      searchMs,
      analysisMs: t2 - t1,
      visitsPerSecond: searchMs > 0 ? Math.round((analysis.rootVisits / searchMs) * 1000) : 0,
    };
    console.log(
      `search ${result.searchMs}ms for ${result.visits} visits `
      + `(${result.visitsPerSecond} visits/s), getAnalysis ${result.analysisMs}ms`
    );

    const baseline = process.env.BENCH_BASELINE ? readBaseline(process.env.BENCH_BASELINE) : null;
    if (baseline) {
      const deltaMs = result.searchMs - baseline.searchMs;
      const deltaPct = baseline.searchMs > 0 ? (deltaMs / baseline.searchMs) * 100 : 0;
      console.log(
        `vs baseline ${baseline.searchMs}ms: ${deltaMs >= 0 ? '+' : ''}${deltaMs}ms `
        + `(${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`
      );
    } else if (process.env.BENCH_BASELINE) {
      console.warn(`No usable baseline at ${process.env.BENCH_BASELINE}; reporting this run only.`);
    }

    if (process.env.BENCH_OUT) writeResult(process.env.BENCH_OUT, result);

    const maxSearchMs = Number(process.env.BENCH_MAX_SEARCH_MS);
    if (Number.isFinite(maxSearchMs) && maxSearchMs > 0) {
      expect(result.searchMs).toBeLessThanOrEqual(maxSearchMs);
    }
  }, 300000);
});

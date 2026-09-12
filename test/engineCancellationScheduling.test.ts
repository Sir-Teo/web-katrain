import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';

describe.skipIf(!runsEngineSuites())('search cancellation from an event-loop task', () => {
  it('receives cancellation across short progress-report slices', async () => {
    setBoardSize(9);
    const search = await MctsSearch.create({
      model: await loadHarnessModel(), board: emptyBoard(9), currentPlayer: 'black',
      moveHistory: [], komi: 7, rules: 'chinese', nnRandomize: false,
      conservativePass: true, maxChildren: 12, ownershipMode: 'root', wideRootNoise: 0,
    });
    let canceled = false;
    let aborted = false;
    const timer = setTimeout(() => { canceled = true; }, 10);
    try {
      // A yield clock reset for every run() can starve messages indefinitely
      // when the caller asks for progress more often than that clock's budget.
      for (let slice = 0; slice < 20 && !aborted; slice++) {
        aborted = await search.run({
          visits: 4096, maxTimeMs: 25, batchSize: 1, shouldAbort: () => canceled,
        });
      }
      expect(canceled).toBe(true);
      expect(aborted).toBe(true);
    } finally {
      clearTimeout(timer);
    }
  }, 60000);

  it('receives cancellation during CPU search and leaves the tree resumable', async () => {
    setBoardSize(9);
    const search = await MctsSearch.create({
      model: await loadHarnessModel(), board: emptyBoard(9), currentPlayer: 'black',
      moveHistory: [], komi: 7, rules: 'chinese', nnRandomize: false,
      conservativePass: true, maxChildren: 12, ownershipMode: 'root', wideRootNoise: 0,
    });
    let canceled = false;
    // Like a worker's incoming message, a timer cannot run during an unbroken
    // chain of already-resolved inference promises. A synchronous flag flip
    // would exercise the predicate while missing the actual scheduling bug.
    const timer = setTimeout(() => { canceled = true; }, 10);
    try {
      const aborted = await search.run({
        visits: 4096, maxTimeMs: 500, batchSize: 4, shouldAbort: () => canceled,
      });
      expect(canceled, 'the incoming task must run before the search finishes').toBe(true);
      expect(aborted).toBe(true);
      const stopped = search.getAnalysis({ topK: 5, analysisPvLen: 2 });
      expect(stopped.rootVisits).toBeLessThan(4096);
      const target = stopped.rootVisits + 32;
      await search.run({ visits: target, maxTimeMs: 30000, batchSize: 4 });
      const resumed = search.getAnalysis({ topK: 5, analysisPvLen: 2 });
      expect(resumed.rootVisits).toBeGreaterThanOrEqual(target);
      expect(resumed.moves.length).toBeGreaterThan(0);
      expect(resumed.moves.every((move) => Number.isFinite(move.winRate))).toBe(true);
    } finally {
      clearTimeout(timer);
    }
  }, 60000);
});

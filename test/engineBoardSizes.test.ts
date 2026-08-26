import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, hasModel, loadHarnessModel } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// Every board size KataGo supports.
//
// KataGo takes any square board from 2 up to 19 (cpp/game/board.h, MAX_LEN). This
// app only offers 9, 13 and 19, but that is its own board size type talking -- the
// engine underneath is written against a settable BOARD_SIZE and the recorded
// goldens already exercise 5, 6, 7, 9 and 19.
//
// So this pins the engine's half of it: a search runs and reports something sane at
// every size, which is also a guard against anyone reaching for a hardcoded 19 in
// board-shaped code -- the neighbour tables, the symmetry maps, the score value
// tables, the pass-alive regions and the ladder search are all sized from it.
// ---------------------------------------------------------------------------

const SIZES = Array.from({ length: 18 }, (_, i) => i + 2);

describe.skipIf(!hasModel())('searching at every board size', () => {
  it.each(SIZES)('runs and reports sanely on %ix%i', async (size) => {
    setBoardSize(size);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: emptyBoard(size),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 12,
      // Tree ownership walks the search graph, so it exercises more than the root.
      ownershipMode: 'tree',
      wideRootNoise: 0,
    });
    await search.run({ visits: 16, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 5, analysisPvLen: 2 });

    expect(analysis.rootVisits).toBeGreaterThanOrEqual(16);
    expect(analysis.moves.length).toBeGreaterThan(0);

    const best = analysis.moves[0]!;
    // A real point on the board, or a pass, and nothing outside it.
    expect(best.x < size && best.y < size).toBe(true);
    expect(best.x >= -1 && best.y >= -1).toBe(true);
    expect(Number.isFinite(best.winRate)).toBe(true);
    expect(Number.isFinite(best.scoreLead)).toBe(true);

    expect(analysis.rootWinRate).toBeGreaterThan(0);
    expect(analysis.rootWinRate).toBeLessThan(1);
    // The lead cannot exceed the board plus the komi by any sane margin.
    expect(Math.abs(analysis.rootScoreLead)).toBeLessThan(size * size + 20);

    // The buffers are all sized from the board, not from nineteen.
    expect(analysis.policy.length).toBe(BOARD_AREA + 1);
    expect(analysis.ownership.length).toBe(BOARD_AREA);
    expect(analysis.ownershipStdev.length).toBe(BOARD_AREA);
    for (let p = 0; p < BOARD_AREA; p++) {
      expect(`own ${p} ${analysis.ownership[p]! >= -1.001 && analysis.ownership[p]! <= 1.001}`).toBe(
        `own ${p} true`
      );
    }
  }, 120000);
});

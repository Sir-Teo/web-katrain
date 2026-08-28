import { describe, expect, it } from 'vitest';
import { loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import type { BoardState, Move } from '../src/types';

// ---------------------------------------------------------------------------
// A soft cross-check against KataGo's own recorded search.
//
// cpp/tests/results/runSearchTestsV8.txt records a 200 visit search by the real
// KataGo binary on the very network this repo bundles (b6c96-s175395328), on a
// 9x9 position three moves in. That makes it the only reference we have for the
// search as a whole rather than for the network alone (engineGolden.test.ts).
//
// The comparison has to be soft. KataGo ran it under koSIMPLE/scoreAREA/taxALL
// with its test search parameters and a single thread, where this port runs area
// scoring with no tax, the analysis parameters, and batched playouts. So the
// bands below are wide on purpose: they catch a search that has gone wrong, not
// a search that rounds differently.
//
// KataGo's recorded root, white to play:
//   T -1.99c  W -0.76c  S -1.23c (-0.1  L -0.1)  N 200
//   G6 (PSV 126) > C5 (40) > D4 (11) > G7 (10) > C6 (5)
//
// For reference, this port on 2026-08-26 produced black winrate 0.4725 against
// KataGo's 0.5038, black lead -0.30 against KataGo's +0.1, and the same first
// move G6 with 171 of its 200 visits.
// ---------------------------------------------------------------------------

const KATAGO_ROOT_WHITE_WINRATE = 0.5 - 0.0076 / 2; // W -0.76c, white perspective
const KATAGO_ROOT_BLACK_LEAD = 0.1; // L -0.1 for white
const KATAGO_TOP_MOVES = ['6,3', '2,4', '3,5']; // G6, C5, D4 as x,y

function boardWithHistory(): { board: BoardState; history: Move[]; previous: BoardState } {
  const empty = (): BoardState => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
  const board = empty();
  board[5]![4] = 'black'; // E4
  board[3]![4] = 'white'; // E6
  board[4]![6] = 'black'; // G5
  const previous = empty();
  previous[5]![4] = 'black';
  previous[3]![4] = 'white';
  const history: Move[] = [
    { x: 4, y: 5, player: 'black' },
    { x: 4, y: 3, player: 'white' },
    { x: 6, y: 4, player: 'black' },
  ];
  return { board, history, previous };
}

describe.skipIf(!runsEngineSuites())('search against KataGo\'s recorded search', () => {
  it('reads the position the way KataGo read it', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const { board, history, previous } = boardWithHistory();

    const search = await MctsSearch.create({
      model,
      board,
      previousBoard: previous,
      currentPlayer: 'white',
      moveHistory: history,
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 64,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 200, maxTimeMs: 300000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 8, analysisPvLen: 6 });

    expect(analysis.rootVisits).toBe(200);

    // Root evaluation: KataGo had the game essentially even here.
    const blackWinRate = analysis.rootWinRate;
    expect(blackWinRate).toBeGreaterThan(1 - KATAGO_ROOT_WHITE_WINRATE - 0.1);
    expect(blackWinRate).toBeLessThan(1 - KATAGO_ROOT_WHITE_WINRATE + 0.1);
    expect(Math.abs(analysis.rootScoreLead - KATAGO_ROOT_BLACK_LEAD)).toBeLessThan(3);

    // Move choice: one of the three KataGo actually spent its visits on.
    const best = analysis.moves[0]!;
    expect(KATAGO_TOP_MOVES).toContain(`${best.x},${best.y}`);

    // And the same shape of search: most of the visits on the leader, a real PV.
    expect(best.visits).toBeGreaterThan(analysis.rootVisits / 4);
    expect(best.pv.length).toBeGreaterThan(2);
    expect(best.pvVisits[0]).toBe(best.visits);
  }, 600000);
});

import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { boardFromDiagram, emptyBoard, hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { BoardState } from '../src/types';

// ---------------------------------------------------------------------------
// The fields KataGo's analysis engine reports (docs/Analysis_Engine.md).
//
// `edgeVisits` and `edgeWeight` exist because `visits` and `weight` count the child
// node itself, which human SL exploration and graph search transpositions can push
// above what the parent actually invested. The rootInfo `raw*` fields are the
// network's own read of the position, which the search never moves.
// ---------------------------------------------------------------------------

describe.skipIf(!hasModel())('analysis payload fields', () => {
  const make = async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    return MctsSearch.create({
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
      // Symmetric copies are reported by duplicating a searched move's row, which
      // would double-count when checking the visits add up.
      rootSymmetryPruning: false,
    });
  };

  // One deterministic 200 visit search, read by both assertions below: the second
  // wants the root before and after, so it needs the reading taken before the run.
  let sharedSearch: Promise<{
    before: ReturnType<MctsSearch['getAnalysis']>;
    after: ReturnType<MctsSearch['getAnalysis']>;
  }> | null = null;
  const searched = () =>
    (sharedSearch ??= (async () => {
      const search = await make();
      const before = search.getAnalysis({ topK: 1, analysisPvLen: 0 });
      await search.run({ visits: 200, maxTimeMs: 120000, batchSize: 4 });
      const after = search.getAnalysis({ topK: 50, analysisPvLen: 2 });
      return { before, after };
    })());

  it('reports what the root paid for each move alongside what the child got', async () => {
    const analysis = (await searched()).after;

    let totalEdgeVisits = 0;
    for (const m of analysis.moves) {
      expect(m.edgeVisits).toBeGreaterThan(0);
      // A child can be reached by more than the edge that owns it, never fewer.
      expect(m.edgeVisits).toBeLessThanOrEqual(m.visits);
      expect(m.edgeWeight).toBeGreaterThan(0);
      expect(m.edgeWeight).toBeLessThanOrEqual(m.weight + 1e-9);
      // KataGo's childWeight is the child's weight scaled by the edge's share.
      expect(m.edgeWeight).toBeCloseTo((m.weight * m.edgeVisits) / m.visits, 6);
      totalEdgeVisits += m.edgeVisits;
    }
    // Every playout that reached the root paid one edge, plus the root's own visit.
    expect(totalEdgeVisits + 1).toBe(analysis.rootVisits);
  }, 120000);

  it("keeps the network's own read of the root untouched by the search", async () => {
    const { before, after } = await searched();

    expect(after.rawWinRate).toBe(before.rawWinRate);
    expect(after.rawScoreLead).toBe(before.rawScoreLead);
    expect(after.rawWinRate).toBeGreaterThan(0);
    expect(after.rawWinRate).toBeLessThan(1);
    expect(after.rawScoreSelfplayStdev).toBeGreaterThan(0);
    // The searched root does move, which is the point of the distinction.
    expect(after.rootWinRate).not.toBe(after.rawWinRate);
    // Reported as -1 by nets older than the version that predicts them.
    expect(after.rawStWrError === -1 || after.rawStWrError > 0).toBe(true);
    expect(after.rawStScoreError === -1 || after.rawStScoreError > 0).toBe(true);
    expect(after.rawVarTimeLeft).toBe(before.rawVarTimeLeft);
  }, 120000);

  it('says how much game the network thinks is left', async () => {
    // KataGo's varTimeLeft, in no unit of its own: large while the winner is still
    // open, smaller once the game has settled. A whole board is still to play for on
    // an empty board; the position below is two settled territories and a few dame.
    setBoardSize(9);
    const model = await loadHarnessModel();
    const settled = boardFromDiagram(`
      XXX.OOOOO
      X.X.OO.OO
      XXX.OOOOO
      XXX.OOOOO
      XXX.OOOOO
      XXX.OOOOO
      XXX.OOOOO
      XXX.OOOOO
      XXX.OOOOO
    `);
    const varTimeLeftOf = async (board: BoardState) => {
      const search = await MctsSearch.create({
        model,
        board,
        currentPlayer: 'black',
        moveHistory: [],
        komi: 7,
        rules: 'chinese',
        nnRandomize: false,
        conservativePass: false,
        maxChildren: 10,
        ownershipMode: 'root',
        wideRootNoise: 0,
      });
      return search.getAnalysis({ topK: 1, analysisPvLen: 0 }).rawVarTimeLeft;
    };

    const openGame = await varTimeLeftOf(emptyBoard(9));
    const nearlyOver = await varTimeLeftOf(settled);
    expect(openGame).toBeGreaterThan(0);
    expect(nearlyOver).toBeGreaterThan(0);
    expect(nearlyOver).toBeLessThan(openGame);
  }, 120000);
});

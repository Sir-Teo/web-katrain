import { describe, expect, it } from 'vitest';
import { boardFromDiagram, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import type { BoardState, Player } from '../src/types';

// ---------------------------------------------------------------------------
// Does the search still do its job?
//
// The node statistics are rebuilt from a node's children after every playout, with
// noise pruning, sibling downweighting, uncertainty weights and subtree value bias
// all folded in. That is a lot of machinery between a network evaluation and the
// move the user is shown, so these tests check what must hold no matter what: the
// recommended move is not one the search itself calls a mistake, the same position
// gives the same answer twice, and a settled position reads as settled.
// ---------------------------------------------------------------------------

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

async function analyze(args: {
  board: BoardState;
  player: Player;
  visits: number;
  komi?: number;
}): Promise<ReturnType<MctsSearch['getAnalysis']>> {
  const model = await loadHarnessModel();
  const search = await MctsSearch.create({
    model,
    board: args.board,
    currentPlayer: args.player,
    moveHistory: [],
    komi: args.komi ?? 6.5,
    rules: 'japanese',
    nnRandomize: false,
    conservativePass: true,
    maxChildren: 24,
    ownershipMode: 'root',
    wideRootNoise: 0,
  });
  await search.run({ visits: args.visits, maxTimeMs: 180000, batchSize: 4 });
  return search.getAnalysis({ topK: 8, analysisPvLen: 4 });
}

describe.skipIf(!runsEngineSuites())('search quality', () => {
  it('does not recommend a move that it says loses points', async () => {
    setBoardSize(9);
    const analysis = await analyze({ board: boardFromDiagram(MID9), player: 'black', visits: 120 });
    const best = analysis.moves[0]!;
    // pointsLost is measured against the search's own root evaluation, so its own
    // first choice should be worth roughly what the position is worth. A sign or
    // aggregation error in the node statistics shows up here immediately.
    expect(best.pointsLost).toBeLessThan(0.75);
    expect(best.visits).toBeGreaterThan(analysis.rootVisits / 8);
    // And the ranking should agree with itself.
    expect(best.playSelectionValue).toBeGreaterThanOrEqual(analysis.moves[analysis.moves.length - 1]!.playSelectionValue);
  }, 300000);

  it('gives the same answer twice for the same position', async () => {
    setBoardSize(9);
    const board = boardFromDiagram(MID9);
    const first = await analyze({ board, player: 'black', visits: 60 });
    const second = await analyze({ board, player: 'black', visits: 60 });

    expect(second.rootVisits).toBe(first.rootVisits);
    expect(second.rootWinRate).toBeCloseTo(first.rootWinRate, 10);
    expect(second.rootScoreLead).toBeCloseTo(first.rootScoreLead, 10);
    expect(second.moves.length).toBe(first.moves.length);
    first.moves.forEach((move, i) => {
      const other = second.moves[i]!;
      expect(`${other.x},${other.y}`).toBe(`${move.x},${move.y}`);
      expect(other.visits).toBe(move.visits);
      expect(other.winRate).toBeCloseTo(move.winRate, 10);
      expect(other.playSelectionValue).toBeCloseTo(move.playSelectionValue, 10);
    });
  }, 300000);

  it('reports a position that is already decided as decided', async () => {
    setBoardSize(9);
    // Black owns the whole board except a dead white group.
    const settled = boardFromDiagram(`
      XXXXXXXXX
      X.......X
      XXXXXXXXX
      XOOOOOOOX
      XXXXXXXXX
      X.......X
      XXXXXXXXX
      X.......X
      XXXXXXXXX
    `);
    const analysis = await analyze({ board: settled, player: 'white', visits: 60, komi: 6.5 });
    expect(analysis.rootWinRate).toBeGreaterThan(0.9); // black perspective
    expect(analysis.rootScoreLead).toBeGreaterThan(20);
  }, 300000);
});

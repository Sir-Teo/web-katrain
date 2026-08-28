import { describe, expect, it } from 'vitest';
import { boardFromDiagram, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';
import { MctsSearch, terminalAreaScoreBlack } from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, BOARD_SIZE, setBoardSize } from '../src/engine/katago/fastBoard';
import type { BoardState, Move } from '../src/types';

// ---------------------------------------------------------------------------
// Scoring a game that ends inside the search.
//
// Two passes end the game, and under area scoring the result is then a matter of
// counting rather than something to ask the network about — which matters because
// a filled board is off-distribution and the network's answer there is unreliable.
// KataGo scores such a node exactly; this does the same for area rules.
// ---------------------------------------------------------------------------

const stonesFrom = (diagram: string): Uint8Array => {
  const rows = diagram.trim().split('\n').map((r) => r.trim());
  const stones = new Uint8Array(BOARD_AREA);
  rows.forEach((row, y) => {
    row.split('').forEach((c, x) => {
      if (c === 'X') stones[y * BOARD_SIZE + x] = 1;
      else if (c === 'O') stones[y * BOARD_SIZE + x] = 2;
    });
  });
  return stones;
};

// Black holds the left five columns, white the right four.
const SPLIT9 = `
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
`;

describe('area score of a finished game', () => {
  it('counts stones and the points only one colour reaches', () => {
    setBoardSize(9);
    const stones = stonesFrom(SPLIT9);
    // 45 black points, 36 white points, komi 7 -> black by 2.
    expect(terminalAreaScoreBlack(stones, 7)).toBeCloseTo(2, 9);
    expect(terminalAreaScoreBlack(stones, 0)).toBeCloseTo(9, 9);
    expect(terminalAreaScoreBlack(stones, 9)).toBeCloseTo(0, 9); // jigo
  });

  it('gives empty territory to the colour that surrounds it', () => {
    setBoardSize(9);
    // Black wall down the middle with empty space either side of it; the empty
    // points on the left are black's, the ones on the right are white's.
    const stones = stonesFrom(`
      ....X.O..
      ....X.O..
      ....X.O..
      ....X.O..
      ....X.O..
      ....X.O..
      ....X.O..
      ....X.O..
      ....X.O..
    `);
    // Black: 5 columns (4 empty + wall) = 45; white: 3 columns = 27; 9 neutral.
    expect(terminalAreaScoreBlack(stones, 0)).toBeCloseTo(45 - 27, 9);
  });
});

describe.skipIf(!runsEngineSuites())('terminal nodes in the search', () => {
  it('knows a finished game is finished rather than asking the network', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();

    // The board is settled and black is far ahead; white has just passed, so black
    // passing ends the game with a score the search can simply count.
    const board: BoardState = boardFromDiagram(`
      XXXXXXXXX
      X.......X
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      X.......X
      XXXXXXXXX
    `);
    const moveHistory: Move[] = [
      { x: 0, y: 0, player: 'black' },
      { x: -1, y: -1, player: 'white' },
    ];

    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory,
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 60, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 8, analysisPvLen: 2 });

    const pass = analysis.moves.find((m) => m.x < 0 && m.y < 0);
    expect(pass).toBeDefined();
    // Black owns all 81 points, so passing here scores 81 - 0 - 7 = +74 and wins.
    expect(pass!.scoreLead).toBeCloseTo(74, 6);
    expect(pass!.winRate).toBeCloseTo(1, 6);
  }, 300000);

  it('still reaches the requested visits when every line is over', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const board: BoardState = boardFromDiagram(`
      XXXXXXXXX
      X.......X
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      X.......X
      XXXXXXXXX
    `);
    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: [
        { x: 0, y: 0, player: 'black' },
        { x: -1, y: -1, player: 'white' },
      ],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    // Batches that consist only of finished games come back with nothing to
    // evaluate; the search has to treat that as progress rather than as stuck.
    await search.run({ visits: 200, maxTimeMs: 120000, batchSize: 4 });
    expect(search.getAnalysis({ topK: 3, analysisPvLen: 1 }).rootVisits).toBe(200);
  }, 300000);

  it('does not treat a single pass as the end of the game', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    // An ordinary midgame position with no pass in its history: passing here gives
    // the opponent a free move, it does not end anything, and the score of the
    // position must not be counted off the board.
    const board: BoardState = boardFromDiagram(`
      .........
      ..X.O....
      ...X.O...
      .X..O....
      ....X.O..
      ..O.X....
      ...O.X...
      .........
      .........
    `);
    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: [{ x: 5, y: 6, player: 'white' }],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 60, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 20, analysisPvLen: 2 });
    const pass = analysis.moves.find((m) => m.x < 0 && m.y < 0);
    if (pass) {
      // Counting this board would give black a huge number; the network's judgement
      // of an unsettled midgame position is nothing like that.
      expect(Math.abs(pass.scoreLead)).toBeLessThan(30);
    }
    // And the search itself is not free: it still had to evaluate positions.
    expect(analysis.rootVisits).toBe(60);
  }, 300000);

  it('leaves territory scoring to the network', async () => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const board: BoardState = boardFromDiagram(`
      XXXXXXXXX
      X.......X
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      XXXXXXXXX
      X.......X
      XXXXXXXXX
    `);
    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: [
        { x: 0, y: 0, player: 'black' },
        { x: -1, y: -1, player: 'white' },
      ],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 24,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    await search.run({ visits: 40, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 8, analysisPvLen: 2 });
    const pass = analysis.moves.find((m) => m.x < 0 && m.y < 0);
    // Under territory rules the dead stones would have to be agreed first, so the
    // pass is evaluated, not counted: no exact 74 here.
    if (pass) expect(Math.abs(pass.scoreLead - 74)).toBeGreaterThan(0.001);
  }, 300000);
});

import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { BOARD_AREA, BOARD_SIZE, setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// avoidMoves and allowMoves with untilDepth (docs/Analysis_Engine.md, and
// avoidMoveUntilByLoc in cpp/search/searchexplorehelpers.cpp).
//
// A move can be taken off the table for the first few plies rather than only at the
// root, which is what asking "and if that move were not available?" usually means:
// banning it at the root alone lets the search play it again immediately.
// ---------------------------------------------------------------------------

const at = (x: number, y: number) => y * BOARD_SIZE + x;

describe.skipIf(!runsEngineSuites())('avoiding moves to a depth', () => {
  const search = async (avoid: { black?: Int32Array; white?: Int32Array }) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const s = await MctsSearch.create({
      model,
      board: emptyBoard(9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 12,
      ownershipMode: 'root',
      wideRootNoise: 0,
      rootSymmetryPruning: false,
      avoidMoveUntilBlack: avoid.black ?? null,
      avoidMoveUntilWhite: avoid.white ?? null,
    });
    await s.run({ visits: 80, maxTimeMs: 120000, batchSize: 4 });
    return s;
  };

  // The unrestricted search is the same every time and is not cheap.
  let plainSearch: Promise<MctsSearch> | null = null;
  const unrestricted = () => (plainSearch ??= search({}));

  it('keeps the move out of the root', async () => {
    const plain = await unrestricted();
    const top = plain.getAnalysis({ topK: 1, analysisPvLen: 0 }).moves[0]!;
    expect(top.x).toBeGreaterThanOrEqual(0);

    const avoid = new Int32Array(BOARD_AREA + 1);
    avoid[at(top.x, top.y)] = 1;
    const restricted = await search({ black: avoid });
    const moves = restricted.getAnalysis({ topK: 20, analysisPvLen: 1 }).moves;
    for (const m of moves) expect(`${m.x},${m.y}`).not.toBe(`${top.x},${top.y}`);
  }, 300000);

  it('keeps it out of the whole opening when asked for more plies', async () => {
    const plain = await unrestricted();
    const analysis = plain.getAnalysis({ topK: 3, analysisPvLen: 4 });
    const top = analysis.moves[0]!;
    const label = top.pv[0]!;

    // Banned for black for the first five plies, so black's moves at plies 0, 2 and
    // 4 are all off the table. White is unrestricted.
    const avoid = new Int32Array(BOARD_AREA + 1);
    avoid[at(top.x, top.y)] = 5;
    const restricted = await search({ black: avoid });
    const deep = restricted.getAnalysis({ topK: 20, analysisPvLen: 6 });
    // Black never plays it: it cannot appear at an even ply of any variation.
    for (const m of deep.moves) {
      for (let ply = 0; ply < m.pv.length; ply += 2) {
        expect(m.pv[ply]).not.toBe(label);
      }
    }
  }, 300000);

  it('restricts only the player it was asked about', async () => {
    const plain = await unrestricted();
    const top = plain.getAnalysis({ topK: 1, analysisPvLen: 0 }).moves[0]!;

    // The same point banned for white leaves black's own root move alone.
    const avoid = new Int32Array(BOARD_AREA + 1);
    avoid[at(top.x, top.y)] = 5;
    const restricted = await search({ white: avoid });
    const moves = restricted.getAnalysis({ topK: 20, analysisPvLen: 1 }).moves;
    expect(moves.some((m) => m.x === top.x && m.y === top.y)).toBe(true);
  }, 300000);

  it('can ban the pass as readily as a point', async () => {
    const avoid = new Int32Array(BOARD_AREA + 1);
    avoid[BOARD_AREA] = 3;
    const restricted = await search({ black: avoid });
    const moves = restricted.getAnalysis({ topK: 30, analysisPvLen: 1 }).moves;
    expect(moves.some((m) => m.x < 0 && m.y < 0)).toBe(false);
  }, 300000);
});

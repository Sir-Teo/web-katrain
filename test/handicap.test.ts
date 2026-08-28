import { describe, expect, it } from 'vitest';
import { countHandicapStones, komiWithHandicapBonus, whiteHandicapBonus } from '../src/utils/handicap';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { boardFromDiagram, emptyBoard, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// Handicap compensation (cpp/game/boardhistory.cpp computeWhiteHandicapBonus, and
// whiteHandicapBonusRule in cpp/game/rules.cpp).
//
// Chinese rules give white a point for each stone black started with; Japanese and
// Korean give nothing. KataGo folds that into the komi, so it reaches the network's
// komi plane and every score it reports -- not just the final count.
// ---------------------------------------------------------------------------

const boardWith = (stones: Array<[number, number, 'black' | 'white']>, size = 9) => {
  const board = emptyBoard(size);
  for (const [x, y, colour] of stones) board[y]![x] = colour;
  return board;
};

describe('counting handicap stones', () => {
  it('reads them off the starting position', () => {
    expect(countHandicapStones(emptyBoard(9))).toBe(0);
    expect(
      countHandicapStones(
        boardWith([
          [2, 2, 'black'],
          [6, 6, 'black'],
          [2, 6, 'black'],
          [6, 2, 'black'],
        ])
      )
    ).toBe(4);
  });

  it('calls a single stone a normal opening, not a handicap', () => {
    expect(countHandicapStones(boardWith([[4, 4, 'black']]))).toBe(0);
  });

  it("calls a position with white stones somebody's problem diagram", () => {
    expect(
      countHandicapStones(
        boardWith([
          [2, 2, 'black'],
          [6, 6, 'black'],
          [4, 4, 'white'],
        ])
      )
    ).toBe(0);
  });
});

describe('the compensation each ruleset gives', () => {
  it('follows KataGo whiteHandicapBonusRule', () => {
    expect(whiteHandicapBonus('chinese', 4)).toBe(4);
    expect(whiteHandicapBonus('japanese', 4)).toBe(0);
    expect(whiteHandicapBonus('korean', 4)).toBe(0);
    expect(whiteHandicapBonus('chinese', 0)).toBe(0);
  });

  it("adds it to the komi, which is counted in white's favour", () => {
    const board = boardWith([
      [2, 2, 'black'],
      [6, 6, 'black'],
      [2, 6, 'black'],
      [6, 2, 'black'],
    ]);
    expect(komiWithHandicapBonus(board, 'chinese', 0.5)).toBe(4.5);
    expect(komiWithHandicapBonus(board, 'japanese', 0.5)).toBe(0.5);
    expect(komiWithHandicapBonus(emptyBoard(9), 'chinese', 7.5)).toBe(7.5);
  });
});

// A two stone handicap on 9x9: enough to matter, not so lopsided that the score
// prediction stops responding.
const TWO_STONES = `
  .........
  .........
  ..X...X..
  .........
  .........
  .........
  .........
  .........
  .........
`;

describe.skipIf(!runsEngineSuites())('what the compensation is worth', () => {
  // The network's own read of the position, before any search: the point is what
  // komi reaches it, and a search on a handicap board saturates and hides that.
  // Rules are held fixed so the only thing varying is the komi.
  const rawLeadWithKomi = async (komi: number) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(TWO_STONES),
      currentPlayer: 'white',
      moveHistory: [],
      komi,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 20,
      ownershipMode: 'root',
      wideRootNoise: 0,
    });
    return search.getAnalysis({ topK: 1, analysisPvLen: 0 }).rawScoreLead;
  };

  it('takes points off black in a Chinese handicap game', async () => {
    const board = boardFromDiagram(TWO_STONES);
    const scoreboardKomi = 0.5;
    expect(komiWithHandicapBonus(board, 'chinese', scoreboardKomi)).toBe(2.5);
    // Japanese rules compensate nothing, so nothing about the analysis changes.
    expect(komiWithHandicapBonus(board, 'japanese', scoreboardKomi)).toBe(scoreboardKomi);

    const uncompensated = await rawLeadWithKomi(scoreboardKomi);
    const compensated = await rawLeadWithKomi(komiWithHandicapBonus(board, 'chinese', scoreboardKomi));
    // Black's lead is smaller once white is paid for the stones black began with.
    // Leaving it out misreports every Chinese handicap game, and by a whole stone
    // per stone of handicap.
    expect(uncompensated - compensated).toBeGreaterThan(1);
  }, 120000);
});

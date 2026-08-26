import { beforeEach, describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { extractInputsV7Fast, type RecentMove } from '../src/engine/katago/featuresV7Fast';
import { BOARD_AREA, BOARD_SIZE, PASS_MOVE, setBoardSize } from '../src/engine/katago/fastBoard';
import { boardFromDiagram, hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { Move } from '../src/types';

// ---------------------------------------------------------------------------
// ignorePreRootHistory (cpp/search/searchnnhelpers.cpp), which KataGo's analysis
// engine turns on by default (Setup::DEFAULT_ANALYSIS_IGNORE_PRE_ROOT_HISTORY).
//
// The network sees no moves from before the root, only the ones the search played
// itself: maxHistory is 0 at the root and the depth below it thereafter. Analysis
// then judges the position rather than the path that reached it.
// ---------------------------------------------------------------------------

const at = (x: number, y: number): number => y * BOARD_SIZE + x;

const inputsWith = (recentMoves: RecentMove[], maxHistory?: number) => {
  return extractInputsV7Fast({
    stones: new Uint8Array(BOARD_AREA),
    koPoint: -1,
    currentPlayer: 'black',
    recentMoves,
    komi: 7,
    rules: 'chinese',
    maxHistory,
  });
};

const HISTORY_PLANES = [9, 10, 11, 12, 13];
const planeIsEmpty = (spatial: Float32Array, plane: number): boolean => {
  for (let p = 0; p < BOARD_AREA; p++) {
    if (spatial[p * 22 + plane] !== 0) return false;
  }
  return true;
};

describe('maxHistory', () => {
  // Board size is global state the engine sets, and move indices depend on it.
  beforeEach(() => setBoardSize(9));
  const recent = (): RecentMove[] => [
    { move: at(2, 2), player: 'white' },
    { move: at(6, 6), player: 'black' },
    { move: at(4, 4), player: 'white' },
  ];

  it('fills the history planes up to five moves back by default', () => {
    const { spatial } = inputsWith(recent());
    // Three moves are known, so three planes are set and the rest stay empty.
    expect(planeIsEmpty(spatial, 9)).toBe(false);
    expect(planeIsEmpty(spatial, 10)).toBe(false);
    expect(planeIsEmpty(spatial, 11)).toBe(false);
    expect(planeIsEmpty(spatial, 12)).toBe(true);
  });

  it('shows nothing at all at zero', () => {
    const { spatial } = inputsWith(recent(), 0);
    for (const plane of HISTORY_PLANES) expect(planeIsEmpty(spatial, plane)).toBe(true);
  });

  it('shows only as many moves back as it is allowed', () => {
    const { spatial } = inputsWith(recent(), 2);
    expect(planeIsEmpty(spatial, 9)).toBe(false);
    expect(planeIsEmpty(spatial, 10)).toBe(false);
    expect(planeIsEmpty(spatial, 11)).toBe(true);
  });

  it('still tells the net a pass would end the phase', () => {
    // KataGo reads that from the real history, not the truncated one, so hiding
    // history does not hide the fact that the game is one pass from over.
    const afterPass: RecentMove[] = [{ move: PASS_MOVE, player: 'white' }];
    expect(inputsWith(afterPass, 0).global[14]).toBe(1);
    // And the pass itself does not reach the history globals.
    expect(inputsWith(afterPass, 0).global[0]).toBe(0);
    expect(inputsWith(afterPass).global[0]).toBe(1);
  });
});

// The same four stones, reached two different ways. Black to play in both.
const FINAL = `
  .........
  .........
  ..X...O..
  .........
  .........
  .........
  ..X...O..
  .........
  .........
`;

describe.skipIf(!hasModel())('a root judged by its position, not its path', () => {
  const historyA: Move[] = [
    { x: 2, y: 2, player: 'black' },
    { x: 6, y: 2, player: 'white' },
    { x: 2, y: 6, player: 'black' },
    { x: 6, y: 6, player: 'white' },
  ];
  const historyB: Move[] = [
    { x: 2, y: 6, player: 'black' },
    { x: 6, y: 6, player: 'white' },
    { x: 2, y: 2, player: 'black' },
    { x: 6, y: 2, player: 'white' },
  ];

  const boardMinus = (skip: Array<[number, number]>) => {
    const board = boardFromDiagram(FINAL);
    for (const [x, y] of skip) board[y]![x] = null;
    return board;
  };

  const rootEval = async (moveHistory: Move[], ignorePreRootHistory: boolean) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const last = moveHistory[moveHistory.length - 1]!;
    const secondLast = moveHistory[moveHistory.length - 2]!;
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(FINAL),
      previousBoard: boardMinus([[last.x, last.y]]),
      previousPreviousBoard: boardMinus([
        [last.x, last.y],
        [secondLast.x, secondLast.y],
      ]),
      currentPlayer: 'black',
      moveHistory,
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: false,
      maxChildren: 20,
      ownershipMode: 'root',
      wideRootNoise: 0,
      ignorePreRootHistory,
    });
    return search.getAnalysis({ topK: 1, analysisPvLen: 1 });
  };

  it('gives the same evaluation whichever move order got there', async () => {
    const a = await rootEval(historyA, true);
    const b = await rootEval(historyB, true);
    expect(b.rootWinRate).toBeCloseTo(a.rootWinRate, 12);
    expect(b.rootScoreLead).toBeCloseTo(a.rootScoreLead, 12);
  }, 120000);

  it('does not, when it is told to keep the history', async () => {
    const a = await rootEval(historyA, false);
    const b = await rootEval(historyB, false);
    expect(Math.abs(b.rootWinRate - a.rootWinRate)).toBeGreaterThan(0);
  }, 120000);
});

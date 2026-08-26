import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { boardFromDiagram, hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { GameRules } from '../src/types';

// ---------------------------------------------------------------------------
// fillDameBeforePass (cpp/search/searchhelpers.cpp Search::shouldSuppressPass).
//
// Under territory scoring, passing with dame still on the board leaves the other
// player to tidy up before the count means anything. KataGo's answer is to take
// passing off the table for as long as some move that costs nothing is still
// available. It is silent under area scoring, where a dame is worth a point and the
// search goes and gets it unprompted.
// ---------------------------------------------------------------------------

// Both sides alive with an eye, everything settled except (4,0) and (4,1), which
// touch both walls and so are worth nothing to either player under territory rules.
const TWO_DAME = `
  XXXX.OOOO
  X.XX.OO.O
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
  XXXXXOOOO
`;

describe.skipIf(!hasModel())('filling dame before passing', () => {
  const analyze = async (rules: GameRules, fillDameBeforePass: boolean) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(TWO_DAME),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules,
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 20,
      ownershipMode: 'root',
      wideRootNoise: 0,
      fillDameBeforePass,
    });
    await search.run({ visits: 80, maxTimeMs: 120000, batchSize: 4 });
    return search.getAnalysis({ topK: 20, analysisPvLen: 1 });
  };

  const pass = (moves: Array<{ x: number; y: number; playSelectionValue: number; visits: number }>) =>
    moves.find((m) => m.x < 0 && m.y < 0);

  it('would otherwise pass with dame still on the board', async () => {
    const off = await analyze('japanese', false);
    // Passing is worth as much as filling under territory scoring, so the search
    // settles on it and leaves the two neutral points to the opponent.
    expect(off.moves[0]!.x).toBeLessThan(0);
    expect(pass(off.moves)!.playSelectionValue).toBeGreaterThan(0);
  }, 120000);

  it('plays the dame instead once it is asked to', async () => {
    const on = await analyze('japanese', true);
    const passRow = pass(on.moves)!;
    // The search still looked at passing, and still reports what it found; it just
    // cannot be chosen while a move that costs nothing is available.
    expect(passRow.visits).toBeGreaterThan(0);
    expect(passRow.playSelectionValue).toBe(0);
    expect(on.moves[0]!.x).toBe(4);
  }, 120000);

  it('stays out of it under area scoring', async () => {
    const off = await analyze('chinese', false);
    const on = await analyze('chinese', true);
    const passOff = pass(off.moves);
    const passOn = pass(on.moves);
    expect(passOn === undefined).toBe(passOff === undefined);
    if (passOff && passOn) expect(passOn.playSelectionValue).toBeCloseTo(passOff.playSelectionValue, 10);
  }, 120000);
});

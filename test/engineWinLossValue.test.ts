import { describe, expect, it } from 'vitest';
import { MctsSearch, blackWinLossValue } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, hasModel, loadHarnessModel, rawEval } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// What "winrate" means (cpp/search/searchresults.cpp).
//
// KataGo reports 0.5 + 0.5 * winLossValue, and winLossValue is the win probability
// less the loss probability. Those two differ by the chance the net gives the game
// of ending with no result at all -- a triple ko under rules without superko -- and
// the difference is the whole of that chance, split half to each side. Reporting the
// win probability instead quietly hands the losing side nothing for a draw.
// ---------------------------------------------------------------------------

describe('winLossValue', () => {
  it('is the win probability less the loss probability', () => {
    // Nothing can end without a result, so it is the familiar doubling.
    expect(blackWinLossValue({ blackWinProb: 0.75, blackNoResultProb: 0 })).toBeCloseTo(0.5, 12);
    expect(blackWinLossValue({ blackWinProb: 0.5, blackNoResultProb: 0 })).toBeCloseTo(0, 12);
  });

  it('splits a no-result evenly rather than counting it as a loss', () => {
    // Black wins two games in five, loses two, and the fifth ends in nothing. That
    // is an even position, and the reported winrate should say so.
    const value = blackWinLossValue({ blackWinProb: 0.4, blackNoResultProb: 0.2 });
    expect(value).toBeCloseTo(0, 12);
    expect(0.5 + 0.5 * value).toBeCloseTo(0.5, 12);
    // Reporting the win probability alone would have called this 0.4.
    expect(0.4).not.toBeCloseTo(0.5, 3);
  });

  it('still leans the way the probabilities do', () => {
    expect(blackWinLossValue({ blackWinProb: 0.5, blackNoResultProb: 0.2 })).toBeCloseTo(0.2, 12);
    expect(blackWinLossValue({ blackWinProb: 0.3, blackNoResultProb: 0.2 })).toBeCloseTo(-0.2, 12);
  });
});

describe.skipIf(!hasModel())('the winrate the engine reports', () => {
  it('is the one KataGo would report, not the raw win probability', async () => {
    setBoardSize(19);
    const model = await loadHarnessModel();
    const board = emptyBoard(19);
    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 10,
      ownershipMode: 'root',
      wideRootNoise: 0,
      ignorePreRootHistory: false,
    });
    const reported = search.getAnalysis({ topK: 1, analysisPvLen: 0 });
    const raw = await rawEval({ board, currentPlayer: 'black', komi: 6.5, rules: 'japanese' });

    // 0.5 + 0.5 * (win - loss), which is the win probability plus half the chance of
    // no result. The two agree to the last bit the network offers.
    expect(reported.rawWinRate).toBeCloseTo(raw.blackWinProb + raw.blackNoResultProb / 2, 6);
    expect(reported.rawNoResultProb).toBeCloseTo(raw.blackNoResultProb, 9);
    // The distinction is real even here, where the chance is small.
    expect(reported.rawWinRate).not.toBe(raw.blackWinProb);
  }, 120000);
});

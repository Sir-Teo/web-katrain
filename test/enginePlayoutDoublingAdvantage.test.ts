import { describe, expect, it } from 'vitest';
import { boardFromDiagram, hasModel, rawEval } from './helpers/engineHarness';
import { fillInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { setBoardSize } from '../src/engine/katago/fastBoard';

// ---------------------------------------------------------------------------
// playoutDoublingAdvantage (KataGo's handicap knob).
//
// The net takes it as two global inputs: a flag and half the value, both signed
// for the side to move. Getting the channel indices or the sign wrong produces
// evaluations that look plausible and are wrong, so this pins both the encoding
// (against KataGo's fillRowV7) and its effect on a real evaluation.
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

describe('playoutDoublingAdvantage inputs', () => {
  it('writes KataGo\'s global channels 15 and 16', () => {
    setBoardSize(9);
    const global = new Float32Array(19);
    const spatial = new Float32Array(9 * 9 * 22);
    const fill = (pda: number) => {
      global.fill(0);
      fillInputsV7Fast({
        stones: new Uint8Array(9 * 9),
        koPoint: -1,
        currentPlayer: 'black',
        recentMoves: [],
        komi: 7.5,
        rules: 'chinese',
        playoutDoublingAdvantage: pda,
        outSpatial: spatial,
        outGlobal: global,
      });
      return Array.from(global);
    };

    // KataGo: rowGlobal[15] = 1, rowGlobal[16] = 0.5 * pda, and nothing at all when zero.
    expect(fill(0)[15]).toBe(0);
    expect(fill(0)[16]).toBe(0);
    expect(fill(2)[15]).toBe(1);
    expect(fill(2)[16]).toBeCloseTo(1.0, 6);
    expect(fill(-3)[15]).toBe(1);
    expect(fill(-3)[16]).toBeCloseTo(-1.5, 6);
  });
});

describe.skipIf(!hasModel())('playoutDoublingAdvantage evaluation', () => {
  it('shifts the evaluation toward the side it is given to', async () => {
    const board = boardFromDiagram(MID9);
    const base = await rawEval({ board, currentPlayer: 'black', komi: 7.5, rules: 'chinese' });
    // Signed for the side to move: positive favours black here, negative white.
    const forBlack = await rawEval({
      board,
      currentPlayer: 'black',
      komi: 7.5,
      rules: 'chinese',
      playoutDoublingAdvantage: 3,
    });
    const forWhite = await rawEval({
      board,
      currentPlayer: 'black',
      komi: 7.5,
      rules: 'chinese',
      playoutDoublingAdvantage: -3,
    });

    expect(forBlack.blackScoreLead).toBeGreaterThan(base.blackScoreLead);
    expect(forWhite.blackScoreLead).toBeLessThan(base.blackScoreLead);
    expect(forBlack.blackWinProb).toBeGreaterThan(forWhite.blackWinProb);
  }, 60_000);

  it('changes nothing when it is zero', async () => {
    const board = boardFromDiagram(MID9);
    const base = await rawEval({ board, currentPlayer: 'black', komi: 7.5, rules: 'chinese' });
    const zero = await rawEval({
      board,
      currentPlayer: 'black',
      komi: 7.5,
      rules: 'chinese',
      playoutDoublingAdvantage: 0,
    });
    expect(zero.blackScoreLead).toBeCloseTo(base.blackScoreLead, 6);
    expect(zero.blackWinProb).toBeCloseTo(base.blackWinProb, 6);
  }, 60_000);
});

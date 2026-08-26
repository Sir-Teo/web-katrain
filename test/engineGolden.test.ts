import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';

import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import { postprocessKataGoV8 } from '../src/engine/katago/evalV8';
import { fillInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import {
  BLACK,
  BOARD_AREA,
  WHITE,
  computeAreaMapV7KataGo,
  computeLadderFeaturesV7KataGo,
  computeLadderedStonesV7KataGo,
  setBoardSize,
} from '../src/engine/katago/fastBoard';

// ---------------------------------------------------------------------------
// Ground truth from KataGo itself.
//
// cpp/tests/results/runNNOnTinyBoardTest.txt in the KataGo repo is the recorded
// output of real KataGo running g170-b6c96-s175395328-d26788732 -- the exact model
// this repo ships as public/models/katago-small.bin.gz -- on a 5x5 board, white to
// play, Tromp-Taylor rules, komi 7.5, no move history, default symmetry 3.
//
//   .....
//   ...x.
//   ..o..
//   .xxo.
//   .....
//
// Every reference number below is from WHITE's perspective, as KataGo prints it.
// If this test drifts, something in the model parser, the network graph, the input
// planes or the value post-processing has changed meaning.
// ---------------------------------------------------------------------------

const REF = {
  win: 0.9025,
  loss: 0.0975,
  noResult: 0.0,
  scoreMean: 9.37,
  scoreMeanSq: 242.9,
  lead: 7.87,
  /** Permille, row-major from the top row. -1 marks an occupied point. */
  policy: [
    [0, 0, 0, 0, 0],
    [0, 3, 150, -1, 0],
    [0, 237, -1, 607, 0],
    [0, -1, -1, -1, 0],
    [0, 0, 0, 1, 0],
  ],
  pass: 0,
  /** Permille, white-positive. */
  ownership: [
    [-21, -257, 64, -419, 121],
    [-129, -354, -489, -148, 241],
    [-341, -367, -294, 46, 292],
    [-322, -457, -80, 559, 277],
    [-247, -395, -127, -132, 91],
  ],
};

const DIAGRAM = ['.....', '...x.', '..o..', '.xxo.', '.....'];
const SIZE = 5;
/** The symmetry KataGo's recorded run used. Bit 0 = flip Y, bit 1 = flip X, bit 2 = transpose. */
const GOLDEN_SYMMETRY = 3;

function symPoint(x: number, y: number, n: number, sym: number): [number, number] {
  let px = x;
  let py = y;
  if (sym & 1) py = n - 1 - py;
  if (sym & 2) px = n - 1 - px;
  if (sym & 4) {
    const t = px;
    px = py;
    py = t;
  }
  return [px, py];
}

describe.skipIf(!hasModel())('KataGo golden reference', () => {
  it('reproduces KataGo raw NN output for the shipped model', async () => {
    const model = await loadHarnessModel();
    expect(model.modelVersion).toBe(8);
    setBoardSize(SIZE);

    const stones = new Uint8Array(BOARD_AREA);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = DIAGRAM[y]![x]!;
        stones[y * SIZE + x] = ch === 'x' ? BLACK : ch === 'o' ? WHITE : 0;
      }
    }

    const baseSpatial = new Float32Array(BOARD_AREA * 22);
    const global = new Float32Array(19);
    const ladder = computeLadderFeaturesV7KataGo({ stones, koPoint: -1, currentPlayer: WHITE });
    const prevLaddered = computeLadderedStonesV7KataGo({ stones, koPoint: -1 });

    fillInputsV7Fast({
      stones,
      koPoint: -1,
      currentPlayer: 'white',
      recentMoves: [],
      komi: 7.5,
      // Tromp-Taylor is area scoring with no tax, which matches our 'chinese' preset
      // for planes 18/19 and globals 9/10.
      rules: 'chinese',
      conservativePassAndIsRoot: false,
      areaMap: computeAreaMapV7KataGo(stones, true),
      ladderedStones: ladder.ladderedStones,
      ladderWorkingMoves: ladder.ladderWorkingMoves,
      prevLadderedStones: prevLaddered,
      prevPrevLadderedStones: prevLaddered,
      outSpatial: baseSpatial,
      outGlobal: global,
    });

    // Tromp-Taylor differs from our 'chinese' preset only in ko rule and suicide,
    // which the app's GameRules union cannot express. Set those globals directly.
    global[6] = 1.0; // positional superko
    global[7] = 0.5;
    global[8] = 1.0; // multi-stone suicide legal

    const spatial = new Float32Array(BOARD_AREA * 22);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [tx, ty] = symPoint(x, y, SIZE, GOLDEN_SYMMETRY);
        for (let c = 0; c < 22; c++) spatial[(ty * SIZE + tx) * 22 + c] = baseSpatial[(y * SIZE + x) * 22 + c]!;
      }
    }

    const spatialTensor = tf.tensor4d(spatial, [1, SIZE, SIZE, 22]);
    const globalTensor = tf.tensor2d(global, [1, 19]);
    const out = model.forward(spatialTensor, globalTensor);
    const [policyArr, passArr, valueArr, scoreArr, ownershipArr] = await Promise.all([
      out.policy.data(),
      out.policyPass.data(),
      out.value.data(),
      out.scoreValue.data(),
      out.ownership.data(),
    ]);
    spatialTensor.dispose();
    globalTensor.dispose();
    out.policy.dispose();
    out.policyPass.dispose();
    out.value.dispose();
    out.scoreValue.dispose();
    out.ownership.dispose();

    const evaled = postprocessKataGoV8({
      nextPlayer: 'white',
      valueLogits: valueArr,
      scoreValue: scoreArr,
      postProcessParams: model.postProcessParams,
    });

    // Our numbers are black-perspective; KataGo prints white-perspective.
    const whiteWin = 1 - evaled.blackWinProb - evaled.blackNoResultProb;
    const whiteScoreMean = -evaled.blackScoreMean;
    const whiteLead = -evaled.blackScoreLead;
    const whiteScoreMeanSq = whiteScoreMean * whiteScoreMean + evaled.blackScoreStdev * evaled.blackScoreStdev;

    // These bands were set from what the deviation actually is, not from what felt
    // safe. Measured against the values above: win 2.4e-4, no-result 2.7e-4, score
    // mean 5.6e-3, lead 4.5e-3, score mean square 5e-5 -- and KataGo printed its
    // numbers rounded, which accounts for a part of even that. The bands allow
    // roughly four times the observed error. They used to allow twenty times it,
    // which would have let a real regression through: a tenth of a percent of
    // winrate is worth catching, and a whole half percent went unnoticed.
    expect(Math.abs(whiteWin - REF.win)).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(evaled.blackNoResultProb - REF.noResult)).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(whiteScoreMean - REF.scoreMean)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(whiteLead - REF.lead)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(whiteScoreMeanSq - REF.scoreMeanSq)).toBeLessThanOrEqual(0.05);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [tx, ty] = symPoint(x, y, SIZE, GOLDEN_SYMMETRY);
        const permille = Math.round(Math.tanh((ownershipArr as Float32Array)[ty * SIZE + tx]!) * 1000);
        expect(Math.abs(permille - REF.ownership[y]![x]!), `ownership at ${x},${y}`).toBeLessThanOrEqual(3);
      }
    }

    const channels = model.policyOutChannels;
    const logits = new Float32Array(BOARD_AREA + 1);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [tx, ty] = symPoint(x, y, SIZE, GOLDEN_SYMMETRY);
        logits[y * SIZE + x] = (policyArr as Float32Array)[(ty * SIZE + tx) * channels]!;
      }
    }
    logits[BOARD_AREA] = (passArr as Float32Array)[0]!;
    let max = -Infinity;
    for (let i = 0; i <= BOARD_AREA; i++) {
      if (i < BOARD_AREA && stones[i] !== 0) continue;
      if (logits[i]! > max) max = logits[i]!;
    }
    let sum = 0;
    const probs = new Float32Array(BOARD_AREA + 1);
    for (let i = 0; i <= BOARD_AREA; i++) {
      if (i < BOARD_AREA && stones[i] !== 0) continue;
      probs[i] = Math.exp(logits[i]! - max);
      sum += probs[i]!;
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (REF.policy[y]![x]! < 0) continue;
        const permille = Math.round((probs[y * SIZE + x]! / sum) * 1000);
        expect(Math.abs(permille - REF.policy[y]![x]!), `policy at ${x},${y}`).toBeLessThanOrEqual(2);
      }
    }
    expect(Math.round((probs[BOARD_AREA]! / sum) * 1000)).toBe(REF.pass);
  }, 300000);
});

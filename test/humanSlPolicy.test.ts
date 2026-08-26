import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { parseKataGoModelV8 } from '../src/engine/katago/loadModelV8';
import { KataGoModelV8Tf } from '../src/engine/katago/modelV8';
import { fillInputsV7FastForPosition } from '../src/engine/katago/positionInputsV7';
import { BOARD_AREA, BOARD_SIZE, setBoardSize } from '../src/engine/katago/fastBoard';
import {
  fillHumanSlMetadataRow,
  humanSlMetadataRow,
  humanSlProfileToMetadata,
  inverseRankOf,
} from '../src/engine/katago/humanSlProfile';
import { boardFromDiagram } from './helpers/engineHarness';

// ---------------------------------------------------------------------------
// Human SL support.
//
// KataGo 1.15 added a net trained on human games that predicts how a player of a
// given rank would move, selected by a metadata row (rank, time control, date,
// server) fed alongside the board. The profile encoding is a port of
// cpp/neuralnet/sgfmetadata.cpp; the tests that need the 99MB net itself only run
// when it has been fetched into .external.
// ---------------------------------------------------------------------------

const HUMAN_MODEL = path.resolve(__dirname, '../.external/katago-human-model.bin.gz');

describe('human SL profiles', () => {
  it('maps ranks the way KataGo does', () => {
    expect(inverseRankOf('9d')).toBe(1);
    expect(inverseRankOf('1d')).toBe(9);
    expect(inverseRankOf('1k')).toBe(10);
    expect(inverseRankOf('20k')).toBe(29);
    expect(inverseRankOf('30k')).toBe(-1);
  });

  it('reads the rank, preaz and proyear profile forms', () => {
    const rank = humanSlProfileToMetadata('rank_5k')!;
    expect(rank.inverseBRank).toBe(14);
    expect(rank.inverseWRank).toBe(14);
    expect(rank.gameDate).toEqual({ year: 2020, month: 3, day: 1 });
    expect(rank.tcIsByoYomi).toBe(true);

    const preaz = humanSlProfileToMetadata('preaz_5k')!;
    expect(preaz.gameDate).toEqual({ year: 2016, month: 9, day: 1 });

    const pro = humanSlProfileToMetadata('proyear_1950')!;
    expect(pro.inverseBRank).toBe(1);
    expect(pro.tcIsUnknown).toBe(true);
    expect(pro.source).toBe(5); // GoGoD
    expect(humanSlProfileToMetadata('proyear_2022')!.source).toBe(6); // Go4Go

    const asymmetric = humanSlProfileToMetadata('rank_3d_5k')!;
    expect(asymmetric.inverseBRank).toBe(7);
    expect(asymmetric.inverseWRank).toBe(14);
  });

  it('rejects profiles KataGo would not accept', () => {
    expect(humanSlProfileToMetadata('')).toBeNull();
    expect(humanSlProfileToMetadata('rank_40k')).toBeNull();
    expect(humanSlProfileToMetadata('proyear_1700')).toBeNull();
    expect(humanSlProfileToMetadata('nonsense')).toBeNull();
  });

  it('encodes the metadata row the way fillMetadataRow does', () => {
    const meta = humanSlProfileToMetadata('rank_5k')!;
    const row = fillHumanSlMetadataRow({ meta, nextPlayer: 'black', boardArea: 361 });
    expect(row.length).toBe(192);
    expect(row[0]).toBe(1); // player is human
    expect(row[1]).toBe(1); // opponent is human
    // 5k is inverse rank 14: fourteen ones in each player's rank block.
    expect(Array.from(row.slice(6, 6 + 34)).filter((v) => v === 1)).toHaveLength(14);
    expect(Array.from(row.slice(40, 40 + 34)).filter((v) => v === 1)).toHaveLength(14);
    expect(row[74]).toBe(0.5); // ratedness unknown
    expect(row[79]).toBe(1); // byo-yomi
    expect(row[82]).toBeCloseTo(0.4 * (Math.log(1200 + 60) - 6.5), 6);
    expect(row[84]).toBeCloseTo(0.5 * (Math.log(5 + 2) - 1.5), 6);
    expect(row[86]).toBeCloseTo(0, 9); // 19x19 is the reference board size
    expect(row[151 + 2]).toBe(1); // KGS source
    // The date bank is a unit circle per period.
    for (let i = 0; i < 32; i++) {
      const c = row[87 + i * 2]!;
      const s = row[87 + i * 2 + 1]!;
      expect(c * c + s * s).toBeCloseTo(1, 6);
    }
  });

  it('swaps the two players\' ranks when white is to move', () => {
    const meta = humanSlProfileToMetadata('rank_3d_5k')!;
    const black = fillHumanSlMetadataRow({ meta, nextPlayer: 'black', boardArea: 361 });
    const white = fillHumanSlMetadataRow({ meta, nextPlayer: 'white', boardArea: 361 });
    expect(Array.from(black.slice(6, 40)).filter((v) => v === 1)).toHaveLength(7); // 3d
    expect(Array.from(white.slice(6, 40)).filter((v) => v === 1)).toHaveLength(14); // 5k
  });

  it('scales the board size feature', () => {
    const row = humanSlMetadataRow({ profile: 'rank_1d', nextPlayer: 'black', boardArea: 81 })!;
    expect(row[86]).toBeCloseTo(0.5 * Math.log(81 / 361), 6);
  });
});

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

async function humanPolicy(profile: string): Promise<Float32Array> {
  const raw = zlib.gunzipSync(fs.readFileSync(HUMAN_MODEL));
  const model = new KataGoModelV8Tf(parseKataGoModelV8(new Uint8Array(raw)));
  setBoardSize(9);
  const spatial = new Float32Array(BOARD_AREA * 22);
  const global = new Float32Array(19);
  fillInputsV7FastForPosition({
    board: boardFromDiagram(MID9),
    currentPlayer: 'black',
    moveHistory: [],
    komi: 6.5,
    rules: 'japanese',
    conservativePassAndIsRoot: true,
    outSpatial: spatial,
    outGlobal: global,
  });
  const meta = humanSlMetadataRow({ profile, nextPlayer: 'black', boardArea: BOARD_AREA })!;

  const spatialTensor = tf.tensor4d(spatial, [1, BOARD_SIZE, BOARD_SIZE, 22]);
  const globalTensor = tf.tensor2d(global, [1, 19]);
  const metaTensor = tf.tensor2d(meta, [1, 192]);
  const out = model.forwardPolicyValue(spatialTensor, globalTensor, metaTensor);
  const [policyArr, passArr] = await Promise.all([out.policy.data(), out.policyPass.data()]);
  spatialTensor.dispose();
  globalTensor.dispose();
  metaTensor.dispose();
  out.policy.dispose();
  out.policyPass.dispose();
  out.value.dispose();
  out.scoreValue.dispose();

  const channels = model.policyOutChannels;
  const logits = new Float32Array(BOARD_AREA + 1);
  for (let p = 0; p < BOARD_AREA; p++) logits[p] = (policyArr as Float32Array)[p * channels]!;
  logits[BOARD_AREA] = (passArr as Float32Array)[0]!;
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  let sum = 0;
  const probs = new Float32Array(BOARD_AREA + 1);
  for (let i = 0; i < probs.length; i++) {
    probs[i] = Math.exp(logits[i]! - max);
    sum += probs[i]!;
  }
  for (let i = 0; i < probs.length; i++) probs[i]! /= sum;
  return probs;
}

const EMPTY19 = Array.from({ length: 19 }, () => '.'.repeat(19)).join('\n');

/** Top policy move on the empty 19x19 board for a profile, as "x,y". */
async function topOpeningMove(profile: string): Promise<{ x: number; y: number }> {
  const raw = zlib.gunzipSync(fs.readFileSync(HUMAN_MODEL));
  const model = new KataGoModelV8Tf(parseKataGoModelV8(new Uint8Array(raw)));
  setBoardSize(19);
  const spatial = new Float32Array(BOARD_AREA * 22);
  const global = new Float32Array(19);
  fillInputsV7FastForPosition({
    board: boardFromDiagram(EMPTY19),
    currentPlayer: 'black',
    moveHistory: [],
    komi: 7.5,
    rules: 'chinese',
    conservativePassAndIsRoot: true,
    outSpatial: spatial,
    outGlobal: global,
  });
  const meta = humanSlMetadataRow({ profile, nextPlayer: 'black', boardArea: BOARD_AREA })!;
  const spatialTensor = tf.tensor4d(spatial, [1, BOARD_SIZE, BOARD_SIZE, 22]);
  const globalTensor = tf.tensor2d(global, [1, 19]);
  const metaTensor = tf.tensor2d(meta, [1, 192]);
  const out = model.forwardPolicyValue(spatialTensor, globalTensor, metaTensor);
  const policyArr = (await out.policy.data()) as Float32Array;
  spatialTensor.dispose();
  globalTensor.dispose();
  metaTensor.dispose();
  out.policy.dispose();
  out.policyPass.dispose();
  out.value.dispose();
  out.scoreValue.dispose();

  const channels = model.policyOutChannels;
  let bestPos = -1;
  let bestLogit = -Infinity;
  for (let p = 0; p < BOARD_AREA; p++) {
    const v = policyArr[p * channels]!;
    if (v > bestLogit) {
      bestLogit = v;
      bestPos = p;
    }
  }
  return { x: bestPos % BOARD_SIZE, y: (bestPos / BOARD_SIZE) | 0 };
}

describe.skipIf(!fs.existsSync(HUMAN_MODEL))('human SL network', () => {
  it('produces a usable move distribution and reacts to the rank', async () => {
    await tf.setBackend('cpu');
    await tf.ready();

    const weak = await humanPolicy('rank_15k');
    const strong = await humanPolicy('rank_9d');

    for (const probs of [weak, strong]) {
      let sum = 0;
      let best = -1;
      let bestProb = -1;
      for (let i = 0; i < probs.length; i++) {
        expect(probs[i]!).toBeGreaterThanOrEqual(0);
        sum += probs[i]!;
        if (probs[i]! > bestProb) {
          bestProb = probs[i]!;
          best = i;
        }
      }
      expect(sum).toBeCloseTo(1, 5);
      expect(best).toBeGreaterThanOrEqual(0);
      expect(bestProb).toBeGreaterThan(0.01);
    }

    // The whole point of the net: a 15 kyu and a 9 dan do not play alike.
    let totalVariation = 0;
    for (let i = 0; i < weak.length; i++) totalVariation += Math.abs(weak[i]! - strong[i]!);
    expect(totalVariation / 2).toBeGreaterThan(0.05);
  }, 600000);

  it('opens like its era: 3-4 points in 1900, 4-4 points today', async () => {
    await tf.setBackend('cpu');
    await tf.ready();

    // The date features are most of what tells the net which era to imitate, so a
    // wrong metadata encoding shows up here as an opening from the wrong century.
    const isStarPoint = (m: { x: number; y: number }) => [3, 15].includes(m.x) && [3, 15].includes(m.y);
    const isThreeFour = (m: { x: number; y: number }) =>
      ([2, 16].includes(m.x) && [3, 15].includes(m.y)) || ([3, 15].includes(m.x) && [2, 16].includes(m.y));

    const old = await topOpeningMove('proyear_1900');
    expect(isThreeFour(old)).toBe(true);

    const modern = await topOpeningMove('proyear_2020');
    expect(isStarPoint(modern)).toBe(true);
  }, 900000);
});

describe('human move inclusion', () => {
  it('keeps the human net\'s favourite moves as a mask', async () => {
    const { topHumanMovesMask } = await import('../src/engine/katago/analyzeMcts');
    setBoardSize(9);
    const policy = new Float32Array(BOARD_AREA + 1);
    policy.fill(-1);
    policy[10] = 0.4;
    policy[20] = 0.3;
    policy[30] = 0.2;
    policy[40] = 0.05;
    const mask = topHumanMovesMask(policy, 3)!;
    expect(Array.from(mask).filter((v) => v === 1)).toHaveLength(3);
    expect(mask[10]).toBe(1);
    expect(mask[20]).toBe(1);
    expect(mask[30]).toBe(1);
    expect(mask[40]).toBe(0);
  });

  it('returns nothing without a human policy', async () => {
    const { topHumanMovesMask } = await import('../src/engine/katago/analyzeMcts');
    setBoardSize(9);
    expect(topHumanMovesMask(null, 5)).toBeNull();
    expect(topHumanMovesMask(new Float32Array(BOARD_AREA + 1).fill(-1), 5)).toBeNull();
  });
});

describe.skipIf(!fs.existsSync(HUMAN_MODEL))('human moves in the search', () => {
  it('analyses the moves a human would play, even weak ones', async () => {
    await tf.setBackend('cpu');
    await tf.ready();
    setBoardSize(9);
    const { MctsSearch } = await import('../src/engine/katago/analyzeMcts');
    const { loadHarnessModel } = await import('./helpers/engineHarness');
    const model = await loadHarnessModel();

    // A policy that insists on one specific empty point: it must show up in the report.
    const insisted = 7 * BOARD_SIZE + 7;
    const humanPolicy = new Float32Array(BOARD_AREA);
    humanPolicy[insisted] = 1;

    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(MID9),
      currentPlayer: 'black',
      moveHistory: [],
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 6,
      ownershipMode: 'root',
      wideRootNoise: 0,
      humanPolicy,
      humanMoveCount: 1,
    });
    await search.run({ visits: 40, maxTimeMs: 120000, batchSize: 4 });
    const analysis = search.getAnalysis({ topK: 30, analysisPvLen: 1 });
    const found = analysis.moves.find((m) => m.y * BOARD_SIZE + m.x === insisted);
    expect(found).toBeDefined();
    expect(found!.visits).toBeGreaterThan(0);
  }, 300000);
});

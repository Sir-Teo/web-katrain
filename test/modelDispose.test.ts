import fs from 'node:fs';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import { parseKataGoModelV8 } from '../src/engine/katago/loadModelV8';
import { KataGoModelV8Tf } from '../src/engine/katago/modelV8';
import { hasModel, MODEL_PATH } from './helpers/engineHarness';

/**
 * The worker swaps networks when the user picks another model, another human
 * SL net, or another backend. Every swap relies on `dispose()` giving back all
 * of the old net's weights; a human net's metadata encoder used to be skipped.
 */
describe.skipIf(!hasModel())('model disposal', () => {
  const loadParsed = () => parseKataGoModelV8(new Uint8Array(zlib.gunzipSync(fs.readFileSync(MODEL_PATH))));

  it('frees every weight tensor, including a human net\'s metadata encoder', async () => {
    await tf.setBackend('cpu');
    await tf.ready();
    const parsed = loadParsed();
    const channels = parsed.trunk.trunkNumChannels;
    const matMul = (name: string, inChannels: number, outChannels: number) => ({
      name,
      inChannels,
      outChannels,
      weights: new Float32Array(inChannels * outChannels),
    });
    const bias = (name: string, n: number) => ({ name, channels: n, weights: new Float32Array(n) });
    const withMeta = {
      ...parsed,
      metaEncoderVersion: 1,
      metaEncoder: {
        numInputMetaChannels: 192,
        mul1: matMul('meta/mul1', 192, 8),
        bias1: bias('meta/bias1', 8),
        act1: 'relu' as const,
        mul2: matMul('meta/mul2', 8, 8),
        bias2: bias('meta/bias2', 8),
        act2: 'relu' as const,
        mul3: matMul('meta/mul3', 8, channels),
      },
    };

    const before = tf.memory().numTensors;
    const plain = new KataGoModelV8Tf(parsed);
    plain.dispose();
    expect(tf.memory().numTensors).toBe(before);

    const human = new KataGoModelV8Tf(withMeta);
    expect(tf.memory().numTensors).toBeGreaterThan(before);
    human.dispose();
    expect(tf.memory().numTensors).toBe(before);
  }, 60000);
});

describe('worker model replacement', () => {
  const source = fs.readFileSync('src/engine/katago/worker.ts', 'utf8');

  it('disposes the previous human net before installing a new one', () => {
    const load = source.slice(source.indexOf('async function ensureHumanModel'));
    const disposeAt = load.indexOf('disposeHumanModel();');
    const createAt = load.indexOf('humanModel = new KataGoModelV8Tf(parsed);');
    expect(disposeAt).toBeGreaterThan(-1);
    expect(disposeAt).toBeLessThan(createAt);
  });

  it('drops both networks when the backend changes', () => {
    const body = source.slice(source.indexOf('async function ensureBackend'), source.indexOf('async function warmupModel'));
    expect(body).toContain('model?.dispose();');
    expect(body).toContain('disposeHumanModel();');
  });
});

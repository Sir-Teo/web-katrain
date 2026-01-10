/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import '@tensorflow/tfjs-backend-wasm';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import pako from 'pako';

import type { KataGoWorkerRequest, KataGoWorkerResponse } from './types';
import { parseKataGoModelV8 } from './loadModelV8';
import { KataGoModelV8Tf } from './modelV8';
import { analyzeMcts } from './analyzeMcts';

let model: KataGoModelV8Tf | null = null;
let loadedModelName: string | undefined;
let loadedModelUrl: string | null = null;
let backendPromise: Promise<void> | null = null;
let queue: Promise<void> = Promise.resolve();

async function initBackend(): Promise<void> {
  try {
    await tf.setBackend('webgpu');
    await tf.ready();
    return;
  } catch {
    // Fall back to CPU if WebGPU isn't available in this environment.
  }

  try {
    // Vite serves `public/` at the site root.
    setWasmPaths('/tfjs/');
    await tf.setBackend('wasm');
    await tf.ready();
    return;
  } catch {
    // Fall through.
  }

  await tf.setBackend('cpu');
  await tf.ready();
}

function maybeUngzip(data: Uint8Array): Uint8Array {
  // gzip magic bytes 0x1f8b
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) return pako.ungzip(data);
  return data;
}

async function ensureBackend(): Promise<void> {
  if (!backendPromise) {
    backendPromise = initBackend()
      .then(() => {
        tf.enableProdMode();
      })
      .catch((err) => {
        backendPromise = null;
        throw err;
      });
  }
  await backendPromise;
}

async function ensureModel(modelUrl: string): Promise<void> {
  await ensureBackend();
  if (model && loadedModelUrl === modelUrl) return;

  const res = await fetch(modelUrl);
  if (!res.ok) throw new Error(`Failed to fetch model: ${res.status} ${res.statusText}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const data = maybeUngzip(buf);

  const parsed = parseKataGoModelV8(data);
  model?.dispose();
  model = new KataGoModelV8Tf(parsed);
  loadedModelName = parsed.modelName;
  loadedModelUrl = modelUrl;

  // Warmup compilation.
  const spatial = tf.zeros([1, 19, 19, 22], 'float32') as tf.Tensor4D;
  const global = tf.zeros([1, 19], 'float32') as tf.Tensor2D;
  const out = model.forwardValueOnly(spatial, global);
  await Promise.all([out.value.data(), out.scoreValue.data()]);
  spatial.dispose();
  global.dispose();
  out.value.dispose();
  out.scoreValue.dispose();
}

function post(msg: KataGoWorkerResponse) {
  self.postMessage(msg);
}

async function handleMessage(msg: KataGoWorkerRequest): Promise<void> {
  if (msg.type === 'katago:init') {
    await ensureModel(msg.modelUrl);
    post({
      type: 'katago:init_result',
      ok: true,
      backend: tf.getBackend(),
      modelName: loadedModelName,
    });
    return;
  }

  if (msg.type === 'katago:analyze') {
    await ensureModel(msg.modelUrl);
    if (!model) throw new Error('Model not loaded');

    const analysis = await analyzeMcts({
      model,
      board: msg.board,
      previousBoard: msg.previousBoard,
      previousPreviousBoard: msg.previousPreviousBoard,
      currentPlayer: msg.currentPlayer,
      moveHistory: msg.moveHistory,
      komi: msg.komi,
      topK: msg.topK,
      visits: msg.visits,
      maxTimeMs: msg.maxTimeMs,
      batchSize: msg.batchSize,
      maxChildren: msg.maxChildren,
    });

    post({
      type: 'katago:analyze_result',
      id: msg.id,
      ok: true,
      analysis,
    });
  }
}

self.onmessage = (ev: MessageEvent<KataGoWorkerRequest>) => {
  const msg = ev.data;
  queue = queue
    .then(() => handleMessage(msg))
    .catch((err: unknown) => {
      if (msg.type === 'katago:init') {
        post({
          type: 'katago:init_result',
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
      if (msg.type === 'katago:analyze') {
        post({
          type: 'katago:analyze_result',
          id: msg.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    });
};

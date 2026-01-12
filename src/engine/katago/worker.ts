/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import '@tensorflow/tfjs-backend-wasm';
import { setThreadsCount, setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import pako from 'pako';

import type { KataGoWorkerRequest, KataGoWorkerResponse } from './types';
import type { GameRules } from '../../types';
import { parseKataGoModelV8 } from './loadModelV8';
import { KataGoModelV8Tf } from './modelV8';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from './limits';
import { MctsSearch, type OwnershipMode } from './analyzeMcts';
import { extractInputsV7 } from './featuresV7';
import { postprocessKataGoV8 } from './evalV8';

let model: KataGoModelV8Tf | null = null;
let loadedModelName: string | undefined;
let loadedModelUrl: string | null = null;
let backendPromise: Promise<void> | null = null;
let queue: Promise<void> = Promise.resolve();

let search: MctsSearch | null = null;
let searchKey: {
  positionId: string;
  modelUrl: string;
  maxChildren: number;
  ownershipMode: OwnershipMode;
  komi: number;
  currentPlayer: 'black' | 'white';
  wideRootNoise: number;
  rules: GameRules;
  nnRandomize: boolean;
  conservativePass: boolean;
} | null = null;

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
    // Use a reasonable thread count for XNNPACK when cross-origin isolated (SharedArrayBuffer).
    // Without COOP/COEP headers, browsers disable threads and TFJS will fall back to single-threaded wasm.
    const isCrossOriginIsolated = (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
    if (isCrossOriginIsolated) {
      const hc = (globalThis as unknown as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency ?? 1;
      const numThreads = Math.max(1, Math.min(8, Math.floor(hc)));
      setThreadsCount(numThreads);
    }
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
  search = null;
  searchKey = null;

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

  if (msg.type === 'katago:eval') {
    await ensureModel(msg.modelUrl);
    if (!model) throw new Error('Model not loaded');

    const conservativePass = msg.conservativePass !== false;
    const rules: GameRules = msg.rules === 'chinese' ? 'chinese' : msg.rules === 'korean' ? 'korean' : 'japanese';

    const inputs = extractInputsV7({
      board: msg.board,
      currentPlayer: msg.currentPlayer,
      moveHistory: msg.moveHistory,
      komi: msg.komi,
      rules,
      conservativePassAndIsRoot: conservativePass,
    });

    const spatial = tf.tensor4d(inputs.spatial, [1, 19, 19, 22]);
    const global = tf.tensor2d(inputs.global, [1, 19]);
    const out = model.forwardValueOnly(spatial, global);
    const [valueLogitsArr, scoreValueArr] = await Promise.all([out.value.data(), out.scoreValue.data()]);
    spatial.dispose();
    global.dispose();
    out.value.dispose();
    out.scoreValue.dispose();

    const evaled = postprocessKataGoV8({
      nextPlayer: msg.currentPlayer,
      valueLogits: valueLogitsArr,
      scoreValue: scoreValueArr,
      postProcessParams: model.postProcessParams,
    });

    post({
      type: 'katago:eval_result',
      id: msg.id,
      ok: true,
      backend: tf.getBackend(),
      modelName: loadedModelName,
      eval: {
        rootWinRate: evaled.blackWinProb,
        rootScoreLead: evaled.blackScoreLead,
        rootScoreSelfplay: evaled.blackScoreMean,
        rootScoreStdev: evaled.blackScoreStdev,
      },
    });
    return;
  }

  if (msg.type === 'katago:analyze') {
    await ensureModel(msg.modelUrl);
    if (!model) throw new Error('Model not loaded');

    const maxVisits = Math.max(16, Math.min(msg.visits ?? 256, ENGINE_MAX_VISITS));
    const maxTimeMs = Math.max(25, Math.min(msg.maxTimeMs ?? 800, ENGINE_MAX_TIME_MS));
    const batchSize = Math.max(1, Math.min(msg.batchSize ?? (tf.getBackend() === 'webgpu' ? 16 : 4), 64));
    const maxChildren = Math.max(4, Math.min(msg.maxChildren ?? 64, 361));
    const topK = Math.max(1, Math.min(msg.topK ?? 10, 50));
    const ownershipMode: OwnershipMode = msg.ownershipMode ?? 'root';
    const includeMovesOwnership = msg.includeMovesOwnership === true;
    const analysisPvLen = Math.max(0, Math.min(msg.analysisPvLen ?? 15, 60));
    const wideRootNoise = Math.max(0, Math.min(msg.wideRootNoise ?? 0.04, 5));
    const rules: GameRules = msg.rules === 'chinese' ? 'chinese' : msg.rules === 'korean' ? 'korean' : 'japanese';
    const nnRandomize = msg.nnRandomize !== false;
    const conservativePass = msg.conservativePass !== false;

    const canReuse =
      msg.reuseTree === true &&
      typeof msg.positionId === 'string' &&
      !!search &&
      !!searchKey &&
      searchKey.positionId === msg.positionId &&
      searchKey.modelUrl === msg.modelUrl &&
      searchKey.maxChildren === maxChildren &&
      searchKey.ownershipMode === ownershipMode &&
      searchKey.komi === msg.komi &&
      searchKey.currentPlayer === msg.currentPlayer &&
      searchKey.wideRootNoise === wideRootNoise &&
      searchKey.rules === rules &&
      searchKey.nnRandomize === nnRandomize &&
      searchKey.conservativePass === conservativePass;

    if (!canReuse) {
      search = await MctsSearch.create({
        model,
        board: msg.board,
        previousBoard: msg.previousBoard,
        previousPreviousBoard: msg.previousPreviousBoard,
        currentPlayer: msg.currentPlayer,
        moveHistory: msg.moveHistory,
        komi: msg.komi,
        rules,
        nnRandomize,
        conservativePass,
        maxChildren,
        ownershipMode,
        wideRootNoise,
      });
      if (typeof msg.positionId === 'string') {
        searchKey = {
          positionId: msg.positionId,
          modelUrl: msg.modelUrl,
          maxChildren,
          ownershipMode,
          komi: msg.komi,
          currentPlayer: msg.currentPlayer,
          wideRootNoise,
          rules,
          nnRandomize,
          conservativePass,
        };
      } else {
        searchKey = null;
      }
    }

    await search!.run({ visits: maxVisits, maxTimeMs, batchSize });
    const analysis = search!.getAnalysis({ topK, includeMovesOwnership, analysisPvLen });

    post({
      type: 'katago:analyze_result',
      id: msg.id,
      ok: true,
      backend: tf.getBackend(),
      modelName: loadedModelName,
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
      if (msg.type === 'katago:eval') {
        post({
          type: 'katago:eval_result',
          id: msg.id,
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

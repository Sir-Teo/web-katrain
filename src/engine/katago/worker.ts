/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import '@tensorflow/tfjs-backend-wasm';
import { setThreadsCount, setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import pako from 'pako';

import type { KataGoAnalyzeRequest, KataGoWorkerRequest, KataGoWorkerResponse } from './types';
import type { BoardState, GameRules, Move, Player, RegionOfInterest } from '../../types';
import { parseKataGoModelV8 } from './loadModelV8';
import { KataGoModelV8Tf } from './modelV8';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from './limits';
import { MctsSearch, type OwnershipMode } from './analyzeMcts';
import { fillInputsV7Fast, type RecentMove } from './featuresV7Fast';
import {
  BLACK,
  BOARD_AREA,
  BOARD_SIZE,
  PASS_MOVE,
  WHITE,
  computeAreaMapV7KataGoInto,
  computeLadderFeaturesV7KataGoInto,
  computeLadderedStonesV7KataGoInto,
  computeLibertyMapInto,
  playMove,
  type SimPosition,
  type StoneColor,
} from './fastBoard';
import { postprocessKataGoV8 } from './evalV8';

let model: KataGoModelV8Tf | null = null;
let loadedModelName: string | undefined;
let loadedModelUrl: string | null = null;
let backendPromise: Promise<void> | null = null;
let queue: Promise<void> = Promise.resolve();

const V7_SPATIAL_STRIDE = BOARD_AREA * 22;
const V7_GLOBAL_STRIDE = 19;

const evalSpatialV7 = new Float32Array(V7_SPATIAL_STRIDE);
const evalGlobalV7 = new Float32Array(V7_GLOBAL_STRIDE);

const stonesScratch = new Uint8Array(BOARD_AREA);
const prevStonesScratch = new Uint8Array(BOARD_AREA);
const prevPrevStonesScratch = new Uint8Array(BOARD_AREA);

const koSimStonesScratch = new Uint8Array(BOARD_AREA);
const koSimPosScratch: SimPosition = { stones: koSimStonesScratch, koPoint: -1 };
const koCaptureStackScratch: number[] = [];

const libertyMapScratch = new Uint8Array(BOARD_AREA);
const areaMapScratch = new Uint8Array(BOARD_AREA);

const ladderedStonesScratch = new Uint8Array(BOARD_AREA);
const ladderWorkingMovesScratch = new Uint8Array(BOARD_AREA);
const prevLadderedStonesScratch = new Uint8Array(BOARD_AREA);
const prevPrevLadderedStonesScratch = new Uint8Array(BOARD_AREA);

let evalBatchCapacity = 0;
let evalBatchSpatialV7 = new Float32Array(0);
let evalBatchGlobalV7 = new Float32Array(0);

function regionKey(roi?: RegionOfInterest | null): string | null {
  if (!roi) return null;
  const xMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.xMin, roi.xMax)));
  const xMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.xMin, roi.xMax)));
  const yMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.yMin, roi.yMax)));
  const yMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.yMin, roi.yMax)));
  const isSinglePoint = xMin === xMax && yMin === yMax;
  const isWholeBoard = xMin === 0 && yMin === 0 && xMax === BOARD_SIZE - 1 && yMax === BOARD_SIZE - 1;
  if (isSinglePoint || isWholeBoard) return null;
  return `${xMin},${xMax},${yMin},${yMax}`;
}

function getEvalBatchBuffersV7(batch: number): { spatial: Float32Array; global: Float32Array } {
  if (batch > evalBatchCapacity) {
    evalBatchCapacity = batch;
    evalBatchSpatialV7 = new Float32Array(batch * V7_SPATIAL_STRIDE);
    evalBatchGlobalV7 = new Float32Array(batch * V7_GLOBAL_STRIDE);
  }
  return {
    spatial: evalBatchSpatialV7.subarray(0, batch * V7_SPATIAL_STRIDE),
    global: evalBatchGlobalV7.subarray(0, batch * V7_GLOBAL_STRIDE),
  };
}

function playerToColor(p: Player): StoneColor {
  return p === 'black' ? BLACK : WHITE;
}

function boardStateToStonesInto(board: BoardState, out: Uint8Array): void {
  out.fill(0);
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row = board[y];
    for (let x = 0; x < BOARD_SIZE; x++) {
      const v = row?.[x] ?? null;
      if (!v) continue;
      out[y * BOARD_SIZE + x] = v === 'black' ? BLACK : WHITE;
    }
  }
}

function movesToRecentMoves(moves: Move[]): RecentMove[] {
  const out = new Array<RecentMove>(moves.length);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!;
    out[i] = {
      move: m.x < 0 || m.y < 0 ? PASS_MOVE : m.y * BOARD_SIZE + m.x,
      player: m.player,
    };
  }
  return out;
}

function countHistoryTurnsIncluded(args: { recentMoves: RecentMove[]; currentPlayer: Player; conservativePassAndIsRoot: boolean }): number {
  const lastMove = args.recentMoves.length > 0 ? args.recentMoves[args.recentMoves.length - 1] : null;
  const passWouldEndGame = lastMove?.move === PASS_MOVE;
  if (args.conservativePassAndIsRoot && passWouldEndGame) return 0;

  const pla = args.currentPlayer;
  const opp = pla === 'black' ? 'white' : 'black';
  const expectedPlayers: Player[] = [opp, pla, opp, pla, opp];

  let included = 0;
  for (let i = 0; i < 5; i++) {
    const m = args.recentMoves[args.recentMoves.length - 1 - i];
    if (!m) break;
    if (m.player !== expectedPlayers[i]) break;
    included++;
  }
  return included;
}

function computeKoPointAfterMove(previousStones: Uint8Array, move: Move | null): number {
  if (!move || move.x < 0 || move.y < 0) return -1;

  koSimStonesScratch.set(previousStones);
  koSimPosScratch.koPoint = -1;
  koCaptureStackScratch.length = 0;

  try {
    playMove(koSimPosScratch, move.y * BOARD_SIZE + move.x, playerToColor(move.player), koCaptureStackScratch);
    return koSimPosScratch.koPoint;
  } catch {
    return -1;
  }
}

function fillInputsV7FastForPosition(args: {
  board: BoardState;
  previousBoard?: BoardState;
  previousPreviousBoard?: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  rules: GameRules;
  conservativePassAndIsRoot: boolean;
  outSpatial: Float32Array;
  outGlobal: Float32Array;
}): void {
  boardStateToStonesInto(args.board, stonesScratch);

  if (args.previousBoard) boardStateToStonesInto(args.previousBoard, prevStonesScratch);
  else prevStonesScratch.set(stonesScratch);

  if (args.previousPreviousBoard) boardStateToStonesInto(args.previousPreviousBoard, prevPrevStonesScratch);
  else prevPrevStonesScratch.set(prevStonesScratch);

  const lastMove = args.moveHistory.length > 0 ? args.moveHistory[args.moveHistory.length - 1]! : null;
  const prevMove = args.moveHistory.length >= 2 ? args.moveHistory[args.moveHistory.length - 2]! : null;

  const koPoint = args.previousBoard ? computeKoPointAfterMove(prevStonesScratch, lastMove) : -1;
  const prevKoPoint = args.previousPreviousBoard ? computeKoPointAfterMove(prevPrevStonesScratch, prevMove) : -1;
  const prevPrevKoPoint = -1;

  const recentMoves = movesToRecentMoves(args.moveHistory);
  const numTurnsOfHistoryIncluded = countHistoryTurnsIncluded({
    recentMoves,
    currentPlayer: args.currentPlayer,
    conservativePassAndIsRoot: args.conservativePassAndIsRoot,
  });

  const prevLadderStones = numTurnsOfHistoryIncluded < 1 ? stonesScratch : prevStonesScratch;
  const prevLadderKoPoint = numTurnsOfHistoryIncluded < 1 ? koPoint : prevKoPoint;

  const prevPrevLadderStones = numTurnsOfHistoryIncluded < 2 ? prevLadderStones : prevPrevStonesScratch;
  const prevPrevLadderKoPoint = numTurnsOfHistoryIncluded < 2 ? prevLadderKoPoint : prevPrevKoPoint;

  computeLibertyMapInto(stonesScratch, libertyMapScratch);
  if (args.rules === 'chinese') computeAreaMapV7KataGoInto(stonesScratch, areaMapScratch);

  computeLadderFeaturesV7KataGoInto({
    stones: stonesScratch,
    koPoint,
    currentPlayer: playerToColor(args.currentPlayer),
    outLadderedStones: ladderedStonesScratch,
    outLadderWorkingMoves: ladderWorkingMovesScratch,
  });
  computeLadderedStonesV7KataGoInto({
    stones: prevLadderStones,
    koPoint: prevLadderKoPoint,
    outLadderedStones: prevLadderedStonesScratch,
  });
  computeLadderedStonesV7KataGoInto({
    stones: prevPrevLadderStones,
    koPoint: prevPrevLadderKoPoint,
    outLadderedStones: prevPrevLadderedStonesScratch,
  });

  fillInputsV7Fast({
    stones: stonesScratch,
    koPoint,
    currentPlayer: args.currentPlayer,
    recentMoves,
    komi: args.komi,
    rules: args.rules,
    conservativePassAndIsRoot: args.conservativePassAndIsRoot,
    libertyMap: libertyMapScratch,
    areaMap: args.rules === 'chinese' ? areaMapScratch : undefined,
    ladderedStones: ladderedStonesScratch,
    prevLadderedStones: prevLadderedStonesScratch,
    prevPrevLadderedStones: prevPrevLadderedStonesScratch,
    ladderWorkingMoves: ladderWorkingMovesScratch,
    outSpatial: args.outSpatial,
    outGlobal: args.outGlobal,
  });
}

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
  roiKey: string | null;
} | null = null;
const latestAnalyzeByGroup = new Map<string, number>();
let interactiveToken = 0;
const analyzeMeta = new WeakMap<KataGoAnalyzeRequest, { analysisGroup: 'interactive' | 'background'; interactiveToken: number }>();

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

function post(msg: KataGoWorkerResponse, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) self.postMessage(msg, transfer);
  else self.postMessage(msg);
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

	    fillInputsV7FastForPosition({
	      board: msg.board,
	      previousBoard: msg.previousBoard,
	      previousPreviousBoard: msg.previousPreviousBoard,
	      currentPlayer: msg.currentPlayer,
	      moveHistory: msg.moveHistory,
	      komi: msg.komi,
	      rules,
	      conservativePassAndIsRoot: conservativePass,
	      outSpatial: evalSpatialV7,
	      outGlobal: evalGlobalV7,
	    });

    const spatial = tf.tensor4d(evalSpatialV7, [1, 19, 19, 22]);
    const global = tf.tensor2d(evalGlobalV7, [1, 19]);
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

  if (msg.type === 'katago:eval_batch') {
    await ensureModel(msg.modelUrl);
    if (!model) throw new Error('Model not loaded');

    const conservativePass = msg.conservativePass !== false;
    const rules: GameRules = msg.rules === 'chinese' ? 'chinese' : msg.rules === 'korean' ? 'korean' : 'japanese';

    const batch = msg.positions.length;
    if (batch <= 0) {
      post({
        type: 'katago:eval_batch_result',
        id: msg.id,
        ok: true,
        backend: tf.getBackend(),
        modelName: loadedModelName,
        evals: [],
      });
      return;
    }

    const { spatial: spatialBatch, global: globalBatch } = getEvalBatchBuffersV7(batch);

	    for (let i = 0; i < batch; i++) {
	      const pos = msg.positions[i]!;
	      fillInputsV7FastForPosition({
	        board: pos.board,
	        previousBoard: pos.previousBoard,
	        previousPreviousBoard: pos.previousPreviousBoard,
	        currentPlayer: pos.currentPlayer,
	        moveHistory: pos.moveHistory,
	        komi: pos.komi,
	        rules,
	        conservativePassAndIsRoot: conservativePass,
	        outSpatial: spatialBatch.subarray(i * V7_SPATIAL_STRIDE, (i + 1) * V7_SPATIAL_STRIDE),
	        outGlobal: globalBatch.subarray(i * V7_GLOBAL_STRIDE, (i + 1) * V7_GLOBAL_STRIDE),
	      });
	    }

    const spatial = tf.tensor4d(spatialBatch, [batch, 19, 19, 22]);
    const global = tf.tensor2d(globalBatch, [batch, 19]);
    const out = model.forwardValueOnly(spatial, global);
    const [valueLogitsArr, scoreValueArr] = await Promise.all([out.value.data(), out.scoreValue.data()]);
    spatial.dispose();
    global.dispose();
    out.value.dispose();
    out.scoreValue.dispose();

    const evals = new Array(batch);
    for (let i = 0; i < batch; i++) {
      const evaled = postprocessKataGoV8({
        nextPlayer: msg.positions[i]!.currentPlayer,
        valueLogits: valueLogitsArr.subarray(i * 3, i * 3 + 3),
        scoreValue: scoreValueArr.subarray(i * 4, i * 4 + 4),
        postProcessParams: model.postProcessParams,
      });
      evals[i] = {
        rootWinRate: evaled.blackWinProb,
        rootScoreLead: evaled.blackScoreLead,
        rootScoreSelfplay: evaled.blackScoreMean,
        rootScoreStdev: evaled.blackScoreStdev,
      };
    }

    post({
      type: 'katago:eval_batch_result',
      id: msg.id,
      ok: true,
      backend: tf.getBackend(),
      modelName: loadedModelName,
      evals,
    });
    return;
  }

  if (msg.type === 'katago:analyze') {
    const meta = analyzeMeta.get(msg);
    const analysisGroup = meta?.analysisGroup ?? msg.analysisGroup ?? 'background';
    const interactiveTokenAtEnqueue = meta?.interactiveToken ?? interactiveToken;
    const isStale = () => latestAnalyzeByGroup.get(analysisGroup) !== msg.id;
    const isPreemptedByInteractive =
      analysisGroup !== 'interactive' && interactiveToken !== interactiveTokenAtEnqueue;
    const shouldAbort = () => isStale() || isPreemptedByInteractive;
    const postCanceled = () =>
      post({
        type: 'katago:analyze_result',
        id: msg.id,
        ok: false,
        canceled: true,
        error: 'canceled',
      });

    if (shouldAbort()) {
      postCanceled();
      return;
    }

    await ensureModel(msg.modelUrl);
    if (!model) throw new Error('Model not loaded');
    if (shouldAbort()) {
      postCanceled();
      return;
    }

    const maxVisits = Math.max(16, Math.min(msg.visits ?? 256, ENGINE_MAX_VISITS));
    const maxTimeMs = Math.max(25, Math.min(msg.maxTimeMs ?? 800, ENGINE_MAX_TIME_MS));
    const batchSize = Math.max(1, Math.min(msg.batchSize ?? (tf.getBackend() === 'webgpu' ? 16 : 4), 64));
    const maxChildren = Math.max(4, Math.min(msg.maxChildren ?? 64, 361));
    const topK = Math.max(1, Math.min(msg.topK ?? 10, 50));
    const includeMovesOwnership = msg.includeMovesOwnership === true;
    const requestedOwnershipMode: OwnershipMode = msg.ownershipMode ?? 'root';
    const ownershipMode: OwnershipMode = includeMovesOwnership ? 'tree' : requestedOwnershipMode;
    const analysisPvLen = Math.max(0, Math.min(msg.analysisPvLen ?? 15, 60));
    const wideRootNoise = Math.max(0, Math.min(msg.wideRootNoise ?? 0.04, 5));
    const rules: GameRules = msg.rules === 'chinese' ? 'chinese' : msg.rules === 'korean' ? 'korean' : 'japanese';
    const nnRandomize = msg.nnRandomize !== false;
    const conservativePass = msg.conservativePass !== false;
    const roiKey = regionKey(msg.regionOfInterest);

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
      searchKey.conservativePass === conservativePass &&
      searchKey.roiKey === roiKey;

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
        regionOfInterest: msg.regionOfInterest,
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
          roiKey,
        };
      } else {
        searchKey = null;
      }
    }

    const aborted = await search!.run({ visits: maxVisits, maxTimeMs, batchSize, shouldAbort });
    if (aborted || shouldAbort()) {
      postCanceled();
      if (msg.reuseTree !== true) {
        search = null;
        searchKey = null;
      }
      return;
    }
    const analysis = search!.getAnalysis({ topK, includeMovesOwnership, analysisPvLen, cloneBuffers: msg.reuseTree === true });

    const transfer: Transferable[] = [];
    const push = (value?: unknown) => {
      if (value && ArrayBuffer.isView(value)) transfer.push(value.buffer);
    };
    push(analysis.ownership);
    push(analysis.ownershipStdev);
    push(analysis.policy);
    for (const move of analysis.moves) push(move.ownership);

    post({
      type: 'katago:analyze_result',
      id: msg.id,
      ok: true,
      backend: tf.getBackend(),
      modelName: loadedModelName,
      analysis,
    }, transfer);

    if (msg.reuseTree !== true) {
      search = null;
      searchKey = null;
    }
  }
}

self.onmessage = (ev: MessageEvent<KataGoWorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'katago:analyze') {
    const analysisGroup = msg.analysisGroup ?? 'background';
    latestAnalyzeByGroup.set(analysisGroup, msg.id);
    if (analysisGroup === 'interactive') interactiveToken++;
    analyzeMeta.set(msg, { analysisGroup, interactiveToken });
  }
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
      if (msg.type === 'katago:eval_batch') {
        post({
          type: 'katago:eval_batch_result',
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

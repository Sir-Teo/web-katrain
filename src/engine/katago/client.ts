import type { KataGoWorkerRequest, KataGoWorkerResponse } from './types';
import type { BoardState, GameRules, Move, Player, RegionOfInterest } from '../../types';

type Analysis = NonNullable<Extract<KataGoWorkerResponse, { type: 'katago:analyze_result' }>['analysis']>;
type EvalResult = NonNullable<Extract<KataGoWorkerResponse, { type: 'katago:eval_result' }>['eval']>;
type EvalBatchResult = NonNullable<Extract<KataGoWorkerResponse, { type: 'katago:eval_batch_result' }>['evals']>;

const takeLastMoves = (moves: Move[]): Move[] => (moves.length <= 5 ? moves : moves.slice(moves.length - 5));

export class KataGoCanceledError extends Error {
  readonly canceled = true;

  constructor(message = 'Analysis canceled') {
    super(message);
    this.name = 'KataGoCanceledError';
  }
}

export const isKataGoCanceledError = (err: unknown): err is KataGoCanceledError => {
  if (!err || typeof err !== 'object') return false;
  if ((err as { canceled?: boolean }).canceled) return true;
  return err instanceof Error && err.name === 'KataGoCanceledError';
};

class KataGoEngineClient {
  private readonly worker: Worker;
  private nextId = 1;
  private pendingInit: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private pending = new Map<
    number,
    { resolve: (a: Analysis) => void; reject: (e: Error) => void; onProgress?: (a: Analysis) => void }
  >();
  private pendingEval = new Map<number, { resolve: (e: EvalResult) => void; reject: (e: Error) => void }>();
  private pendingEvalBatch = new Map<number, { resolve: (e: EvalBatchResult) => void; reject: (e: Error) => void }>();
  private backend: string | null = null;
  private modelName: string | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<KataGoWorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === 'katago:init_result') {
        const pendingInit = this.pendingInit;
        if (!pendingInit) return;
        this.pendingInit = null;
        if (msg.ok) {
          if (typeof msg.backend === 'string') this.backend = msg.backend;
          if (typeof msg.modelName === 'string') this.modelName = msg.modelName;
        }
        if (!msg.ok) pendingInit.reject(new Error(msg.error ?? 'Init failed'));
        else pendingInit.resolve();
        return;
      }
      if (msg.type === 'katago:analyze_update') {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        if (msg.canceled || msg.error === 'canceled') return;
        if (typeof msg.backend === 'string') this.backend = msg.backend;
        if (typeof msg.modelName === 'string') this.modelName = msg.modelName;
        if (!msg.ok || !msg.analysis) return;
        pending.onProgress?.(msg.analysis);
        return;
      }
      if (msg.type === 'katago:analyze_result') {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.canceled || msg.error === 'canceled') {
          pending.reject(new KataGoCanceledError());
          return;
        }
        if (typeof msg.backend === 'string') this.backend = msg.backend;
        if (typeof msg.modelName === 'string') this.modelName = msg.modelName;
        if (!msg.ok || !msg.analysis) pending.reject(new Error(msg.error ?? 'Analysis failed'));
        else pending.resolve(msg.analysis);
        return;
      }
      if (msg.type === 'katago:eval_result') {
        const pending = this.pendingEval.get(msg.id);
        if (!pending) return;
        this.pendingEval.delete(msg.id);
        if (typeof msg.backend === 'string') this.backend = msg.backend;
        if (typeof msg.modelName === 'string') this.modelName = msg.modelName;
        if (!msg.ok || !msg.eval) pending.reject(new Error(msg.error ?? 'Eval failed'));
        else pending.resolve(msg.eval);
        return;
      }
      if (msg.type === 'katago:eval_batch_result') {
        const pending = this.pendingEvalBatch.get(msg.id);
        if (!pending) return;
        this.pendingEvalBatch.delete(msg.id);
        if (typeof msg.backend === 'string') this.backend = msg.backend;
        if (typeof msg.modelName === 'string') this.modelName = msg.modelName;
        if (!msg.ok || !msg.evals) pending.reject(new Error(msg.error ?? 'Eval batch failed'));
        else pending.resolve(msg.evals);
      }
    };
  }

  getEngineInfo(): { backend: string | null; modelName: string | null } {
    return { backend: this.backend, modelName: this.modelName };
  }

  init(modelUrl: string): Promise<void> {
    if (this.pendingInit) return Promise.reject(new Error('Init already in progress'));
    return new Promise<void>((resolve, reject) => {
      this.pendingInit = { resolve, reject };
      const initMsg: KataGoWorkerRequest = { type: 'katago:init', modelUrl };
      this.worker.postMessage(initMsg);
    });
  }

  async analyze(args: {
    analysisGroup?: 'interactive' | 'background';
    positionId?: string;
    parentPositionId?: string;
    modelUrl: string;
    board: BoardState;
    previousBoard?: BoardState;
    previousPreviousBoard?: BoardState;
    currentPlayer: Player;
    moveHistory: Move[];
    komi: number;
    rules?: GameRules;
    regionOfInterest?: RegionOfInterest | null;
    topK?: number;
    analysisPvLen?: number;
    includeMovesOwnership?: boolean;
    wideRootNoise?: number;
    nnRandomize?: boolean;
    conservativePass?: boolean;
    visits?: number;
    maxTimeMs?: number;
    batchSize?: number;
    maxChildren?: number;
    reportDuringSearchEveryMs?: number;
    ownershipRefreshIntervalMs?: number;
    reuseTree?: boolean;
    ownershipMode?: 'none' | 'root' | 'tree';
    onProgress?: (analysis: Analysis) => void;
  }): Promise<Analysis> {
    const id = this.nextId++;
    const req: KataGoWorkerRequest = {
      type: 'katago:analyze',
      id,
      analysisGroup: args.analysisGroup,
      positionId: args.positionId,
      parentPositionId: args.parentPositionId,
      modelUrl: args.modelUrl,
      board: args.board,
      previousBoard: args.previousBoard,
      previousPreviousBoard: args.previousPreviousBoard,
      currentPlayer: args.currentPlayer,
      moveHistory: takeLastMoves(args.moveHistory),
      komi: args.komi,
      rules: args.rules,
      regionOfInterest: args.regionOfInterest,
      topK: args.topK,
      analysisPvLen: args.analysisPvLen,
      includeMovesOwnership: args.includeMovesOwnership,
      wideRootNoise: args.wideRootNoise,
      nnRandomize: args.nnRandomize,
      conservativePass: args.conservativePass,
      visits: args.visits,
      maxTimeMs: args.maxTimeMs,
      batchSize: args.batchSize,
      maxChildren: args.maxChildren,
      reportDuringSearchEveryMs: args.reportDuringSearchEveryMs,
      ownershipRefreshIntervalMs: args.ownershipRefreshIntervalMs,
      reuseTree: args.reuseTree,
      ownershipMode: args.ownershipMode,
    };
    const promise = new Promise<Analysis>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress: args.onProgress });
    });
    this.worker.postMessage(req);
    return promise;
  }

  async evaluate(args: {
    modelUrl: string;
    board: BoardState;
    previousBoard?: BoardState;
    previousPreviousBoard?: BoardState;
    currentPlayer: Player;
    moveHistory: Move[];
    komi: number;
    rules?: GameRules;
    conservativePass?: boolean;
  }): Promise<EvalResult> {
    const id = this.nextId++;
    const req: KataGoWorkerRequest = {
      type: 'katago:eval',
      id,
      modelUrl: args.modelUrl,
      board: args.board,
      previousBoard: args.previousBoard,
      previousPreviousBoard: args.previousPreviousBoard,
      currentPlayer: args.currentPlayer,
      moveHistory: takeLastMoves(args.moveHistory),
      komi: args.komi,
      rules: args.rules,
      conservativePass: args.conservativePass,
    };
    const promise = new Promise<EvalResult>((resolve, reject) => {
      this.pendingEval.set(id, { resolve, reject });
    });
    this.worker.postMessage(req);
    return promise;
  }

  async evaluateBatch(args: {
    modelUrl: string;
    positions: Array<{
      board: BoardState;
      previousBoard?: BoardState;
      previousPreviousBoard?: BoardState;
      currentPlayer: Player;
      moveHistory: Move[];
      komi: number;
    }>;
    rules?: GameRules;
    conservativePass?: boolean;
  }): Promise<EvalBatchResult> {
    const id = this.nextId++;
    const req: KataGoWorkerRequest = {
      type: 'katago:eval_batch',
      id,
      modelUrl: args.modelUrl,
      positions: args.positions.map((p) => ({
        board: p.board,
        previousBoard: p.previousBoard,
        previousPreviousBoard: p.previousPreviousBoard,
        currentPlayer: p.currentPlayer,
        moveHistory: takeLastMoves(p.moveHistory),
        komi: p.komi,
      })),
      rules: args.rules,
      conservativePass: args.conservativePass,
    };
    const promise = new Promise<EvalBatchResult>((resolve, reject) => {
      this.pendingEvalBatch.set(id, { resolve, reject });
    });
    this.worker.postMessage(req);
    return promise;
  }
}

let singleton: KataGoEngineClient | null = null;

export function getKataGoEngineClient(): KataGoEngineClient {
  if (!singleton) singleton = new KataGoEngineClient();
  return singleton;
}

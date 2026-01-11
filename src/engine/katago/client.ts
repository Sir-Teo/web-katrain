import type { KataGoWorkerRequest, KataGoWorkerResponse } from './types';
import type { BoardState, GameRules, Move, Player } from '../../types';

type Analysis = NonNullable<Extract<KataGoWorkerResponse, { type: 'katago:analyze_result' }>['analysis']>;

class KataGoEngineClient {
  private readonly worker: Worker;
  private nextId = 1;
  private pendingInit: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private pending = new Map<number, { resolve: (a: Analysis) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<KataGoWorkerResponse>) => {
      const msg = ev.data;
      if (msg.type === 'katago:init_result') {
        const pendingInit = this.pendingInit;
        if (!pendingInit) return;
        this.pendingInit = null;
        if (!msg.ok) pendingInit.reject(new Error(msg.error ?? 'Init failed'));
        else pendingInit.resolve();
        return;
      }
      if (msg.type === 'katago:analyze_result') {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (!msg.ok || !msg.analysis) pending.reject(new Error(msg.error ?? 'Analysis failed'));
        else pending.resolve(msg.analysis);
      }
    };
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
    positionId?: string;
    modelUrl: string;
    board: BoardState;
    previousBoard?: BoardState;
    previousPreviousBoard?: BoardState;
    currentPlayer: Player;
    moveHistory: Move[];
    komi: number;
    rules?: GameRules;
    topK?: number;
    analysisPvLen?: number;
    includeMovesOwnership?: boolean;
    wideRootNoise?: number;
    visits?: number;
    maxTimeMs?: number;
    batchSize?: number;
    maxChildren?: number;
    reuseTree?: boolean;
    ownershipMode?: 'root' | 'tree';
  }): Promise<Analysis> {
    const id = this.nextId++;
    const req: KataGoWorkerRequest = {
      type: 'katago:analyze',
      id,
      positionId: args.positionId,
      modelUrl: args.modelUrl,
      board: args.board,
      previousBoard: args.previousBoard,
      previousPreviousBoard: args.previousPreviousBoard,
      currentPlayer: args.currentPlayer,
      moveHistory: args.moveHistory,
      komi: args.komi,
      rules: args.rules,
      topK: args.topK,
      analysisPvLen: args.analysisPvLen,
      includeMovesOwnership: args.includeMovesOwnership,
      wideRootNoise: args.wideRootNoise,
      visits: args.visits,
      maxTimeMs: args.maxTimeMs,
      batchSize: args.batchSize,
      maxChildren: args.maxChildren,
      reuseTree: args.reuseTree,
      ownershipMode: args.ownershipMode,
    };
    const promise = new Promise<Analysis>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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

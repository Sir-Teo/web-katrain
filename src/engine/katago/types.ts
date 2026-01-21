import type { BoardState, FloatArray, GameRules, Move, Player, RegionOfInterest } from '../../types';

export interface KataGoInitRequest {
  type: 'katago:init';
  modelUrl: string;
}

export interface KataGoInitResponse {
  type: 'katago:init_result';
  ok: boolean;
  backend?: string;
  modelName?: string;
  error?: string;
}

export interface KataGoAnalyzeRequest {
  type: 'katago:analyze';
  id: number;
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
}

export interface KataGoAnalysisPayload {
  rootWinRate: number;
  rootScoreLead: number;
  rootScoreSelfplay: number;
  rootScoreStdev: number;
  rootVisits: number;
  ownership: FloatArray; // len 361, +1 black owns, -1 white owns
  ownershipStdev: FloatArray; // len 361
  policy: FloatArray; // len 362, illegal = -1, pass at index 361
  moves: Array<{
    x: number;
    y: number;
    winRate: number;
    winRateLost: number;
    scoreLead: number;
    scoreSelfplay: number;
    scoreStdev: number;
    visits: number;
    pointsLost: number;
    relativePointsLost: number;
    order: number;
    prior: number;
    pv: string[];
    ownership?: FloatArray; // len 361, +1 black owns, -1 white owns (position after this move)
  }>;
}

export interface KataGoAnalyzeUpdate {
  type: 'katago:analyze_update';
  id: number;
  ok: boolean;
  canceled?: boolean;
  backend?: string;
  modelName?: string;
  analysis?: KataGoAnalysisPayload;
  error?: string;
}

export interface KataGoAnalyzeResponse {
  type: 'katago:analyze_result';
  id: number;
  ok: boolean;
  canceled?: boolean;
  backend?: string;
  modelName?: string;
  analysis?: KataGoAnalysisPayload;
  error?: string;
}

export interface KataGoEvalRequest {
  type: 'katago:eval';
  id: number;
  modelUrl: string;
  board: BoardState;
  previousBoard?: BoardState;
  previousPreviousBoard?: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  rules?: GameRules;
  conservativePass?: boolean;
}

export interface KataGoEvalResponse {
  type: 'katago:eval_result';
  id: number;
  ok: boolean;
  backend?: string;
  modelName?: string;
  eval?: {
    rootWinRate: number;
    rootScoreLead: number;
    rootScoreSelfplay: number;
    rootScoreStdev: number;
  };
  error?: string;
}

export interface KataGoEvalBatchRequest {
  type: 'katago:eval_batch';
  id: number;
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
}

export interface KataGoEvalBatchResponse {
  type: 'katago:eval_batch_result';
  id: number;
  ok: boolean;
  backend?: string;
  modelName?: string;
  evals?: Array<{
    rootWinRate: number;
    rootScoreLead: number;
    rootScoreSelfplay: number;
    rootScoreStdev: number;
  }>;
  error?: string;
}

export type KataGoWorkerRequest = KataGoInitRequest | KataGoAnalyzeRequest | KataGoEvalRequest | KataGoEvalBatchRequest;
export type KataGoWorkerResponse =
  | KataGoInitResponse
  | KataGoAnalyzeUpdate
  | KataGoAnalyzeResponse
  | KataGoEvalResponse
  | KataGoEvalBatchResponse;

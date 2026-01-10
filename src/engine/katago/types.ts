import type { BoardState, Move, Player } from '../../types';

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
  positionId?: string;
  modelUrl: string;
  board: BoardState;
  previousBoard?: BoardState;
  previousPreviousBoard?: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  topK?: number;
  visits?: number;
  maxTimeMs?: number;
  batchSize?: number;
  maxChildren?: number;
  reuseTree?: boolean;
  ownershipMode?: 'root' | 'tree';
}

export interface KataGoAnalyzeResponse {
  type: 'katago:analyze_result';
  id: number;
  ok: boolean;
  analysis?: {
    rootWinRate: number;
    rootScoreLead: number;
    rootScoreSelfplay: number;
    rootScoreStdev: number;
    ownership: number[]; // len 361, +1 black owns, -1 white owns
    ownershipStdev: number[]; // len 361
    policy: number[]; // len 362, illegal = -1, pass at index 361
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
    }>;
  };
  error?: string;
}

export type KataGoWorkerRequest = KataGoInitRequest | KataGoAnalyzeRequest;
export type KataGoWorkerResponse = KataGoInitResponse | KataGoAnalyzeResponse;

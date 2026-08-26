import type { BoardState, FloatArray, GameRules, KataGoBackendPreference, Move, Player, RegionOfInterest } from '../../types';

export interface KataGoInitRequest {
  type: 'katago:init';
  modelUrl: string;
  backend?: KataGoBackendPreference;
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
  positionKey?: string;
  parentPositionKey?: string;
  modelUrl: string;
  backend?: KataGoBackendPreference;
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
  /** KataGo rootPolicyTemperature: above 1 flattens the root policy, widening the search. */
  rootPolicyTemperature?: number;
  nnRandomize?: boolean;
  conservativePass?: boolean;
  /** KataGo fillDameBeforePass: under territory scoring, don't pass while dame remain. */
  fillDameBeforePass?: boolean;
  visits?: number;
  maxTimeMs?: number;
  batchSize?: number;
  maxChildren?: number;
  reportDuringSearchEveryMs?: number;
  ownershipRefreshIntervalMs?: number;
  reuseTree?: boolean;
  ownershipMode?: 'none' | 'root' | 'tree';
  /** KataGo human SL net, used only to report how a human of a given rank would play. */
  humanModelUrl?: string;
  humanSlProfile?: string;
  /**
   * KataGo humanSLRootExploreProbWeightless: how often a playout leaves the root by
   * the human policy without the root being charged for it. 0 (KataGo's default)
   * leaves the search alone; its human-bot config uses 0.8.
   */
  humanSlRootExploreProb?: number;
  /**
   * KataGo avoidMoves: moves the search may not play until `untilDepth` plies from
   * the root. `untilDepth` defaults to 1, which bans the move at the root alone.
   * `player` defaults to whoever is to move.
   */
  avoidMoves?: Array<{ x: number; y: number; player?: Player; untilDepth?: number }>;
  /** KataGo allowMoves: the complement, at most one entry per player. */
  allowMoves?: Array<{ moves: Array<{ x: number; y: number }>; player?: Player; untilDepth?: number }>;
}

export interface KataGoAnalysisPayload {
  rootWinRate: number;
  rootScoreLead: number;
  rootScoreSelfplay: number;
  rootScoreStdev: number;
  rootVisits: number;
  // KataGo rootInfo's raw* fields: the network's own read, before any search.
  rawWinRate?: number;
  rawScoreLead?: number;
  rawScoreSelfplay?: number;
  rawScoreSelfplayStdev?: number;
  rawNoResultProb?: number;
  rawStWrError?: number; // -1 when the net does not predict it
  rawStScoreError?: number;
  ownership: FloatArray; // len 361, +1 black owns, -1 white owns
  ownershipStdev: FloatArray; // len 361
  policy: FloatArray; // len 362, illegal = -1, pass at index 361
  // Same shape as `policy`, from the human SL net for the requested profile.
  humanPolicy?: FloatArray;
  moves: Array<{
    x: number;
    y: number;
    winRate: number;
    winRateLost: number;
    scoreLead: number;
    scoreSelfplay: number;
    scoreStdev: number;
    visits: number;
    edgeVisits?: number; // what the parent paid for; visits can exceed it
    weight?: number;
    edgeWeight?: number;
    pointsLost: number;
    relativePointsLost: number;
    order: number;
    prior: number;
    pv: string[];
    pvVisits?: number[]; // visits at each move of the pv (KataGo includePVVisits)
    pvEdgeVisits?: number[]; // visits this line paid for; never rises along the pv
    lcb?: number; // winrate-scale lower confidence bound, black perspective
    utilityLcb?: number; // utility-scale lower confidence bound, black perspective
    playSelectionValue?: number; // KataGo play selection weight (LCB adjusted)
    utility?: number; // KataGo utilityAvg for this child, black perspective
    humanPrior?: number; // human SL policy for this move, when that net is loaded
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
  /** Set when a human SL policy was asked for but could not be produced. */
  humanPolicyError?: string;
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
  humanPolicyError?: string;
}

export interface KataGoEvalRequest {
  type: 'katago:eval';
  id: number;
  modelUrl: string;
  backend?: KataGoBackendPreference;
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
  backend?: KataGoBackendPreference;
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

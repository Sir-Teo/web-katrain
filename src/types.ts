export const BOARD_SIZE = 19;
export const KOMI = 6.5;

export type Player = 'black' | 'white';
export type Intersection = Player | null;
export type BoardState = Intersection[][];
export type GameRules = 'japanese' | 'chinese';

export interface Move {
    x: number;
    y: number;
    player: Player;
}

export interface GameState {
  board: BoardState;
  currentPlayer: Player;
  moveHistory: Move[]; // Path from root to this state
  capturedBlack: number;
  capturedWhite: number;
  komi: number;
}

export interface CandidateMove {
  x: number;
  y: number;
  winRate: number; // 0-1
  winRateLost?: number; // positive = worse for side to play
  scoreLead: number;
  scoreSelfplay?: number;
  scoreStdev?: number;
  visits: number;
  pointsLost: number; // relative to root eval (KaTrain-like)
  relativePointsLost?: number; // relative to top move (KaTrain-like)
  order: number; // 0 for best move
  prior?: number; // policy prior probability (0..1)
  pv?: string[]; // principal variation, GTP coords (e.g. ["D4","Q16",...])
  ownership?: number[]; // optional per-move ownership (KaTrain includeMovesOwnership)
}

export interface AnalysisResult {
  rootWinRate: number;
  rootScoreLead: number;
  rootScoreSelfplay?: number;
  rootScoreStdev?: number;
  moves: CandidateMove[];
  territory: number[][]; // 19x19 grid, values -1 (white) to 1 (black)
  policy?: number[]; // len 362, illegal = -1, pass at index 361
  ownershipStdev?: number[]; // len 361
}

export interface GameNode {
  id: string;
  parent: GameNode | null;
  children: GameNode[];
  move: Move | null;
  gameState: GameState;
  analysis?: AnalysisResult | null;
  autoUndo?: boolean | null; // Teach-mode auto-undo (KaTrain-like). null = not decided yet.
  undoThreshold?: number; // Random [0,1) used for fractional auto-undos.
  aiThoughts?: string;
  note?: string; // User-editable note (SGF C), KaTrain-style.
  properties?: Record<string, string[]>;
}

export interface GameSettings {
  soundEnabled: boolean;
  showCoordinates: boolean;
  showMoveNumbers: boolean;
  boardTheme: 'bamboo' | 'flat' | 'dark';
  showLastNMistakes: number; // KaTrain-like eval dots: 0 disables, else show last N moves
  mistakeThreshold: number; // Points lost to consider a mistake (WinRateGraph + mistake nav)
  loadSgfRewind: boolean; // KaTrain general/load_sgf_rewind
  gameRules: GameRules; // KataGo rules preset (KaTrain default: japanese)
  analysisShowChildren: boolean; // Q
  analysisShowEval: boolean; // W
  analysisShowHints: boolean; // E
  analysisShowPolicy: boolean; // R
  analysisShowOwnership: boolean; // T
  katagoModelUrl: string;
  katagoVisits: number;
  katagoFastVisits: number; // KaTrain fast_visits (used for initial/quick analysis)
  katagoMaxTimeMs: number;
  katagoBatchSize: number;
  katagoMaxChildren: number;
  katagoTopK: number;
  katagoReuseTree: boolean;
  katagoOwnershipMode: 'root' | 'tree';
  katagoWideRootNoise: number; // KataGo/KaTrain wideRootNoise
  katagoAnalysisPvLen: number; // KataGo analysisPVLen (moves after the first)
  katagoNnRandomize: boolean; // KataGo nnRandomize (random symmetries)
  katagoConservativePass: boolean; // KataGo conservativePass (KaTrain default: true)
  teachNumUndoPrompts: number[]; // KaTrain trainer/num_undo_prompts

  aiStrategy:
    | 'default'
    | 'rank'
    | 'scoreloss'
    | 'policy'
    | 'weighted'
    | 'pick'
    | 'local'
    | 'tenuki'
    | 'territory'
    | 'influence'
    | 'jigo'
    | 'simple'
    | 'settle';
  aiRankKyu: number; // KaTrain ai:p:rank/kyu_rank
  aiScoreLossStrength: number; // KaTrain ai:scoreloss/strength
  aiPolicyOpeningMoves: number; // KaTrain ai:policy/opening_moves
  aiWeightedPickOverride: number; // KaTrain ai:p:weighted/pick_override
  aiWeightedWeakenFac: number; // KaTrain ai:p:weighted/weaken_fac
  aiWeightedLowerBound: number; // KaTrain ai:p:weighted/lower_bound

  aiPickPickOverride: number; // KaTrain ai:p:pick/pick_override
  aiPickPickN: number; // KaTrain ai:p:pick/pick_n
  aiPickPickFrac: number; // KaTrain ai:p:pick/pick_frac

  aiLocalPickOverride: number; // KaTrain ai:p:local/pick_override
  aiLocalStddev: number; // KaTrain ai:p:local/stddev
  aiLocalPickN: number; // KaTrain ai:p:local/pick_n
  aiLocalPickFrac: number; // KaTrain ai:p:local/pick_frac
  aiLocalEndgame: number; // KaTrain ai:p:local/endgame

  aiTenukiPickOverride: number; // KaTrain ai:p:tenuki/pick_override
  aiTenukiStddev: number; // KaTrain ai:p:tenuki/stddev
  aiTenukiPickN: number; // KaTrain ai:p:tenuki/pick_n
  aiTenukiPickFrac: number; // KaTrain ai:p:tenuki/pick_frac
  aiTenukiEndgame: number; // KaTrain ai:p:tenuki/endgame

  aiInfluencePickOverride: number; // KaTrain ai:p:influence/pick_override
  aiInfluencePickN: number; // KaTrain ai:p:influence/pick_n
  aiInfluencePickFrac: number; // KaTrain ai:p:influence/pick_frac
  aiInfluenceThreshold: number; // KaTrain ai:p:influence/threshold
  aiInfluenceLineWeight: number; // KaTrain ai:p:influence/line_weight
  aiInfluenceEndgame: number; // KaTrain ai:p:influence/endgame

  aiTerritoryPickOverride: number; // KaTrain ai:p:territory/pick_override
  aiTerritoryPickN: number; // KaTrain ai:p:territory/pick_n
  aiTerritoryPickFrac: number; // KaTrain ai:p:territory/pick_frac
  aiTerritoryThreshold: number; // KaTrain ai:p:territory/threshold
  aiTerritoryLineWeight: number; // KaTrain ai:p:territory/line_weight
  aiTerritoryEndgame: number; // KaTrain ai:p:territory/endgame

  aiJigoTargetScore: number; // KaTrain ai:jigo/target_score

  aiOwnershipMaxPointsLost: number; // KaTrain ai:simple/max_points_lost
  aiOwnershipSettledWeight: number; // KaTrain ai:simple/settled_weight
  aiOwnershipOpponentFac: number; // KaTrain ai:simple/opponent_fac
  aiOwnershipMinVisits: number; // KaTrain ai:simple/min_visits
  aiOwnershipAttachPenalty: number; // KaTrain ai:simple/attach_penalty
  aiOwnershipTenukiPenalty: number; // KaTrain ai:simple/tenuki_penalty
}

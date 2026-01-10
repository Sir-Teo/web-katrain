export const BOARD_SIZE = 19;
export const KOMI = 6.5;

export type Player = 'black' | 'white';
export type Intersection = Player | null;
export type BoardState = Intersection[][];

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
  scoreLead: number;
  scoreSelfplay?: number;
  scoreStdev?: number;
  visits: number;
  pointsLost: number; // relative to best move
  order: number; // 0 for best move
  prior?: number; // policy prior probability (0..1)
  pv?: string[]; // principal variation, GTP coords (e.g. ["D4","Q16",...])
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
  properties?: Record<string, string[]>;
}

export interface GameSettings {
  soundEnabled: boolean;
  showCoordinates: boolean;
  showMoveNumbers: boolean;
  boardTheme: 'bamboo' | 'flat' | 'dark';
  showLastNMistakes: number; // KaTrain-like eval dots: 0 disables, else show last N moves
  mistakeThreshold: number; // Points lost to consider a mistake (WinRateGraph + mistake nav)
  analysisShowChildren: boolean; // Q
  analysisShowEval: boolean; // W
  analysisShowHints: boolean; // E
  analysisShowPolicy: boolean; // R
  analysisShowOwnership: boolean; // T
  katagoModelUrl: string;
  katagoVisits: number;
  katagoMaxTimeMs: number;
  katagoBatchSize: number;
  katagoMaxChildren: number;
  katagoTopK: number;
}

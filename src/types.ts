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
  visits: number;
  pointsLost: number; // relative to best move
  order: number; // 0 for best move
}

export interface AnalysisResult {
  rootWinRate: number;
  rootScoreLead: number;
  moves: CandidateMove[];
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
  boardTheme: 'bamboo' | 'flat' | 'dark';
  showLastNMistakes: number; // 0 to disable
}

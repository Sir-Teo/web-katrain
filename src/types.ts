export const BOARD_SIZE = 19;
export const KOMI = 6.5;

export type Player = 'black' | 'white';
export type Intersection = Player | null;
export type BoardState = Intersection[][];

export interface GameState {
  board: BoardState;
  currentPlayer: Player;
  moveHistory: { x: number; y: number; player: Player }[];
  capturedBlack: number;
  capturedWhite: number;
  komi: number;
}

import type { BoardState, GameRules, GameState, Move, Player } from '../types';

const stoneChar = (stone: BoardState[number][number]): string => {
  if (stone === 'black') return 'b';
  if (stone === 'white') return 'w';
  return '.';
};

const moveKey = (move: Move): string => `${move.player[0]}:${move.x},${move.y}`;

export function makeAnalysisPositionKey(args: {
  board: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  repetitionHistory?: readonly string[];
  komi: number;
  rules: GameRules;
}): string {
  const boardRows = args.board.map((row) => row.map(stoneChar).join('')).join('/');
  const history = args.moveHistory.map(moveKey).join(';');
  return [
    `size=${args.board.length}`,
    `player=${args.currentPlayer}`,
    `komi=${args.komi}`,
    `rules=${args.rules}`,
    `board=${boardRows}`,
    `history=${history}`,
    ...(args.repetitionHistory ? [`repetition=${[...new Set(args.repetitionHistory)].sort().join(';')}`] : []),
  ].join('|');
}

export function makeGameStateAnalysisPositionKey(gameState: GameState, rules: GameRules, repetitionHistory?: readonly string[]): string {
  return makeAnalysisPositionKey({
    board: gameState.board,
    currentPlayer: gameState.currentPlayer,
    moveHistory: gameState.moveHistory,
    repetitionHistory,
    komi: gameState.komi,
    rules,
  });
}

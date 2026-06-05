import type { BoardState } from '../types';

export function boardToQaString(board: BoardState): string {
  return board
    .flatMap((row) =>
      row.map((stone) => {
        if (stone === 'black') return 'B';
        if (stone === 'white') return 'W';
        return '.';
      })
    )
    .join('');
}

export function countBoardStones(board: BoardState): number {
  return board.reduce(
    (sum, row) => sum + row.reduce((rowSum, stone) => rowSum + (stone ? 1 : 0), 0),
    0
  );
}


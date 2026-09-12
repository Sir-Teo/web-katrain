import type { BoardState, Move, Player } from '../../src/types';
import { applyCapturesInPlace } from '../../src/utils/gameLogic';

/** Three separate kos; the sixth capture restores the starting position. */
export function tripleKoFixture(swap = false) {
  const board: BoardState = Array.from({ length: 9 }, () => Array(9).fill(null));
  for (const [ox, oy, reverse] of [[0, 0, false], [5, 0, true], [0, 5, false]] as const) {
    ['.XO.', 'XO.O', '.XO.'].forEach((row, y) => [...row].forEach((stone, x) => {
      if (stone !== '.') board[oy + y]![ox + x] = (stone === 'X') !== (reverse !== swap) ? 'black' : 'white';
    }));
  }
  const first: Player = swap ? 'white' : 'black';
  const history = [{ board, playerToMove: first }];
  const moves: Move[] = [];
  for (const [x, y] of [[2, 1], [7, 1], [2, 6], [1, 1], [6, 1]]) {
    const previous = history[history.length - 1]!;
    const next = previous.board.map(row => [...row]);
    next[y]![x] = previous.playerToMove;
    applyCapturesInPlace(next, x, y, previous.playerToMove);
    moves.push({ x, y, player: previous.playerToMove });
    history.push({ board: next, playerToMove: previous.playerToMove === 'black' ? 'white' : 'black' });
  }
  return { history, moves, repeatMove: { x: 1, y: 6 } };
}

import { describe, it, expect } from 'vitest';
import { boardsEqual, getLiberties, checkCaptures } from '../src/utils/gameLogic';
import { BOARD_SIZE, BoardState } from '../src/types';

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

describe('Game Logic', () => {
  it('should compare boards efficiently', () => {
    const a = createEmptyBoard();
    const b = createEmptyBoard();
    expect(boardsEqual(a, b)).toBe(true);
    b[0][0] = 'black';
    expect(boardsEqual(a, b)).toBe(false);
  });

  it('should calculate liberties correctly', () => {
    const board = createEmptyBoard();
    board[0][0] = 'black';
    // Top-left corner: 2 liberties (0,1) and (1,0)
    const { liberties } = getLiberties(board, 0, 0);
    expect(liberties).toBe(2);
  });

  it('should capture stones with no liberties', () => {
    const board = createEmptyBoard();
    board[0][0] = 'white'; // Stone to be captured
    // Surround it
    // White at 0,0. Liberties at 0,1 and 1,0.
    // Place Black at 0,1 and 1,0.

    // We are simulating the move that captures.
    // Suppose Black plays at 0,1.
    // And assume 1,0 is already Black.

    // Let's set up the board *before* the capturing move is checked by checkCaptures
    // checkCaptures takes the board *after* the move is tentatively placed on the board?
    // In gameStore.ts:
    //    const tentativeBoard = state.board.map((row) => [...row]);
    //    tentativeBoard[y][x] = state.currentPlayer;
    //    const { captured, newBoard } = checkCaptures(tentativeBoard, x, y, state.currentPlayer);

    // So checkCaptures expects the stone to be already on the board.

    const tentativeBoard = createEmptyBoard();
    tentativeBoard[0][0] = 'white';
    tentativeBoard[1][0] = 'black';
    tentativeBoard[0][1] = 'black'; // The capturing move

    const { captured, newBoard } = checkCaptures(tentativeBoard, 1, 0, 'black');

    expect(captured.length).toBe(1);
    expect(captured[0]).toEqual({ x: 0, y: 0 });
    expect(newBoard[0][0]).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { BOARD_SIZE } from '../src/types';

describe('GameStore loadGame', () => {
    it('loads a game from SGF data', () => {
        const store = useGameStore.getState();
        // Reset
        store.resetGame();

        const sgfData = {
            moves: [
                { x: 3, y: 3, player: 'black' as const },
                { x: 15, y: 15, player: 'white' as const }
            ],
            initialBoard: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
            komi: 7.5
        };
        // Add a handicap stone manually to initialBoard
        sgfData.initialBoard[9][9] = 'black';

        store.loadGame(sgfData);

        const state = useGameStore.getState();

        // Check handicap
        expect(state.board[9][9]).toBe('black');

        // Check moves
        expect(state.board[3][3]).toBe('black');
        expect(state.board[15][15]).toBe('white');

        // Check history
        expect(state.moveHistory).toHaveLength(2);
        expect(state.moveHistory[0]).toEqual({ x: 3, y: 3, player: 'black' });

        // Check current player
        expect(state.currentPlayer).toBe('black'); // Next player after B, W is B

        // Check Komi
        expect(state.komi).toBe(7.5);
    });
});

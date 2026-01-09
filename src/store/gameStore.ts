import { create } from 'zustand';
import { BOARD_SIZE, type GameState, type BoardState, type Player, type AnalysisResult } from '../types';
import { checkCaptures, getLiberties } from '../utils/gameLogic';
import { playStoneSound } from '../utils/sound';
import type { ParsedSgf } from '../utils/sgf';
import { generateMockAnalysis } from '../utils/mockAnalysis';

interface GameStore extends GameState {
  pastStates: GameState[]; // Store full state for undo/ko
  isAiPlaying: boolean;
  aiColor: Player | null;
  isAnalysisMode: boolean;
  analysisData: AnalysisResult | null;
  toggleAi: (color: Player) => void;
  toggleAnalysisMode: () => void;
  playMove: (x: number, y: number, isLoad?: boolean) => void;
  makeAiMove: () => void;
  undoMove: () => void;
  resetGame: () => void;
  loadGame: (sgf: ParsedSgf) => void;
  passTurn: () => void;
  runAnalysis: () => void;
}

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

export const useGameStore = create<GameStore>((set, get) => ({
  board: createEmptyBoard(),
  currentPlayer: 'black',
  moveHistory: [],
  capturedBlack: 0,
  capturedWhite: 0,
  komi: 6.5,
  isAiPlaying: false,
  aiColor: null,
  pastStates: [],
  isAnalysisMode: false,
  analysisData: null,

  toggleAi: (color) => set({ isAiPlaying: true, aiColor: color }),

  toggleAnalysisMode: () => set((state) => {
      const newMode = !state.isAnalysisMode;
      if (newMode) {
          // Trigger analysis immediately when turning on
          setTimeout(() => get().runAnalysis(), 0);
      }
      return { isAnalysisMode: newMode, analysisData: null };
  }),

  runAnalysis: () => {
      const state = get();
      if (!state.isAnalysisMode) return;

      const analysis = generateMockAnalysis(state.board, state.currentPlayer);
      set({ analysisData: analysis });
  },

  playMove: (x: number, y: number, isLoad = false) => {
    const state = get();
    // Check boundaries or existing stones
    if (state.board[y][x] !== null) return; // Illegal move (occupied)

    // 1. Place the stone tentatively
    const tentativeBoard = state.board.map((row) => [...row]);
    tentativeBoard[y][x] = state.currentPlayer;

    // 2. Check for captures
    const { captured, newBoard } = checkCaptures(tentativeBoard, x, y, state.currentPlayer);

    // 3. Check for suicide (if no captures and no liberties)
    if (captured.length === 0) {
      const { liberties } = getLiberties(newBoard, x, y);
      if (liberties === 0) {
        return;
      }
    }

    // 4. Check for Ko
    const pastStates = state.pastStates || [];
    if (pastStates.length > 0) {
        const koBoard = pastStates[pastStates.length - 1].board;
        // Simple JSON comparison for MVP Ko check
        if (JSON.stringify(newBoard) === JSON.stringify(koBoard)) {
            // Ko violation
            return;
        }
    }

    // Play sound
    if (!isLoad) {
      playStoneSound();
    }

    // Update captured counts
    const newCapturedBlack = state.capturedBlack + (state.currentPlayer === 'white' ? captured.length : 0);
    const newCapturedWhite = state.capturedWhite + (state.currentPlayer === 'black' ? captured.length : 0);

    const nextPlayer: Player = state.currentPlayer === 'black' ? 'white' : 'black';

    // Create the new state object
    // We only need to store the GameState part in pastStates
    const currentGameState: GameState = {
        board: state.board,
        currentPlayer: state.currentPlayer,
        moveHistory: state.moveHistory,
        capturedBlack: state.capturedBlack,
        capturedWhite: state.capturedWhite,
        komi: state.komi,
    };

    set({
      board: newBoard,
      currentPlayer: nextPlayer,
      moveHistory: [...state.moveHistory, { x, y, player: state.currentPlayer }],
      capturedBlack: newCapturedBlack,
      capturedWhite: newCapturedWhite,
      pastStates: [...pastStates, currentGameState], // Save *previous* state to history
    });

    // Trigger AI move if needed
    if (!isLoad) {
      const newState = get();
      if (newState.isAiPlaying && newState.currentPlayer === newState.aiColor) {
        setTimeout(() => {
          get().makeAiMove();
        }, 500);
      }

      if (newState.isAnalysisMode) {
          // Clear old analysis immediately
          set({ analysisData: null });
          // Run new analysis
          setTimeout(() => get().runAnalysis(), 500);
      }
    }
  },

  makeAiMove: () => {
      // Helper to access state and play
      makeRandomMove(get());
  },

  undoMove: () => set((state) => {
    const pastStates = state.pastStates;
    if (!pastStates || pastStates.length === 0) return state;

    const previousState = pastStates[pastStates.length - 1];
    const newPastStates = pastStates.slice(0, -1);

    return {
        ...previousState,
        pastStates: newPastStates,
        // Preserve AI settings
        isAiPlaying: state.isAiPlaying,
        aiColor: state.aiColor,
    };
  }),

  resetGame: () => set({
    board: createEmptyBoard(),
    currentPlayer: 'black',
    moveHistory: [],
    capturedBlack: 0,
    capturedWhite: 0,
    komi: 6.5,
    isAiPlaying: false,
    aiColor: null,
    pastStates: [],
    analysisData: null,
  }),

  loadGame: (sgf: ParsedSgf) => {
    // Reset first
    get().resetGame();

    // Set Komi
    if (sgf.komi !== undefined) {
      set({ komi: sgf.komi });
    }

    // Set initial board (handicap)
    if (sgf.initialBoard) {
        set({ board: sgf.initialBoard });
    }

    // Replay moves
    sgf.moves.forEach(move => {
        if (move.x === -1) {
            get().passTurn();
        } else {
            // Force the current player to match the move player?
            // Usually SGF moves alternate, but handicap or edits might change that.
            // For now, assume alternation or rely on game logic to switch.
            // But if the SGF says 'W' played, but our state thinks it's 'B', we should sync it?

            const state = get();
            if (state.currentPlayer !== move.player) {
                // Force player switch if out of sync (e.g. handicap black played multiple, or white started)
                set({ currentPlayer: move.player });
            }
            get().playMove(move.x, move.y, true);
        }
    });
  },

  passTurn: () => set((state) => {
    const currentGameState: GameState = {
        board: state.board,
        currentPlayer: state.currentPlayer,
        moveHistory: state.moveHistory,
        capturedBlack: state.capturedBlack,
        capturedWhite: state.capturedWhite,
        komi: state.komi
    };

    return {
        currentPlayer: state.currentPlayer === 'black' ? 'white' : 'black',
        moveHistory: [...state.moveHistory, { x: -1, y: -1, player: state.currentPlayer }],
        pastStates: [...(state.pastStates || []), currentGameState],
    };
  }),
}));

// Helper function for random AI
const makeRandomMove = (store: GameStore) => {
  let attempts = 0;
  let moveMade = false;

  // Try 100 times to find a random empty spot
  while (attempts < 100 && !moveMade) {
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);

    if (store.board[y][x] === null) {
       const currentPlayer = store.currentPlayer;
       store.playMove(x, y);
       const nextPlayer = store.currentPlayer;

       if (currentPlayer !== nextPlayer) {
           moveMade = true;
       }
    }
    attempts++;
  }

  if (!moveMade) {
      store.passTurn();
  }
};

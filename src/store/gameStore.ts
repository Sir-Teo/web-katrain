import { create } from 'zustand';
import { BOARD_SIZE, type GameState, type BoardState, type Player, type AnalysisResult, type GameNode, type Move, type GameSettings } from '../types';
import { checkCaptures, getLiberties } from '../utils/gameLogic';
import { playStoneSound, playCaptureSound, playPassSound } from '../utils/sound';
import type { ParsedSgf } from '../utils/sgf';
import { generateMockAnalysis } from '../utils/mockAnalysis';

interface GameStore extends GameState {
  // Tree State
  rootNode: GameNode;
  currentNode: GameNode;

  // Settings & Modes
  isAiPlaying: boolean;
  aiColor: Player | null;
  isAnalysisMode: boolean;
  analysisData: AnalysisResult | null;
  settings: GameSettings;

  // Actions
  toggleAi: (color: Player) => void;
  toggleAnalysisMode: () => void;
  playMove: (x: number, y: number, isLoad?: boolean) => void;
  makeAiMove: () => void;
  undoMove: () => void; // Go back
  navigateBack: () => void;
  navigateForward: () => void; // Go forward (main branch)
  jumpToNode: (node: GameNode) => void; // Navigate to arbitrary node
  resetGame: () => void;
  loadGame: (sgf: ParsedSgf) => void;
  passTurn: () => void;
  runAnalysis: () => void;
  updateSettings: (newSettings: Partial<GameSettings>) => void;
}

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

const createNode = (
    parent: GameNode | null,
    move: Move | null,
    gameState: GameState,
    idOverride?: string
): GameNode => {
    return {
        id: idOverride || Math.random().toString(36).substr(2, 9),
        parent,
        children: [],
        move,
        gameState,
        analysis: null,
        properties: {}
    };
};

// Initial state helpers
const initialBoard = createEmptyBoard();
const initialGameState: GameState = {
    board: initialBoard,
    currentPlayer: 'black',
    moveHistory: [],
    capturedBlack: 0,
    capturedWhite: 0,
    komi: 6.5
};
const initialRoot = createNode(null, null, initialGameState, 'root');

const defaultSettings: GameSettings = {
  soundEnabled: true,
  showCoordinates: true,
  boardTheme: 'bamboo',
  showLastNMistakes: 3,
};

export const useGameStore = create<GameStore>((set, get) => ({
  // Flat properties (mirrored from currentNode.gameState for easy access)
  board: initialGameState.board,
  currentPlayer: initialGameState.currentPlayer,
  moveHistory: initialGameState.moveHistory,
  capturedBlack: initialGameState.capturedBlack,
  capturedWhite: initialGameState.capturedWhite,
  komi: initialGameState.komi,

  // Tree State
  rootNode: initialRoot,
  currentNode: initialRoot,

  isAiPlaying: false,
  aiColor: null,
  isAnalysisMode: false,
  analysisData: null,
  settings: defaultSettings,

  toggleAi: (color) => set({ isAiPlaying: true, aiColor: color }),

  toggleAnalysisMode: () => set((state) => {
      const newMode = !state.isAnalysisMode;
      if (newMode) {
          setTimeout(() => get().runAnalysis(), 0);
      }
      return { isAnalysisMode: newMode, analysisData: state.currentNode.analysis || null };
  }),

  runAnalysis: () => {
      const state = get();
      if (!state.isAnalysisMode) return;

      // Check if current node already has analysis
      if (state.currentNode.analysis) {
          set({ analysisData: state.currentNode.analysis });
          return;
      }

      // Pass parent analysis for continuity
      const parentAnalysis = state.currentNode.parent?.analysis;
      const analysis = generateMockAnalysis(state.board, state.currentPlayer, parentAnalysis);

      // Store analysis in node
      state.currentNode.analysis = analysis;

      set({ analysisData: analysis });
  },

  updateSettings: (newSettings) => set((state) => ({
      settings: { ...state.settings, ...newSettings }
  })),

  playMove: (x: number, y: number, isLoad = false) => {
    const state = get();

    // Check if we are loading or playing normally.
    // First, check if move exists in children (Navigation)
    const existingChild = state.currentNode.children.find(child =>
        child.move && child.move.x === x && child.move.y === y && child.move.player === state.currentPlayer
    );

    if (existingChild && !isLoad) {
       // Navigate to existing child
       get().jumpToNode(existingChild);
       return;
    }

    // New Move Logic
    // Validate
    if (state.board[y][x] !== null) return;

    const tentativeBoard = state.board.map((row) => [...row]);
    tentativeBoard[y][x] = state.currentPlayer;

    const { captured, newBoard } = checkCaptures(tentativeBoard, x, y, state.currentPlayer);

    // Suicide check
    if (captured.length === 0) {
      const { liberties } = getLiberties(newBoard, x, y);
      if (liberties === 0) return;
    }

    // Ko check
    // Simple Ko: Check just the state from 2 moves ago?
    // Let's traverse up one step (parent).
    if (state.currentNode.parent && JSON.stringify(newBoard) === JSON.stringify(state.currentNode.parent.gameState.board)) {
        // Found Ko, illegal move
        return;
    }

    if (!isLoad) {
      if (state.settings.soundEnabled) {
          playStoneSound();
          if (captured.length > 0) {
              setTimeout(() => playCaptureSound(captured.length), 100);
          }
      }
    }

    const newCapturedBlack = state.capturedBlack + (state.currentPlayer === 'white' ? captured.length : 0);
    const newCapturedWhite = state.capturedWhite + (state.currentPlayer === 'black' ? captured.length : 0);
    const nextPlayer: Player = state.currentPlayer === 'black' ? 'white' : 'black';

    const move: Move = { x, y, player: state.currentPlayer };

    const newGameState: GameState = {
        board: newBoard,
        currentPlayer: nextPlayer,
        moveHistory: [...state.moveHistory, move],
        capturedBlack: newCapturedBlack,
        capturedWhite: newCapturedWhite,
        komi: state.komi,
    };

    const newNode = createNode(state.currentNode, move, newGameState);
    state.currentNode.children.push(newNode);

    set({
      currentNode: newNode,
      board: newGameState.board,
      currentPlayer: newGameState.currentPlayer,
      moveHistory: newGameState.moveHistory,
      capturedBlack: newGameState.capturedBlack,
      capturedWhite: newGameState.capturedWhite,
      analysisData: null // Clear old analysis
    });

    if (!isLoad) {
      const newState = get();
      if (newState.isAiPlaying && newState.currentPlayer === newState.aiColor) {
        setTimeout(() => get().makeAiMove(), 500);
      }
      if (newState.isAnalysisMode) {
          setTimeout(() => get().runAnalysis(), 500);
      }
    }
  },

  makeAiMove: () => {
      makeRandomMove(get());
  },

  undoMove: () => get().navigateBack(),

  navigateBack: () => set((state) => {
    if (!state.currentNode.parent) return {};
    const prevNode = state.currentNode.parent;
    return {
        currentNode: prevNode,
        board: prevNode.gameState.board,
        currentPlayer: prevNode.gameState.currentPlayer,
        moveHistory: prevNode.gameState.moveHistory,
        capturedBlack: prevNode.gameState.capturedBlack,
        capturedWhite: prevNode.gameState.capturedWhite,
        analysisData: prevNode.analysis || null,
        // Preserve settings
        isAiPlaying: state.isAiPlaying,
        aiColor: state.aiColor
    };
  }),

  navigateForward: () => set((state) => {
      if (state.currentNode.children.length === 0) return state;
      // Default to first child (main branch usually)
      const nextNode = state.currentNode.children[0];
      return {
          currentNode: nextNode,
          board: nextNode.gameState.board,
          currentPlayer: nextNode.gameState.currentPlayer,
          moveHistory: nextNode.gameState.moveHistory,
          capturedBlack: nextNode.gameState.capturedBlack,
          capturedWhite: nextNode.gameState.capturedWhite,
          analysisData: nextNode.analysis || null,
      };
  }),

  jumpToNode: (node: GameNode) => set(() => {
      // Just set current node and sync state
      return {
          currentNode: node,
          board: node.gameState.board,
          currentPlayer: node.gameState.currentPlayer,
          moveHistory: node.gameState.moveHistory,
          capturedBlack: node.gameState.capturedBlack,
          capturedWhite: node.gameState.capturedWhite,
          analysisData: node.analysis || null,
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
    analysisData: null,

    // Reset Tree
    rootNode: initialRoot,
    currentNode: initialRoot
  }),

  loadGame: (sgf: ParsedSgf) => {
    // Reset first
    get().resetGame();

    let currentBoard = createEmptyBoard();
    if (sgf.initialBoard) {
        currentBoard = sgf.initialBoard;
    }

    const rootState: GameState = {
        board: currentBoard,
        currentPlayer: 'black',
        moveHistory: [],
        capturedBlack: 0,
        capturedWhite: 0,
        komi: sgf.komi || 6.5
    };

    const newRoot = createNode(null, null, rootState, 'root');

    set({
        rootNode: newRoot,
        currentNode: newRoot,
        board: rootState.board,
        komi: rootState.komi,
        currentPlayer: rootState.currentPlayer
    });

    // Replay moves
    sgf.moves.forEach(move => {
        if (move.x === -1) {
            get().passTurn();
        } else {
            const state = get();
            if (state.currentPlayer !== move.player) {
                // Force sync
                set({ currentPlayer: move.player });
            }
            get().playMove(move.x, move.y, true);
        }
    });
  },

  passTurn: () => {
      const state = get();
      if (state.settings.soundEnabled) {
        playPassSound();
      }
      const move: Move = { x: -1, y: -1, player: state.currentPlayer };

      // Check for existing pass child
      const existingChild = state.currentNode.children.find(child =>
        child.move && child.move.x === -1 && child.move.y === -1 && child.move.player === state.currentPlayer
      );

      if (existingChild) {
           get().jumpToNode(existingChild);
           return;
      }

      const nextPlayer = state.currentPlayer === 'black' ? 'white' : 'black';
      const newGameState: GameState = {
        board: state.board, // No change
        currentPlayer: nextPlayer,
        moveHistory: [...state.moveHistory, move],
        capturedBlack: state.capturedBlack,
        capturedWhite: state.capturedWhite,
        komi: state.komi
      };

      const newNode = createNode(state.currentNode, move, newGameState);
      state.currentNode.children.push(newNode);

      set({
          currentNode: newNode,
          currentPlayer: newGameState.currentPlayer,
          moveHistory: newGameState.moveHistory,
          // board doesn't change
      });
  }
}));

const makeRandomMove = (store: GameStore) => {
  let attempts = 0;
  let moveMade = false;

  while (attempts < 100 && !moveMade) {
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);

    if (store.board[y][x] === null) {
       store.playMove(x, y);

       const currentStore = useGameStore.getState();
       const lastMove = currentStore.moveHistory[currentStore.moveHistory.length - 1];
       if (lastMove && lastMove.x === x && lastMove.y === y) {
           moveMade = true;
       }
    }
    attempts++;
  }

  if (!moveMade) {
      store.passTurn();
  }
};

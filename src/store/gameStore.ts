import { create } from 'zustand';
import { BOARD_SIZE, type GameState, type BoardState, type Player, type AnalysisResult, type GameNode, type Move } from '../types';
import { checkCaptures, getLiberties } from '../utils/gameLogic';
import { playStoneSound } from '../utils/sound';
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

  // Actions
  toggleAi: (color: Player) => void;
  toggleAnalysisMode: () => void;
  playMove: (x: number, y: number, isLoad?: boolean) => void;
  makeAiMove: () => void;
  undoMove: () => void; // Go back
  navigateBack: () => void;
  navigateForward: () => void; // Go forward (main branch)
  resetGame: () => void;
  loadGame: (sgf: ParsedSgf) => void;
  passTurn: () => void;
  runAnalysis: () => void;
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

      const analysis = generateMockAnalysis(state.board, state.currentPlayer);

      // Store analysis in node
      state.currentNode.analysis = analysis;

      set({ analysisData: analysis });
  },

  playMove: (x: number, y: number, isLoad = false) => {
    const state = get();

    // Check if we are loading or playing normally.
    // First, check if move exists in children (Navigation)
    const existingChild = state.currentNode.children.find(child =>
        child.move && child.move.x === x && child.move.y === y && child.move.player === state.currentPlayer
    );

    if (existingChild && !isLoad) { // If loading, we force creation usually, or just follow? SGF might have dups?
       // Actually for SGF loading we might want to just follow if it matches exactly.
       // But 'playMove' is called by user click.

       // Navigate to existing child
       set({
           currentNode: existingChild,
           board: existingChild.gameState.board,
           currentPlayer: existingChild.gameState.currentPlayer,
           moveHistory: existingChild.gameState.moveHistory,
           capturedBlack: existingChild.gameState.capturedBlack,
           capturedWhite: existingChild.gameState.capturedWhite,
           komi: existingChild.gameState.komi,
           analysisData: existingChild.analysis || null
       });

       if (state.isAnalysisMode && !existingChild.analysis) {
           setTimeout(() => get().runAnalysis(), 500);
       }
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
    // We need to check the path back to root for repetition
    // Actually standard Ko is just previous state.
    // Superko checks all past states.
    // Let's implement simple Ko (immediate previous state check)
    // Actually, `moveHistory` path has all states.
    // But we need to check the boards.
    // Optimization: Just check `state.currentNode.gameState.board`? No that's current.
    // Check `state.currentNode.parent.gameState.board`? That's the one before current move.
    // We need to check if `newBoard` == `state.currentNode.parent.gameState.board`? (This is impossible, just reversed move).
    // Ko is: new state == state before previous move.

    // Let's check against `moveHistory`. But `moveHistory` is just moves.
    // We can traverse up the tree to check Ko.
    let node: GameNode | null = state.currentNode;
    let koFound = false;
    // Simple Ko: Check just the state from 2 moves ago?
    // Let's traverse up one step (parent).
    if (node.parent && JSON.stringify(newBoard) === JSON.stringify(node.parent.gameState.board)) {
        // This is immediate reversal (Snapback is fine, but Ko rule...?)
        // Wait, if I play, capture, and the board looks exactly like it did before my opponent played...
        // Yes, checking parent is wrong. Parent is state *before* I play this move.
        // I need to check if `newBoard` equals `node.parent.gameState.board`.
        // If it does, then I just reversed the last move (which is allowed unless it's Ko).
        // Standard Ko: A stone is captured, and the capturer cannot immediately recapture.
        // This manifests as repeating the board position.
        koFound = true;
    }

    if (koFound) return;

    if (!isLoad) {
      playStoneSound();
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
    if (!state.currentNode.parent) return state;

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
    // We need to recreate the root if SGF has handicap/initial setup
    // But `resetGame` sets it to clean root.

    let currentBoard = createEmptyBoard();
    if (sgf.initialBoard) {
        currentBoard = sgf.initialBoard;
    }

    const rootState: GameState = {
        board: currentBoard,
        currentPlayer: 'black', // SGF usually implies Black starts unless HA is set?
        // If HA (Handicap), Black stones are placed, and White plays first (usually).
        // But our `parseSgf` returns initialBoard.
        // We need to set current player correctly?
        // For now default Black.
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
      const move: Move = { x: -1, y: -1, player: state.currentPlayer };

      // Check for existing pass child
      const existingChild = state.currentNode.children.find(child =>
        child.move && child.move.x === -1 && child.move.y === -1 && child.move.player === state.currentPlayer
      );

      if (existingChild) {
           set({
               currentNode: existingChild,
               board: existingChild.gameState.board,
               currentPlayer: existingChild.gameState.currentPlayer,
               moveHistory: existingChild.gameState.moveHistory,
               capturedBlack: existingChild.gameState.capturedBlack,
               capturedWhite: existingChild.gameState.capturedWhite,
               analysisData: existingChild.analysis || null
           });
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
       // Check if move was accepted (player changed)
       // store.currentPlayer inside playMove is "old" -> playMove updates store.
       // But `store` passed here is the *snapshot* from `get()`.
       // We need to check if the store state actually changed.
       // However, `playMove` is synchronous.

       // Actually, we can just check if playMove returns success?
       // It returns void.
       // We can check if `store.board[y][x]` is now the player color?
       // But `store` is old snapshot. We need `useGameStore.getState()`.

       const currentStore = useGameStore.getState();
       // Check if the move we just tried is in history
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

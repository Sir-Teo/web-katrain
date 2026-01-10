import { create } from 'zustand';
import { BOARD_SIZE, type GameState, type BoardState, type Player, type AnalysisResult, type GameNode, type Move, type GameSettings } from '../types';
import { checkCaptures, getLiberties, getLegalMoves, isEye } from '../utils/gameLogic';
import { playStoneSound, playCaptureSound, playPassSound, playNewGameSound } from '../utils/sound';
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
  isTeachMode: boolean;
  notification: { message: string, type: 'info' | 'error' | 'success' } | null;
  analysisData: AnalysisResult | null;
  settings: GameSettings;

  // Actions
  toggleAi: (color: Player) => void;
  toggleAnalysisMode: () => void;
  toggleTeachMode: () => void;
  clearNotification: () => void;
  playMove: (x: number, y: number, isLoad?: boolean) => void;
  makeAiMove: () => void;
  undoMove: () => void; // Go back
  navigateBack: () => void;
  navigateForward: () => void; // Go forward (main branch)
  navigateStart: () => void;
  navigateEnd: () => void;
  jumpToNode: (node: GameNode) => void; // Navigate to arbitrary node
  navigateNextMistake: () => void;
  navigatePrevMistake: () => void;
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
  showTerritory: false,
  mistakeThreshold: 2.0,
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
  isTeachMode: false,
  notification: null,
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

  toggleTeachMode: () => set((state) => {
      const newMode = !state.isTeachMode;
      if (newMode) {
           // Teach mode implies analysis
           setTimeout(() => get().runAnalysis(), 0);
      }
      return {
          isTeachMode: newMode,
          // If turning on Teach Mode, ensure Analysis Mode is also on (usually)
          isAnalysisMode: newMode ? true : state.isAnalysisMode
      };
  }),

  clearNotification: () => set({ notification: null }),

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

    // Teach Mode Check
    if (state.isTeachMode && !isLoad) {
        let analysis = state.currentNode.analysis;

        // If no analysis exists, try to generate it synchronously (mock)
        // In a real engine, we might have to wait or just skip.
        if (!analysis) {
             const parentAnalysis = state.currentNode.parent?.analysis;
             analysis = generateMockAnalysis(state.board, state.currentPlayer, parentAnalysis);
             state.currentNode.analysis = analysis; // Cache it
        }

        // Check against candidates
        if (analysis) {
            const candidate = analysis.moves.find(m => m.x === x && m.y === y);
            // Default to "bad" if not found in top moves (mock returns top ~8)
            const pointsLost = candidate ? candidate.pointsLost : 5.0;

            if (pointsLost > 2.0) {
                 // Reject move
                 set({
                     notification: {
                         message: `Bad move! You lost ${pointsLost.toFixed(1)} points. Try again.`,
                         type: 'error'
                     }
                 });
                 // Clear notification after 3s
                 setTimeout(() => set({ notification: null }), 3000);
                 return;
            } else {
                 // Good move, maybe give positive feedback or silence
                 set({ notification: null });
            }
        }
    }

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
      makeHeuristicMove(get());
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

  navigateStart: () => set((state) => {
      let node = state.currentNode;
      while (node.parent) {
          node = node.parent;
      }
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

  navigateEnd: () => set((state) => {
      let node = state.currentNode;
      while (node.children.length > 0) {
          node = node.children[0]; // Follow main branch
      }
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

  navigateNextMistake: () => {
      const state = get();
      let node = state.currentNode;

      while (node.children.length > 0) {
          // Advance first
          node = node.children[0];
          const parent = node.parent;
          if (!parent) continue;

          // Check for analysis
          let analysis = parent.analysis;
          if (!analysis) {
              // Generate mock analysis if missing (since it's fast)
               analysis = generateMockAnalysis(parent.gameState.board, parent.gameState.currentPlayer, parent.parent?.analysis);
               parent.analysis = analysis;
          }

          // Identify the move that led to 'node'
          const move = node.move;
          if (move) {
              const candidate = analysis.moves.find(m => m.x === move.x && m.y === move.y);
              // Threshold from settings
              const threshold = state.settings.mistakeThreshold;
              if (candidate && candidate.pointsLost >= threshold) {
                  // Found a mistake! Jump to the PARENT (state before the mistake)
                  get().jumpToNode(parent);
                  // Ensure analysis is visible
                  set({ isAnalysisMode: true, analysisData: analysis });
                  return;
              }
          }
      }
      set({ notification: { message: "No more mistakes found.", type: 'info' } });
      setTimeout(() => set({ notification: null }), 2000);
  },

  navigatePrevMistake: () => {
      const state = get();
      let cursor = state.currentNode;

      // If we are currently looking at a position, we want to find an EARLIER position where a mistake was made.
      // So we iterate back.
      while (cursor.parent) {
          const moveWasBad = (() => {
               const parent = cursor.parent;
               if (!parent) return false;

               let analysis = parent.analysis;
               if (!analysis) {
                   analysis = generateMockAnalysis(parent.gameState.board, parent.gameState.currentPlayer, parent.parent?.analysis);
                   parent.analysis = analysis;
               }

               const move = cursor.move;
               if (!move) return false;

               const candidate = analysis.moves.find(m => m.x === move.x && m.y === move.y);
               const threshold = state.settings.mistakeThreshold;
               return candidate && candidate.pointsLost >= threshold;
          })();

          if (moveWasBad) {
               // Found it. Jump to parent.
               get().jumpToNode(cursor.parent!);
               set({ isAnalysisMode: true, analysisData: cursor.parent!.analysis });
               return;
          }

          cursor = cursor.parent;
      }

      set({ notification: { message: "No previous mistakes.", type: 'info' } });
      setTimeout(() => set({ notification: null }), 2000);
  },

  resetGame: () => {
    const state = get();
    if (state.settings.soundEnabled) {
        playNewGameSound();
    }
    set({
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
    });
  },

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

const makeHeuristicMove = (store: GameStore) => {
    const { board, currentPlayer, currentNode } = store;
    const parentBoard = currentNode.parent ? currentNode.parent.gameState.board : undefined;

    // 1. Get all legal moves
    const legalMoves = getLegalMoves(board, currentPlayer, parentBoard);

    if (legalMoves.length === 0) {
        store.passTurn();
        return;
    }

    // Heuristics
    // Score each move
    let bestMove = legalMoves[0];
    let bestScore = -Infinity;

    // Helper: simulate move
    const simulate = (x: number, y: number) => {
        const tentativeBoard = board.map(row => [...row]);
        tentativeBoard[y][x] = currentPlayer;
        const { captured, newBoard } = checkCaptures(tentativeBoard, x, y, currentPlayer);
        return { captured, newBoard };
    };

    for (const move of legalMoves) {
        let score = Math.random() * 5; // Base random score to break ties
        const { x, y } = move;

        // A. Don't fill own eyes
        if (isEye(board, x, y, currentPlayer)) {
            score -= 1000;
        }

        const { captured, newBoard } = simulate(x, y);

        // B. Capture Groups (Atari)
        if (captured.length > 0) {
            score += 100 * captured.length;
        }

        // C. Avoid Self-Atari (unless capturing)
        const { liberties } = getLiberties(newBoard, x, y);
        if (liberties === 1) {
            // Is it a snapback? Or just dumb?
            // If we captured something, maybe okay. If not, bad.
            if (captured.length === 0) {
                score -= 50;
            }
        }

        // D. Save own stones in Atari
        // Check neighbors
        const neighbors = [
            {x: x+1, y}, {x: x-1, y}, {x, y: y+1}, {x, y: y-1}
        ];
        for (const n of neighbors) {
            if (n.x >= 0 && n.x < BOARD_SIZE && n.y >= 0 && n.y < BOARD_SIZE) {
                if (board[n.y][n.x] === currentPlayer) {
                    const groupLiberties = getLiberties(board, n.x, n.y).liberties;
                    if (groupLiberties === 1) {
                        // Playing here saves it?
                         const newLibs = getLiberties(newBoard, x, y).liberties;
                         if (newLibs > 1) {
                             score += 80; // Saving throw
                         }
                    }
                }
            }
        }

        // E. Opening Heuristics (Corners > Edges > Center)
        if (store.moveHistory.length < 30) {
             const distToCenter = Math.abs(x - 9) + Math.abs(y - 9); // Used indirectly
             // Prefer lines 3 and 4
             const onLine3or4 = (x === 2 || x === 3 || x === 15 || x === 16) || (y === 2 || y === 3 || y === 15 || y === 16);

             if (onLine3or4) score += 5;

             // Avoid 1-1, 2-2 early on
             if (x <= 1 || x >= 17 || y <= 1 || y >= 17) score -= 5;

             // Add small bias for center if not on line 3/4
             if (!onLine3or4 && distToCenter < 6) score += 1;
        }

        // F. Proximity to last move (Local response)
        const lastMove = store.moveHistory.length > 0 ? store.moveHistory[store.moveHistory.length - 1] : null;
        if (lastMove && lastMove.x !== -1) {
            const dist = Math.abs(lastMove.x - x) + Math.abs(lastMove.y - y);
            if (dist <= 3) score += 5;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    if (bestScore < -500) {
        // If best move is terrible (e.g. filling eye), pass.
        store.passTurn();
    } else {
        store.playMove(bestMove.x, bestMove.y);
    }
};

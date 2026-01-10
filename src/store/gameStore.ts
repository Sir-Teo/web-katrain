import { create } from 'zustand';
import { BOARD_SIZE, type GameState, type BoardState, type Player, type AnalysisResult, type GameNode, type Move, type GameSettings } from '../types';
import { checkCaptures, getLiberties, getLegalMoves, isEye } from '../utils/gameLogic';
import { playStoneSound, playCaptureSound, playPassSound, playNewGameSound } from '../utils/sound';
import type { ParsedSgf } from '../utils/sgf';
import { getKataGoEngineClient } from '../engine/katago/client';
import { decodeKaTrainKt, kaTrainAnalysisToAnalysisResult } from '../utils/katrainSgfAnalysis';

interface GameStore extends GameState {
  // Tree State
  rootNode: GameNode;
  currentNode: GameNode;
  treeVersion: number;

  // Settings & Modes
  isAiPlaying: boolean;
  aiColor: Player | null;
  isAnalysisMode: boolean;
  isContinuousAnalysis: boolean;
  isTeachMode: boolean;
  notification: { message: string, type: 'info' | 'error' | 'success' } | null;
  analysisData: AnalysisResult | null;
  settings: GameSettings;
  engineStatus: 'idle' | 'loading' | 'ready' | 'error';
  engineError: string | null;

  // Actions
  toggleAi: (color: Player) => void;
  toggleAnalysisMode: () => void;
  toggleContinuousAnalysis: (quiet?: boolean) => void;
  stopAnalysis: () => void;
  toggleTeachMode: () => void;
  clearNotification: () => void;
  playMove: (x: number, y: number, isLoad?: boolean) => void;
  makeAiMove: () => void;
  undoMove: () => void; // Go back
  navigateBack: () => void;
  navigateForward: () => void; // Go forward (main branch)
  navigateStart: () => void;
  navigateEnd: () => void;
  switchBranch: (direction: 1 | -1) => void;
  undoToBranchPoint: () => void;
  undoToMainBranch: () => void;
  makeCurrentNodeMainBranch: () => void;
  findMistake: (direction: 'undo' | 'redo') => void;
  deleteCurrentNode: () => void;
  pruneCurrentBranch: () => void;
  jumpToNode: (node: GameNode) => void; // Navigate to arbitrary node
  navigateNextMistake: () => void;
  navigatePrevMistake: () => void;
  resetGame: () => void;
  loadGame: (sgf: ParsedSgf) => void;
  passTurn: () => void;
  runAnalysis: (opts?: { force?: boolean; visits?: number; maxTimeMs?: number }) => Promise<void>;
  updateSettings: (newSettings: Partial<GameSettings>) => void;
}

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

const ownershipToTerritoryGrid = (ownership: ArrayLike<number>): number[][] => {
  const territory: number[][] = Array(BOARD_SIZE)
    .fill(0)
    .map(() => Array(BOARD_SIZE).fill(0));
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const v = ownership[y * BOARD_SIZE + x];
      territory[y][x] = typeof v === 'number' ? v : 0;
    }
  }
  return territory;
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
  showMoveNumbers: false,
  boardTheme: 'bamboo',
  showLastNMistakes: 3,
  mistakeThreshold: 3.0,
  analysisShowChildren: true,
  analysisShowEval: false,
  analysisShowHints: true,
  analysisShowPolicy: false,
  analysisShowOwnership: false,
  katagoModelUrl: '/models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz',
  katagoVisits: 500,
  katagoMaxTimeMs: 8000,
  katagoBatchSize: 16,
  katagoMaxChildren: 361,
  katagoTopK: 10,
  katagoReuseTree: true,
  katagoOwnershipMode: 'root',
};

let continuousToken = 0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  treeVersion: 0,

  isAiPlaying: false,
  aiColor: null,
  isAnalysisMode: false,
  isContinuousAnalysis: false,
  isTeachMode: false,
  notification: null,
  analysisData: null,
  settings: defaultSettings,
  engineStatus: 'idle',
  engineError: null,

  toggleAi: (color) => set({ isAiPlaying: true, aiColor: color }),

  toggleAnalysisMode: () => set((state) => {
      const newMode = !state.isAnalysisMode;
      if (newMode) {
          setTimeout(() => void get().runAnalysis(), 0);
      }
      return { isAnalysisMode: newMode, isContinuousAnalysis: newMode ? state.isContinuousAnalysis : false, analysisData: state.currentNode.analysis || null };
  }),

  toggleContinuousAnalysis: (quiet = false) => {
      const next = !get().isContinuousAnalysis;
      set((state) => ({ isContinuousAnalysis: next, isAnalysisMode: next ? true : state.isAnalysisMode }));
      if (!quiet) {
          set({ notification: { message: next ? 'Continuous analysis on' : 'Continuous analysis off', type: 'info' } });
          setTimeout(() => set({ notification: null }), 1200);
      }
      if (!next) {
          continuousToken++;
          return;
      }

      const token = ++continuousToken;
      void (async () => {
          let nodeId: string | null = null;
          let visits = 0;

          while (true) {
              const state = get();
              if (token !== continuousToken) return;
              if (!state.isContinuousAnalysis) return;
              if (!state.isAnalysisMode) return;

              const target = Math.max(16, state.settings.katagoVisits);
              if (state.currentNode.id !== nodeId) {
                  nodeId = state.currentNode.id;
                  visits = Math.min(64, target);
              } else if (visits < target) {
                  visits = Math.min(target, Math.max(visits + 1, visits * 2));
              } else {
                  await sleep(500);
                  continue;
              }

              await get().runAnalysis({ force: true, visits });
              await sleep(50);
          }
      })();
  },

  stopAnalysis: () => {
      continuousToken++;
      set({ isContinuousAnalysis: false });
  },

  toggleTeachMode: () => set((state) => {
      const newMode = !state.isTeachMode;
      if (newMode) {
           // Teach mode implies analysis
           setTimeout(() => void get().runAnalysis(), 0);
      }
      return {
          isTeachMode: newMode,
          // If turning on Teach Mode, ensure Analysis Mode is also on (usually)
          isAnalysisMode: newMode ? true : state.isAnalysisMode
      };
  }),

  clearNotification: () => set({ notification: null }),

  runAnalysis: async (opts) => {
      const state = get();
      if (!state.isAnalysisMode) return;

      // Check if current node already has analysis
      if (!opts?.force && state.currentNode.analysis) {
          set({ analysisData: state.currentNode.analysis });
          return;
      }

		      const node = state.currentNode;
		      const parentBoard = node.parent?.gameState.board;
		      const grandparentBoard = node.parent?.parent?.gameState.board;
		      const modelUrl = state.settings.katagoModelUrl;

      set({ engineStatus: 'loading', engineError: null });

      return getKataGoEngineClient()
	        .analyze({
	          positionId: node.id,
	          modelUrl,
	          board: state.board,
	          previousBoard: parentBoard,
	          previousPreviousBoard: grandparentBoard,
	          currentPlayer: state.currentPlayer,
	          moveHistory: state.moveHistory,
	          komi: state.komi,
	          topK: state.settings.katagoTopK,
          visits: opts?.visits ?? state.settings.katagoVisits,
          maxTimeMs: opts?.maxTimeMs ?? state.settings.katagoMaxTimeMs,
          batchSize: state.settings.katagoBatchSize,
          maxChildren: state.settings.katagoMaxChildren,
          reuseTree: state.settings.katagoReuseTree,
          ownershipMode: state.settings.katagoOwnershipMode,
        })
        .then((analysis) => {
          const analysisWithTerritory: AnalysisResult = {
            rootWinRate: analysis.rootWinRate,
            rootScoreLead: analysis.rootScoreLead,
            rootScoreSelfplay: analysis.rootScoreSelfplay,
            rootScoreStdev: analysis.rootScoreStdev,
            moves: analysis.moves,
            territory: ownershipToTerritoryGrid(analysis.ownership),
            policy: analysis.policy,
            ownershipStdev: analysis.ownershipStdev,
          };

          // Store analysis in node even if user navigated elsewhere.
          node.analysis = analysisWithTerritory;

          const latest = get();
          if (latest.currentNode.id === node.id) {
            set({ analysisData: analysisWithTerritory, engineStatus: 'ready', engineError: null });
          } else {
            set({ engineStatus: 'ready', engineError: null });
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          set({
            engineStatus: 'error',
            engineError: msg,
            notification: { message: `Analysis error: ${msg}`, type: 'error' },
          });
          setTimeout(() => set({ notification: null }), 3000);
        });
  },

  updateSettings: (newSettings) =>
    set((state) => {
      const nextSettings: GameSettings = { ...state.settings, ...newSettings };
      const engineKeys: Array<keyof GameSettings> = [
        'katagoModelUrl',
        'katagoVisits',
        'katagoMaxTimeMs',
        'katagoBatchSize',
        'katagoMaxChildren',
        'katagoTopK',
        'katagoOwnershipMode',
      ];

      const engineChanged = engineKeys.some((k) => newSettings[k] !== undefined && newSettings[k] !== state.settings[k]);
      if (!engineChanged) return { settings: nextSettings };

      const clearAnalysis = (node: GameNode) => {
        node.analysis = null;
        for (const child of node.children) clearAnalysis(child);
      };
      clearAnalysis(state.rootNode);

      return {
        settings: nextSettings,
        analysisData: null,
        engineStatus: 'idle',
        engineError: null,
      };
    }),

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
        const analysis = state.currentNode.analysis;

        if (!analysis) {
             // Trigger analysis and block move until it's ready.
	             set({
	               notification: { message: 'Analyzing position...', type: 'info' }
	             });
	             setTimeout(() => set({ notification: null }), 1500);
	             setTimeout(() => void get().runAnalysis(), 0);
	             return;
	        }

        // Check against candidates
        const candidate = analysis.moves.find(m => m.x === x && m.y === y);
        // Default to "bad" if not found in top moves
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
	          setTimeout(() => void get().runAnalysis(), 500);
	      }
	    }
	  },

	  makeAiMove: () => {
	      const state = get();
	      const parentBoard = state.currentNode.parent?.gameState.board;
	      const grandparentBoard = state.currentNode.parent?.parent?.gameState.board;
	      const modelUrl = state.settings.katagoModelUrl;

      void getKataGoEngineClient()
	        .analyze({
	          modelUrl,
	          board: state.board,
	          previousBoard: parentBoard,
	          previousPreviousBoard: grandparentBoard,
	          currentPlayer: state.currentPlayer,
	          moveHistory: state.moveHistory,
	          komi: state.komi,
	          topK: state.settings.katagoTopK,
          visits: state.settings.katagoVisits,
          maxTimeMs: state.settings.katagoMaxTimeMs,
          batchSize: state.settings.katagoBatchSize,
          maxChildren: state.settings.katagoMaxChildren,
        })
        .then((analysis) => {
          const best = analysis.moves[0];
          if (!best) {
            makeHeuristicMove(get());
            return;
          }
          if (best.x === -1 || best.y === -1) get().passTurn();
          else get().playMove(best.x, best.y);
        })
        .catch(() => {
          makeHeuristicMove(get());
        });
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

  switchBranch: (direction) => set((state) => {
      // Mirror KaTrain move tree behavior: switch between nodes at the same depth "column".
      const movePos = new Map<GameNode, { x: number; y: number }>();
      movePos.set(state.rootNode, { x: 0, y: 0 });

      const stack: GameNode[] = [...state.rootNode.children].reverse();
      const nextY = new Map<number, number>();
      const getNextY = (x: number) => nextY.get(x) ?? 0;

      while (stack.length > 0) {
          const node = stack.pop()!;
          const parent = node.parent;
          if (!parent) continue;
          const parentPos = movePos.get(parent);
          if (!parentPos) continue;

          const x = parentPos.x + 1;
          const y = Math.max(getNextY(x), parentPos.y);
          nextY.set(x, y + 1);
          nextY.set(x - 1, Math.max(nextY.get(x) ?? 0, getNextY(x - 1)));
          movePos.set(node, { x, y });

          for (let i = node.children.length - 1; i >= 0; i--) {
              stack.push(node.children[i]!);
          }
      }

      const curPos = movePos.get(state.currentNode);
      if (!curPos) return {};

      const sameX: Array<{ y: number; node: GameNode }> = [];
      for (const [node, pos] of movePos.entries()) {
          if (pos.x === curPos.x) sameX.push({ y: pos.y, node });
      }
      sameX.sort((a, b) => a.y - b.y);
      const idx = sameX.findIndex((n) => n.node.id === state.currentNode.id);
      if (idx < 0) return {};

      const next = sameX[idx + direction]?.node;
      if (!next) return {};

      return {
          currentNode: next,
          board: next.gameState.board,
          currentPlayer: next.gameState.currentPlayer,
          moveHistory: next.gameState.moveHistory,
          capturedBlack: next.gameState.capturedBlack,
          capturedWhite: next.gameState.capturedWhite,
          analysisData: next.analysis || null,
      };
  }),

  undoToBranchPoint: () => set((state) => {
      let node = state.currentNode;
      while (node.parent) {
          node = node.parent;
          if (node.children.length > 1) break;
      }
      if (node.id === state.currentNode.id) return {};
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

  undoToMainBranch: () => set((state) => {
      let node = state.currentNode;
      let lastBranchingNode = node;
      while (node.parent) {
          const prev = node;
          node = node.parent;
          if (node.children.length > 1 && node.children[0] !== prev) {
              lastBranchingNode = node;
          }
      }
      if (lastBranchingNode.id === state.currentNode.id) return {};
      return {
          currentNode: lastBranchingNode,
          board: lastBranchingNode.gameState.board,
          currentPlayer: lastBranchingNode.gameState.currentPlayer,
          moveHistory: lastBranchingNode.gameState.moveHistory,
          capturedBlack: lastBranchingNode.gameState.capturedBlack,
          capturedWhite: lastBranchingNode.gameState.capturedWhite,
          analysisData: lastBranchingNode.analysis || null,
      };
  }),

  makeCurrentNodeMainBranch: () => set((state) => {
      const selected = state.currentNode;
      let node: GameNode | null = selected;
      while (node && node.parent) {
          const parent: GameNode = node.parent;
          const nodeId = node.id;
          const idx = parent.children.findIndex((c: GameNode) => c.id === nodeId);
          if (idx > 0) {
              parent.children.splice(idx, 1);
              parent.children.unshift(node);
          }
          node = parent;
      }
      return { treeVersion: state.treeVersion + 1 };
  }),

  findMistake: (direction) => set((state) => {
      const threshold = state.settings.mistakeThreshold; // KaTrain default: eval_thresholds[-4] == 3.0
      const isMistake = (node: GameNode): boolean => {
          const move = node.move;
          const parentAnalysis = node.parent?.analysis;
          if (!move || !parentAnalysis || move.x < 0 || move.y < 0) return false;
          const candidate = parentAnalysis.moves.find((m) => m.x === move.x && m.y === move.y);
          const pointsLost = candidate ? candidate.pointsLost : 5.0;
          return pointsLost >= threshold;
      };

      let node: GameNode | null = state.currentNode;
      if (direction === 'redo') {
          while (node && node.children.length > 0) {
              const next: GameNode = node.children[0]!;
              if (isMistake(next)) break; // stop one move before the mistake
              node = next;
          }
      } else {
          while (node && node.parent) {
              if (isMistake(node)) {
                  node = node.parent;
                  break;
              }
              node = node.parent;
          }
      }

      if (!node || node.id === state.currentNode.id) return {};
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

  deleteCurrentNode: () => set((state) => {
      const node = state.currentNode;
      if (!node.parent) return {};

      const parent = node.parent;
      const idx = parent.children.findIndex((c) => c.id === node.id);
      if (idx >= 0) parent.children.splice(idx, 1);

      return {
          currentNode: parent,
          board: parent.gameState.board,
          currentPlayer: parent.gameState.currentPlayer,
          moveHistory: parent.gameState.moveHistory,
          capturedBlack: parent.gameState.capturedBlack,
          capturedWhite: parent.gameState.capturedWhite,
          analysisData: parent.analysis || null,
          treeVersion: state.treeVersion + 1,
      };
  }),

  pruneCurrentBranch: () => set((state) => {
      let node: GameNode | null = state.currentNode;
      while (node && node.parent) {
          const parent: GameNode = node.parent;
          parent.children = [node];
          node = parent;
      }
      return { treeVersion: state.treeVersion + 1 };
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
      get().findMistake('redo');
  },

  navigatePrevMistake: () => {
      get().findMistake('undo');
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

    const currentBoard = sgf.initialBoard ? sgf.initialBoard : createEmptyBoard();

    const sgfProps = sgf.tree?.props;
    const plRaw = sgfProps?.['PL']?.[0]?.toUpperCase();
    const pl: Player | null = plRaw === 'B' ? 'black' : plRaw === 'W' ? 'white' : null;
    const firstMovePlayer = sgf.moves[0]?.player;
    const ha = parseInt(sgfProps?.['HA']?.[0] ?? '0', 10);
    const rootPlayer: Player = pl ?? firstMovePlayer ?? (Number.isFinite(ha) && ha >= 2 ? 'white' : 'black');

    const rootState: GameState = {
      board: currentBoard,
      currentPlayer: rootPlayer,
      moveHistory: [],
      capturedBlack: 0,
      capturedWhite: 0,
      komi: sgf.komi || 6.5,
    };

    const newRoot = createNode(null, null, rootState, 'root');

    const cloneProps = (props: Record<string, string[]> | undefined): Record<string, string[]> => {
      const out: Record<string, string[]> = {};
      if (!props) return out;
      for (const [k, v] of Object.entries(props)) out[k] = [...v];
      return out;
    };

    const mergeProps = (target: Record<string, string[]>, src: Record<string, string[]>) => {
      for (const [k, v] of Object.entries(src)) {
        if (!target[k]) target[k] = [...v];
        else target[k] = target[k]!.concat(v);
      }
    };

    const sgfCoordToXy = (coord: string): { x: number; y: number } => {
      if (!coord || coord.length < 2) return { x: -1, y: -1 };
      if (coord === 'tt') return { x: -1, y: -1 };
      const aCode = 'a'.charCodeAt(0);
      return { x: coord.charCodeAt(0) - aCode, y: coord.charCodeAt(1) - aCode };
    };

    const extractMove = (props: Record<string, string[]>): Move | null => {
      const b = props['B']?.[0];
      if (typeof b === 'string') {
        const { x, y } = sgfCoordToXy(b);
        return { x, y, player: 'black' };
      }
      const w = props['W']?.[0];
      if (typeof w === 'string') {
        const { x, y } = sgfCoordToXy(w);
        return { x, y, player: 'white' };
      }
      return null;
    };

    const applyMoveToNode = (parent: GameNode, move: Move): GameNode | null => {
      const parentState = parent.gameState;
      const nextPlayer: Player = move.player === 'black' ? 'white' : 'black';

      if (move.x < 0 || move.y < 0) {
        const passMove: Move = { x: -1, y: -1, player: move.player };
        const newGameState: GameState = {
          board: parentState.board,
          currentPlayer: nextPlayer,
          moveHistory: [...parentState.moveHistory, passMove],
          capturedBlack: parentState.capturedBlack,
          capturedWhite: parentState.capturedWhite,
          komi: parentState.komi,
        };
        return createNode(parent, passMove, newGameState);
      }

      if (parentState.board[move.y]?.[move.x] !== null) return null;

      const tentativeBoard = parentState.board.map((row) => [...row]);
      tentativeBoard[move.y]![move.x] = move.player;
      const { captured, newBoard } = checkCaptures(tentativeBoard, move.x, move.y, move.player);

      if (captured.length === 0) {
        const { liberties } = getLiberties(newBoard, move.x, move.y);
        if (liberties === 0) return null;
      }

      if (parent.parent && JSON.stringify(newBoard) === JSON.stringify(parent.parent.gameState.board)) {
        return null;
      }

      const newCapturedBlack = parentState.capturedBlack + (move.player === 'white' ? captured.length : 0);
      const newCapturedWhite = parentState.capturedWhite + (move.player === 'black' ? captured.length : 0);

      const newMove: Move = { x: move.x, y: move.y, player: move.player };
      const newGameState: GameState = {
        board: newBoard,
        currentPlayer: nextPlayer,
        moveHistory: [...parentState.moveHistory, newMove],
        capturedBlack: newCapturedBlack,
        capturedWhite: newCapturedWhite,
        komi: parentState.komi,
      };
      return createNode(parent, newMove, newGameState);
    };

    if (sgf.tree) {
      const rootPropsCopy = cloneProps(sgf.tree.props);
      delete rootPropsCopy.B;
      delete rootPropsCopy.W;
      newRoot.properties = rootPropsCopy;
      const rootMove = extractMove(sgf.tree.props);
      if (!rootMove && sgf.tree.props['KT'] && !newRoot.analysis) {
        const decoded = decodeKaTrainKt({ kt: sgf.tree.props['KT'] });
        if (decoded) newRoot.analysis = kaTrainAnalysisToAnalysisResult({ analysis: decoded, currentPlayer: rootState.currentPlayer });
      }

      const buildFromSgfNode = (parent: GameNode, node: NonNullable<ParsedSgf['tree']>) => {
        const move = extractMove(node.props);
        if (!move) {
          if (node.props['KT'] && !parent.analysis) {
            const decoded = decodeKaTrainKt({ kt: node.props['KT'] });
            if (decoded) parent.analysis = kaTrainAnalysisToAnalysisResult({ analysis: decoded, currentPlayer: parent.gameState.currentPlayer });
          }
          mergeProps(parent.properties ?? (parent.properties = {}), node.props);
          for (const child of node.children) buildFromSgfNode(parent, child);
          return;
        }

        const childNode = applyMoveToNode(parent, move);
        if (!childNode) return;
        childNode.properties = cloneProps(node.props);
        if (node.props['KT'] && !childNode.analysis) {
          const decoded = decodeKaTrainKt({ kt: node.props['KT'] });
          if (decoded) childNode.analysis = kaTrainAnalysisToAnalysisResult({ analysis: decoded, currentPlayer: childNode.gameState.currentPlayer });
        }
        parent.children.push(childNode);

        for (const child of node.children) buildFromSgfNode(childNode, child);
      };

      if (rootMove) {
        const first = applyMoveToNode(newRoot, rootMove);
        if (first) {
          first.properties = cloneProps(sgf.tree.props);
          if (sgf.tree.props['KT'] && !first.analysis) {
            const decoded = decodeKaTrainKt({ kt: sgf.tree.props['KT'] });
            if (decoded) first.analysis = kaTrainAnalysisToAnalysisResult({ analysis: decoded, currentPlayer: first.gameState.currentPlayer });
          }
          newRoot.children.push(first);
          for (const child of sgf.tree.children) buildFromSgfNode(first, child);
        }
      } else {
        for (const child of sgf.tree.children) buildFromSgfNode(newRoot, child);
      }
    } else {
      // Legacy: just the main line (no SGF tree provided)
      let cursor: GameNode = newRoot;
      for (const mv of sgf.moves) {
        const child = applyMoveToNode(cursor, { x: mv.x, y: mv.y, player: mv.player });
        if (!child) break;
        cursor.children.push(child);
        cursor = child;
      }
    }

    let current = newRoot;
    while (current.children.length > 0) current = current.children[0]!;

    set((state) => ({
      rootNode: newRoot,
      currentNode: current,
      board: current.gameState.board,
      currentPlayer: current.gameState.currentPlayer,
      moveHistory: current.gameState.moveHistory,
      capturedBlack: current.gameState.capturedBlack,
      capturedWhite: current.gameState.capturedWhite,
      komi: rootState.komi,
      analysisData: current.analysis || null,
      treeVersion: state.treeVersion + 1,
    }));
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

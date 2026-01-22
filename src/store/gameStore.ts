import { createWithEqualityFn as create } from 'zustand/traditional';
import { BOARD_SIZE, type FloatArray, type GameRules, type GameState, type BoardState, type Player, type AnalysisResult, type GameNode, type Move, type GameSettings, type CandidateMove, type RegionOfInterest } from '../types';
import { applyCapturesInPlace, boardsEqual, getLiberties, getLegalMoves, isEye } from '../utils/gameLogic';
import { playStoneSound, playCaptureSound, playPassSound, playNewGameSound } from '../utils/sound';
import { extractKaTrainUserNoteFromSgfComment, type ParsedSgf } from '../utils/sgf';
import { getKataGoEngineClient, isKataGoCanceledError } from '../engine/katago/client';
import type { KataGoAnalysisPayload } from '../engine/katago/types';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from '../engine/katago/limits';
import { decodeKaTrainKt, kaTrainAnalysisToAnalysisResult } from '../utils/katrainSgfAnalysis';
import { publicUrl } from '../utils/publicUrl';
import { isBoardThemeId } from '../utils/boardThemes';

interface GameStore extends GameState {
  // Tree State
  rootNode: GameNode;
  currentNode: GameNode;
  treeVersion: number;

  // Settings & Modes
  boardRotation: 0 | 1 | 2 | 3; // 0,90,180,270 degrees clockwise (KaTrain rotate)
  regionOfInterest: RegionOfInterest | null;
  isSelectingRegionOfInterest: boolean;
  isInsertMode: boolean;
  insertAfterNodeId: string | null; // Main-branch continuation to copy after insert.
  insertAnchorNodeId: string | null; // Where insert mode started.
  isSelfplayToEnd: boolean;
  isGameAnalysisRunning: boolean;
  gameAnalysisType: 'quick' | 'fast' | 'full' | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
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
  engineBackend: string | null;
  engineModelName: string | null;

  // Timer (KaTrain-like)
  timerPaused: boolean;
  timerMainTimeUsedSeconds: number; // Shared main time used (KaTrain semantics)
  timerPeriodsUsed: { black: number; white: number }; // Byo-yomi periods used per player

  // Actions
  toggleAi: (color: Player) => void;
  toggleAnalysisMode: () => void;
  toggleContinuousAnalysis: (quiet?: boolean) => void;
  stopAnalysis: () => void;
  toggleTeachMode: () => void;
  clearNotification: () => void;
  toggleTimerPaused: () => void;
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
  resign: () => void;
  runAnalysis: (opts?: {
    force?: boolean;
    visits?: number;
    maxTimeMs?: number;
    batchSize?: number;
    maxChildren?: number;
    topK?: number;
    analysisPvLen?: number;
    wideRootNoise?: number;
    nnRandomize?: boolean;
    conservativePass?: boolean;
    reuseTree?: boolean;
    ownershipRefreshIntervalMs?: number;
    reportEveryMs?: number;
  }) => Promise<void>;
  analyzeExtra: (mode: 'extra' | 'equalize' | 'sweep' | 'alternative' | 'stop') => void;
  resetCurrentAnalysis: () => void;
  startSelectRegionOfInterest: () => void;
  cancelSelectRegionOfInterest: () => void;
  setRegionOfInterest: (roi: RegionOfInterest | null) => void;
  toggleInsertMode: () => void;
  selfplayToEnd: () => void;
  stopSelfplayToEnd: () => void;
  startQuickGameAnalysis: () => void;
  startFastGameAnalysis: () => void;
  startFullGameAnalysis: (opts: { visits: number; moveRange?: [number, number] | null; mistakesOnly?: boolean }) => void;
  stopGameAnalysis: () => void;
  updateSettings: (newSettings: Partial<GameSettings>) => void;
  setRootProperty: (key: string, value: string) => void;
  setCurrentNodeNote: (note: string) => void;
  rotateBoard: () => void;
  startNewGame: (opts: { komi: number; rules: GameRules }) => void;
}

const createEmptyBoard = (): BoardState => {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
};

const EMPTY_TERRITORY: number[][] = Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => 0));

const SETTINGS_STORAGE_KEY = 'web-katrain:settings:v1';
const DEFAULT_MODEL_PATH = 'models/katago-small.bin.gz';

const normalizeModelUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(blob:|data:)/i.test(trimmed)) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('/models/')) return publicUrl(trimmed.slice(1));
    return trimmed;
  }
  if (trimmed.startsWith('models/')) return publicUrl(trimmed);
  return trimmed;
};

const resolveModelUrlForFetch = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^(blob:|data:|https?:|file:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return trimmed;
  if (typeof window === 'undefined') return trimmed;
  // Absolute paths (starting with /) resolve against the origin
  if (trimmed.startsWith('/')) {
    return new URL(trimmed, window.location.origin).toString();
  }
  // Relative paths resolve against the current page href
  return new URL(trimmed, window.location.href).toString();
};

const loadStoredSettings = (): Partial<GameSettings> | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if ('katagoModelUrl' in parsed) {
      const normalized = normalizeModelUrl((parsed as { katagoModelUrl?: unknown }).katagoModelUrl);
      if (normalized) {
        (parsed as { katagoModelUrl: string }).katagoModelUrl = normalized;
      } else {
        delete (parsed as { katagoModelUrl?: unknown }).katagoModelUrl;
      }
    }
    if ('boardTheme' in parsed) {
      if (!isBoardThemeId((parsed as { boardTheme?: unknown }).boardTheme)) {
        delete (parsed as { boardTheme?: unknown }).boardTheme;
      }
    }
    return parsed as Partial<GameSettings>;
  } catch {
    return null;
  }
};

const saveStoredSettings = (settings: GameSettings): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota/permission errors.
  }
};

const rulesToSgfRu = (rules: GameRules): string => {
  switch (rules) {
    case 'japanese':
      return 'Japanese';
    case 'chinese':
      return 'Chinese';
    case 'korean':
      return 'Korean';
  }
};

const parseSgfRu = (ru: string | undefined): GameRules | null => {
  if (!ru) return null;
  const v = ru.trim().toLowerCase();
  if (!v) return null;
  if (v === 'jp' || v.includes('japanese')) return 'japanese';
  if (v === 'ko' || v.includes('korean')) return 'korean';
  if (v === 'cn' || v.includes('chinese')) return 'chinese';
  return null;
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

const isPassMove = (m: Move | null | undefined): boolean => !!m && (m.x < 0 || m.y < 0);

const moveKey = (m: Move): string => `${m.player}:${m.x},${m.y}`;

const collectNodesInTree = (root: GameNode): GameNode[] => {
  const out: GameNode[] = [];
  const stack: GameNode[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    out.push(n);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]!);
  }
  return out;
};

const computePointsLostForNode = (node: GameNode): number | null => {
  const move = node.move;
  const parent = node.parent;
  if (!move || !parent) return null;

  const parentScore = parent.analysis?.rootScoreLead;
  const childScore = node.analysis?.rootScoreLead;
  if (typeof parentScore === 'number' && typeof childScore === 'number') {
    const sign = move.player === 'black' ? 1 : -1;
    return sign * (parentScore - childScore);
  }
  return null;
};

const normalizeRegionOfInterest = (roi: RegionOfInterest | null): RegionOfInterest | null => {
  if (!roi) return null;
  const xMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.xMin, roi.xMax)));
  const xMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.xMin, roi.xMax)));
  const yMin = Math.max(0, Math.min(BOARD_SIZE - 1, Math.min(roi.yMin, roi.yMax)));
  const yMax = Math.max(0, Math.min(BOARD_SIZE - 1, Math.max(roi.yMin, roi.yMax)));
  const isSinglePoint = xMin === xMax && yMin === yMax;
  const isWholeBoard = xMin === 0 && yMin === 0 && xMax === BOARD_SIZE - 1 && yMax === BOARD_SIZE - 1;
  if (isSinglePoint || isWholeBoard) return null; // KaTrain semantics.
  return { xMin, xMax, yMin, yMax };
};

const isMoveInRegion = (m: CandidateMove, roi: RegionOfInterest): boolean => {
  if (m.x < 0 || m.y < 0) return true; // Pass always allowed.
  return m.x >= roi.xMin && m.x <= roi.xMax && m.y >= roi.yMin && m.y <= roi.yMax;
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
        endState: null,
        timeUsedSeconds: 0,
        analysis: null,
        analysisVisitsRequested: 0,
        autoUndo: null,
        undoThreshold: Math.random(),
        aiThoughts: '',
        note: '',
        properties: {}
    };
};

const findNodeById = (root: GameNode, id: string): GameNode | null => {
  if (root.id === id) return root;
  const stack: GameNode[] = [...root.children];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n.id === id) return n;
    for (let i = 0; i < n.children.length; i++) stack.push(n.children[i]!);
  }
  return null;
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
initialRoot.properties = { RU: [rulesToSgfRu('japanese')] };

const defaultSettings: GameSettings = {
  soundEnabled: true,
  showCoordinates: true,
  showMoveNumbers: false,
  showBoardControls: true,
  showNextMovePreview: true,
  boardTheme: 'hikaru',
  uiTheme: 'noir',
  uiDensity: 'comfortable',
  timerSound: true,
  timerMainTimeMinutes: 0,
  timerByoLengthSeconds: 30,
  timerByoPeriods: 5,
  timerMinimalUseSeconds: 0,
  showLastNMistakes: 3,
  mistakeThreshold: 3.0,
  loadSgfRewind: true,
  loadSgfFastAnalysis: false,
  animPvTimeSeconds: 0.5,
  gameRules: 'japanese',
  trainerLowVisits: 25,
  trainerTheme: 'theme:normal',
  trainerEvalThresholds: [12, 6, 3, 1.5, 0.5, 0],
  trainerShowDots: [true, true, true, true, true, true],
  trainerSaveFeedback: [true, true, true, true, false, false],
  trainerEvalShowAi: true,
  trainerTopMovesShow: 'top_move_delta_score',
  trainerTopMovesShowSecondary: 'top_move_visits',
  trainerExtraPrecision: false,
  trainerSaveAnalysis: false,
  trainerSaveMarks: false,
  trainerLockAi: false,
  analysisShowChildren: true,
  analysisShowEval: true,
  analysisShowHints: true,
  analysisShowPolicy: false,
  analysisShowOwnership: true,
  katagoModelUrl: publicUrl(DEFAULT_MODEL_PATH),
  katagoVisits: 500,
  katagoFastVisits: 25,
  katagoMaxTimeMs: 8000,
  katagoBatchSize: 16,
  katagoMaxChildren: 361,
  katagoTopK: 10,
  katagoReuseTree: true,
  katagoOwnershipMode: 'root',
  katagoWideRootNoise: 0.04,
  katagoAnalysisPvLen: 15,
  katagoNnRandomize: true,
  katagoConservativePass: true,
  teachNumUndoPrompts: [1, 1, 1, 0.5, 0, 0],

  aiStrategy: 'rank',
  aiRankKyu: 4.0,
  aiScoreLossStrength: 0.2,
  aiPolicyOpeningMoves: 22,
  aiWeightedPickOverride: 1.0,
  aiWeightedWeakenFac: 1.25,
  aiWeightedLowerBound: 0.001,

  aiPickPickOverride: 0.95,
  aiPickPickN: 5,
  aiPickPickFrac: 0.35,

  aiLocalPickOverride: 0.95,
  aiLocalStddev: 1.5,
  aiLocalPickN: 15,
  aiLocalPickFrac: 0.0,
  aiLocalEndgame: 0.5,

  aiTenukiPickOverride: 0.85,
  aiTenukiStddev: 7.5,
  aiTenukiPickN: 5,
  aiTenukiPickFrac: 0.4,
  aiTenukiEndgame: 0.45,

  aiInfluencePickOverride: 0.95,
  aiInfluencePickN: 5,
  aiInfluencePickFrac: 0.3,
  aiInfluenceThreshold: 3.5,
  aiInfluenceLineWeight: 10,
  aiInfluenceEndgame: 0.4,

  aiTerritoryPickOverride: 0.95,
  aiTerritoryPickN: 5,
  aiTerritoryPickFrac: 0.3,
  aiTerritoryThreshold: 3.5,
  aiTerritoryLineWeight: 2,
  aiTerritoryEndgame: 0.4,

  aiJigoTargetScore: 0.5,

  aiOwnershipMaxPointsLost: 1.75,
  aiOwnershipSettledWeight: 1.0,
  aiOwnershipOpponentFac: 0.5,
  aiOwnershipMinVisits: 3,
  aiOwnershipAttachPenalty: 1.0,
  aiOwnershipTenukiPenalty: 0.5,
};

const initialSettings: GameSettings = {
  ...defaultSettings,
  ...(loadStoredSettings() ?? {}),
};

let continuousToken = 0;
let selfplayToken = 0;
let gameAnalysisToken = 0;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// KaTrain-style report cadence (seconds -> ms).
const REPORT_DURING_SEARCH_EVERY_MS = 1000;
const CONTINUOUS_REPORT_DURING_SEARCH_MS = 250;
// Throttle UI updates during progress reports to reduce main-thread churn.
const PROGRESS_APPLY_MIN_MS = 500;

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

  boardRotation: 0,
  regionOfInterest: null,
  isSelectingRegionOfInterest: false,
  isInsertMode: false,
  insertAfterNodeId: null,
  insertAnchorNodeId: null,
  isSelfplayToEnd: false,
  isGameAnalysisRunning: false,
  gameAnalysisType: null,
  gameAnalysisDone: 0,
  gameAnalysisTotal: 0,
  isAiPlaying: false,
  aiColor: null,
  isAnalysisMode: false,
  isContinuousAnalysis: false,
  isTeachMode: false,
  notification: null,
  analysisData: null,
  settings: initialSettings,
  engineStatus: 'idle',
  engineError: null,
  engineBackend: null,
  engineModelName: null,

  timerPaused: true,
  timerMainTimeUsedSeconds: 0,
  timerPeriodsUsed: { black: 0, white: 0 },

  toggleAi: (color) => {
    const s = get();
    const nextOn = !(s.isAiPlaying && s.aiColor === color);
    set({ isAiPlaying: nextOn, aiColor: nextOn ? color : null });
    const after = get();
    if (after.isAiPlaying && after.aiColor === after.currentPlayer) {
      setTimeout(() => after.makeAiMove(), 0);
    }
  },

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
          while (true) {
              const state = get();
              if (token !== continuousToken) return;
              if (!state.isContinuousAnalysis) return;
              if (!state.isAnalysisMode) return;

              const target = Math.max(16, state.settings.katagoVisits);
              const rawFast = state.settings.katagoFastVisits;
              const fast = Number.isFinite(rawFast) ? rawFast : 25;
              const initialVisits = Math.max(16, Math.min(target, Math.floor(fast)));
              const node = state.currentNode;
              const currentVisits =
                typeof node.analysis?.rootVisits === 'number' ? node.analysis.rootVisits : (node.analysisVisitsRequested ?? 0);
              const normalizedVisits = Number.isFinite(currentVisits) ? Math.max(0, Math.floor(currentVisits)) : 0;

              let nextVisits: number;
              if (normalizedVisits < 1) {
                  nextVisits = initialVisits;
              } else if (normalizedVisits < target) {
                  const bumped = Math.max(normalizedVisits + 1, normalizedVisits * 2);
                  nextVisits = Math.min(target, Math.max(initialVisits, bumped));
              } else {
                  await sleep(500);
                  continue;
              }

              await get().runAnalysis({
                force: true,
                visits: nextVisits,
                reuseTree: true,
                ownershipRefreshIntervalMs: state.settings.katagoOwnershipMode === 'tree' ? 500 : undefined,
              });
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

  toggleTimerPaused: () => set((state) => ({ timerPaused: !state.timerPaused })),

  startSelectRegionOfInterest: () =>
    set(() => ({
      isSelectingRegionOfInterest: true,
    })),

  cancelSelectRegionOfInterest: () =>
    set(() => ({
      isSelectingRegionOfInterest: false,
    })),

  setRegionOfInterest: (roi) => {
    const normalized = normalizeRegionOfInterest(roi);
    set((state) => ({
      regionOfInterest: normalized,
      isSelectingRegionOfInterest: false,
      treeVersion: state.treeVersion + 1,
    }));
    if (get().isAnalysisMode) setTimeout(() => void get().runAnalysis({ force: true }), 0);
  },

  resetCurrentAnalysis: () => {
    const s = get();
    s.currentNode.analysis = null;
    s.currentNode.analysisVisitsRequested = 0;
    set((state) => ({ analysisData: null, treeVersion: state.treeVersion + 1 }));
    if (get().isAnalysisMode) setTimeout(() => void get().runAnalysis({ force: true }), 0);
  },

  analyzeExtra: (mode) => {
    const s = get();
    if (mode === 'stop') {
      s.stopAnalysis();
      s.stopSelfplayToEnd();
      s.stopGameAnalysis();
      return;
    }

    if (!s.isAnalysisMode) set({ isAnalysisMode: true });

    const longTimeMs = Math.min(ENGINE_MAX_TIME_MS, 60_000);

    const toast = (message: string) => {
      set({ notification: { message, type: 'info' } });
      setTimeout(() => set({ notification: null }), 1600);
    };

    if (mode === 'extra') {
      const base = Math.max(16, Math.min(s.settings.katagoVisits, ENGINE_MAX_VISITS));
      const prev = Math.max(0, Math.min(s.currentNode.analysisVisitsRequested ?? base, ENGINE_MAX_VISITS));
      const visits = Math.max(16, Math.min(prev + base, ENGINE_MAX_VISITS));
      toast(`Extra analysis: ${visits} visits`);
      void s.runAnalysis({ force: true, visits, maxTimeMs: longTimeMs });
      return;
    }

    if (mode === 'equalize') {
      const analysis = s.currentNode.analysis;
      if (!analysis || analysis.moves.length === 0) {
        toast('Equalize: wait for analysis first.');
        return;
      }
      const maxMoveVisits = analysis.moves.reduce((acc, cur) => Math.max(acc, cur.visits), 1);
      const target = Math.max(maxMoveVisits * analysis.moves.length, s.currentNode.analysisVisitsRequested ?? s.settings.katagoVisits);
      const visits = Math.max(16, Math.min(target, ENGINE_MAX_VISITS));
      toast(`Equalize: ${visits} visits`);
      void s.runAnalysis({ force: true, visits, maxTimeMs: longTimeMs });
      return;
    }

    if (mode === 'sweep') {
      const visits = Math.max(16, Math.min(s.settings.katagoFastVisits, ENGINE_MAX_VISITS));
      toast(`Sweep: ${visits} visits, maxChildren 361`);
      void s.runAnalysis({
        force: true,
        visits,
        maxChildren: 361,
        topK: Math.max(s.settings.katagoTopK, 20),
        reuseTree: false,
        maxTimeMs: longTimeMs,
      });
      return;
    }

    if (mode === 'alternative') {
      const visits = Math.max(16, Math.min(s.settings.katagoFastVisits, ENGINE_MAX_VISITS));
      const wideRootNoise = Math.max(s.settings.katagoWideRootNoise, 0.12);
      toast(`Alternative: ${visits} visits, noise ${wideRootNoise.toFixed(2)}`);
      void s.runAnalysis({
        force: true,
        visits,
        wideRootNoise,
        reuseTree: false,
        maxTimeMs: longTimeMs,
      });
    }
  },

  toggleInsertMode: () => {
    const s = get();
    if (!s.isInsertMode) {
      if (s.currentNode.children.length === 0) {
        set({ notification: { message: 'Insert mode: no continuation to insert into.', type: 'error' } });
        setTimeout(() => set({ notification: null }), 2000);
        return;
      }
      const insertAfter = s.currentNode.children[0]!;
      set((state) => ({
        isInsertMode: true,
        insertAfterNodeId: insertAfter.id,
        insertAnchorNodeId: state.currentNode.id,
        treeVersion: state.treeVersion + 1,
      }));
      return;
    }

    const insertAfterId = s.insertAfterNodeId;
    const anchorId = s.insertAnchorNodeId;
    if (!insertAfterId || !anchorId) {
      set({ isInsertMode: false, insertAfterNodeId: null, insertAnchorNodeId: null });
      return;
    }

    const insertAfter = findNodeById(s.rootNode, insertAfterId);
    const anchor = findNodeById(s.rootNode, anchorId);
    if (!insertAfter || !anchor || insertAfter.parent?.id !== anchor.id) {
      set({ isInsertMode: false, insertAfterNodeId: null, insertAnchorNodeId: null, treeVersion: s.treeVersion + 1 });
      return;
    }

    if (s.currentNode.id === anchor.id) {
      set((state) => ({
        isInsertMode: false,
        insertAfterNodeId: null,
        insertAnchorNodeId: null,
        treeVersion: state.treeVersion + 1,
      }));
      return;
    }

    // Copy continuation from insertAfter down its mainline onto the inserted branch.
    const insertedMoves = new Set<string>();
    {
      const above = new Set<string>();
      let n: GameNode | null = insertAfter;
      while (n) {
        above.add(n.id);
        n = n.parent;
      }
      let cur: GameNode | null = s.currentNode;
      while (cur && !above.has(cur.id)) {
        if (cur.move) insertedMoves.add(moveKey(cur.move));
        cur = cur.parent;
      }
    }

    let numCopied = 0;
    let from: GameNode | null = insertAfter;
    let to: GameNode = s.currentNode;

    const tryCreateChild = (parent: GameNode, move: Move): GameNode | null => {
      const st = parent.gameState;
      if (st.currentPlayer !== move.player) return null;

      if (isPassMove(move)) {
        const nextPlayer: Player = st.currentPlayer === 'black' ? 'white' : 'black';
        const nextState: GameState = {
          board: st.board,
          currentPlayer: nextPlayer,
          moveHistory: [...st.moveHistory, move],
          capturedBlack: st.capturedBlack,
          capturedWhite: st.capturedWhite,
          komi: st.komi,
        };
        const child = createNode(parent, move, nextState);
        parent.children.push(child);
        return child;
      }

	      if (st.board[move.y]?.[move.x] !== null) return null;
	      const tentativeBoard = st.board.map((row) => [...row]);
	      tentativeBoard[move.y]![move.x] = st.currentPlayer;
	      const captured = applyCapturesInPlace(tentativeBoard, move.x, move.y, st.currentPlayer);
	      const newBoard = tentativeBoard;
	      if (captured.length === 0) {
	        const { liberties } = getLiberties(newBoard, move.x, move.y);
	        if (liberties === 0) return null;
	      }
      if (parent.parent && boardsEqual(newBoard, parent.parent.gameState.board)) return null;

      const newCapturedBlack = st.capturedBlack + (st.currentPlayer === 'white' ? captured.length : 0);
      const newCapturedWhite = st.capturedWhite + (st.currentPlayer === 'black' ? captured.length : 0);
      const nextPlayer: Player = st.currentPlayer === 'black' ? 'white' : 'black';
      const nextState: GameState = {
        board: newBoard,
        currentPlayer: nextPlayer,
        moveHistory: [...st.moveHistory, move],
        capturedBlack: newCapturedBlack,
        capturedWhite: newCapturedWhite,
        komi: st.komi,
      };

      const child = createNode(parent, move, nextState);
      parent.children.push(child);
      return child;
    };

    while (from) {
      const move = from.move;
      if (!move) break;
      if (!insertedMoves.has(moveKey(move))) {
        const child = tryCreateChild(to, move);
        if (!child) break;
        to = child;
        numCopied++;
      }
      from = from.children[0] ?? null;
    }

    set((state) => ({
      isInsertMode: false,
      insertAfterNodeId: null,
      insertAnchorNodeId: null,
      treeVersion: state.treeVersion + 1,
      notification: numCopied > 0 ? { message: `Insert mode ended: copied ${numCopied} moves.`, type: 'info' } : state.notification,
    }));
    if (numCopied > 0) setTimeout(() => set({ notification: null }), 1800);
  },

  selfplayToEnd: () => {
    const token = ++selfplayToken;
    set({ isSelfplayToEnd: true });

    void (async () => {
      let safety = 0;
      while (true) {
        const s = get();
        if (token !== selfplayToken) return;
        if (!s.isSelfplayToEnd) return;

        while (get().engineStatus === 'loading') {
          if (token !== selfplayToken) return;
          if (!get().isSelfplayToEnd) return;
          await sleep(50);
        }

        const mh = s.moveHistory;
        const last = mh[mh.length - 1];
        const prev = mh[mh.length - 2];
        if (isPassMove(last) && isPassMove(prev)) {
          set({ isSelfplayToEnd: false });
          return;
        }
        if (safety++ > 2000) {
          set({ isSelfplayToEnd: false, notification: { message: 'Selfplay stopped (move limit).', type: 'error' } });
          setTimeout(() => set({ notification: null }), 2000);
          return;
        }

        try {
          const node = s.currentNode;
          const parentBoard = node.parent?.gameState.board;
          const grandparentBoard = node.parent?.parent?.gameState.board;
          const modelUrl = resolveModelUrlForFetch(s.settings.katagoModelUrl);
          const analysis = await getKataGoEngineClient().analyze({
            positionId: node.id,
            parentPositionId: node.parent?.id,
            modelUrl,
            board: s.board,
            previousBoard: parentBoard,
            previousPreviousBoard: grandparentBoard,
            currentPlayer: s.currentPlayer,
            moveHistory: s.moveHistory,
            komi: s.komi,
            rules: s.settings.gameRules,
            topK: Math.max(1, Math.min(s.settings.katagoTopK, 10)),
            analysisPvLen: Math.max(0, Math.min(s.settings.katagoAnalysisPvLen, 30)),
            includeMovesOwnership: false,
            wideRootNoise: 0.0,
            nnRandomize: false,
            conservativePass: s.settings.katagoConservativePass,
            visits: Math.max(16, Math.min(s.settings.katagoFastVisits, ENGINE_MAX_VISITS)),
            maxTimeMs: Math.max(250, Math.min(s.settings.katagoMaxTimeMs, ENGINE_MAX_TIME_MS)),
            batchSize: s.settings.katagoBatchSize,
            maxChildren: s.settings.katagoMaxChildren,
            reuseTree: false,
            ownershipMode: 'none',
            analysisGroup: 'background',
          });

          const best = analysis.moves[0] ?? null;
          if (!best || best.x < 0 || best.y < 0) s.passTurn();
          else s.playMove(best.x, best.y);
        } catch (err) {
          if (isKataGoCanceledError(err)) {
            await sleep(25);
            continue;
          }
          // Fall back to heuristics if engine fails.
          makeHeuristicMove(get());
        }

        await sleep(50);
      }
    })();
  },

  stopSelfplayToEnd: () => {
    selfplayToken++;
    set({ isSelfplayToEnd: false });
  },

  startQuickGameAnalysis: () => {
    const token = ++gameAnalysisToken;
    const state = get();

    const nodes: GameNode[] = [];
    let cursor: GameNode | null = state.rootNode;
    while (cursor) {
      nodes.push(cursor);
      cursor = cursor.children[0] ?? null;
    }

    const total = nodes.length;
    if (total <= 1) {
      set({ isGameAnalysisRunning: false, gameAnalysisType: null, gameAnalysisDone: 0, gameAnalysisTotal: total });
      return;
    }

    set({ isGameAnalysisRunning: true, gameAnalysisType: 'quick', gameAnalysisDone: 0, gameAnalysisTotal: total });

    void (async () => {
      let done = 0;
      let lastUiUpdate = performance.now();
      let metaSynced = false;

      const evalBatchSize = Math.max(1, Math.min(get().settings.katagoBatchSize, 8));

      for (let start = 0; start < nodes.length; start += evalBatchSize) {
        if (token !== gameAnalysisToken) return;
        if (!get().isGameAnalysisRunning) return;
        if (get().gameAnalysisType !== 'quick') return;

        // If interactive analysis is running/queued, pause bulk analysis.
        while (get().engineStatus === 'loading') {
          if (token !== gameAnalysisToken) return;
          if (!get().isGameAnalysisRunning) return;
          if (get().gameAnalysisType !== 'quick') return;
          await sleep(50);
        }

        const chunk = nodes.slice(start, start + evalBatchSize);
        const toEval = chunk.filter((n) => !n.analysis);
        if (toEval.length > 0) {
          try {
            const modelUrl = resolveModelUrlForFetch(get().settings.katagoModelUrl);
            const evals = await getKataGoEngineClient().evaluateBatch({
              modelUrl,
              positions: toEval.map((n) => ({
                board: n.gameState.board,
                previousBoard: n.parent?.gameState.board,
                previousPreviousBoard: n.parent?.parent?.gameState.board,
                currentPlayer: n.gameState.currentPlayer,
                moveHistory: n.gameState.moveHistory,
                komi: n.gameState.komi,
              })),
              rules: get().settings.gameRules,
              conservativePass: get().settings.katagoConservativePass,
            });
            if (!metaSynced) {
              const engineInfo = getKataGoEngineClient().getEngineInfo();
              set({ engineBackend: engineInfo.backend, engineModelName: engineInfo.modelName });
              metaSynced = true;
            }

            for (let i = 0; i < toEval.length; i++) {
              const node = toEval[i]!;
              const evaled = evals[i]!;
              node.analysis = {
                rootWinRate: evaled.rootWinRate,
                rootScoreLead: evaled.rootScoreLead,
                rootScoreSelfplay: evaled.rootScoreSelfplay,
                rootScoreStdev: evaled.rootScoreStdev,
                moves: [],
                territory: EMPTY_TERRITORY,
                policy: undefined,
                ownershipStdev: undefined,
                ownershipMode: 'none',
              };
              node.analysisVisitsRequested = Math.max(node.analysisVisitsRequested ?? 0, 1);
            }
          } catch {
            // Ignore failures for bulk analysis; individual node analysis can still run later.
          }
        }

        done += chunk.length;

        const now = performance.now();
        if (now - lastUiUpdate > 120 || done === total) {
          set((s) => ({
            gameAnalysisDone: done,
            gameAnalysisTotal: total,
            treeVersion: s.treeVersion + 1,
          }));
          lastUiUpdate = now;
        }

        await sleep(0);
      }

      if (token !== gameAnalysisToken) return;
      set((s) => ({
        isGameAnalysisRunning: false,
        gameAnalysisType: null,
        gameAnalysisDone: done,
        gameAnalysisTotal: total,
        treeVersion: s.treeVersion + 1,
      }));
    })();
  },

  startFastGameAnalysis: () => {
    const token = ++gameAnalysisToken;
    const state = get();

    const nodes: GameNode[] = [];
    let cursor: GameNode | null = state.rootNode;
    while (cursor) {
      nodes.push(cursor);
      cursor = cursor.children[0] ?? null;
    }

    const total = nodes.length;
    if (total <= 1) {
      set({ isGameAnalysisRunning: false, gameAnalysisType: null, gameAnalysisDone: 0, gameAnalysisTotal: total });
      return;
    }

    set({ isGameAnalysisRunning: true, gameAnalysisType: 'fast', gameAnalysisDone: 0, gameAnalysisTotal: total });

    void (async () => {
      const fastVisits = Math.max(16, Math.min(get().settings.katagoFastVisits, ENGINE_MAX_VISITS));
      const maxTimeMs = Math.max(50, Math.min(600, Math.floor(get().settings.katagoMaxTimeMs * 0.15)));
      const batchSize = Math.max(1, Math.min(get().settings.katagoBatchSize, 64));
      const maxChildren = Math.max(4, Math.min(get().settings.katagoMaxChildren, 361));
      const topK = Math.max(1, Math.min(get().settings.katagoTopK, 10));
      const analysisPvLen = Math.max(0, Math.min(get().settings.katagoAnalysisPvLen, 15));

      let done = 0;
      let lastUiUpdate = performance.now();
      let metaSynced = false;

      for (const node of nodes) {
        if (token !== gameAnalysisToken) return;
        if (!get().isGameAnalysisRunning) return;
        if (get().gameAnalysisType !== 'fast') return;

        // If interactive analysis is running/queued, pause bulk analysis.
        while (get().engineStatus === 'loading') {
          if (token !== gameAnalysisToken) return;
          if (!get().isGameAnalysisRunning) return;
          if (get().gameAnalysisType !== 'fast') return;
          await sleep(50);
        }

        const already = node.analysis && (node.analysisVisitsRequested ?? 0) >= fastVisits;
        if (!already) {
          try {
            const parentBoard = node.parent?.gameState.board;
            const grandparentBoard = node.parent?.parent?.gameState.board;
            const modelUrl = resolveModelUrlForFetch(get().settings.katagoModelUrl);
            const analysis = await getKataGoEngineClient().analyze({
              positionId: node.id,
              parentPositionId: node.parent?.id,
              modelUrl,
              board: node.gameState.board,
              previousBoard: parentBoard,
              previousPreviousBoard: grandparentBoard,
              currentPlayer: node.gameState.currentPlayer,
              moveHistory: node.gameState.moveHistory,
              komi: node.gameState.komi,
              rules: get().settings.gameRules,
              topK,
              analysisPvLen,
              includeMovesOwnership: false,
              wideRootNoise: get().settings.katagoWideRootNoise,
              nnRandomize: get().settings.katagoNnRandomize,
              conservativePass: get().settings.katagoConservativePass,
              visits: fastVisits,
              maxTimeMs,
              batchSize,
              maxChildren,
              reuseTree: false,
              ownershipMode: 'none',
              analysisGroup: 'background',
            });
            if (!metaSynced) {
              const engineInfo = getKataGoEngineClient().getEngineInfo();
              set({ engineBackend: engineInfo.backend, engineModelName: engineInfo.modelName });
              metaSynced = true;
            }

            node.analysis = {
              rootWinRate: analysis.rootWinRate,
              rootScoreLead: analysis.rootScoreLead,
              rootScoreSelfplay: analysis.rootScoreSelfplay,
              rootScoreStdev: analysis.rootScoreStdev,
              moves: analysis.moves,
              territory: EMPTY_TERRITORY,
              policy: undefined,
              ownershipStdev: undefined,
              ownershipMode: 'none',
            };
            node.analysisVisitsRequested = fastVisits;
          } catch {
            // Ignore failures for bulk analysis; individual node analysis can still run later.
          }
        }

        done++;

        const now = performance.now();
        if (now - lastUiUpdate > 120 || done === total) {
          set((s) => ({
            gameAnalysisDone: done,
            gameAnalysisTotal: total,
            treeVersion: s.treeVersion + 1,
          }));
          lastUiUpdate = now;
        }

        await sleep(0);
      }

      if (token !== gameAnalysisToken) return;
      set((s) => ({
        isGameAnalysisRunning: false,
        gameAnalysisType: null,
        gameAnalysisDone: done,
        gameAnalysisTotal: total,
        treeVersion: s.treeVersion + 1,
      }));
    })();
  },

  startFullGameAnalysis: (opts) => {
    const token = ++gameAnalysisToken;
    const state = get();

    const visits = Math.max(16, Math.min(Math.floor(opts.visits || 0), ENGINE_MAX_VISITS));
    const moveRangeRaw = opts.moveRange ?? null;
    const moveRange: [number, number] | null = moveRangeRaw
      ? [Math.min(moveRangeRaw[0]!, moveRangeRaw[1]!), Math.max(moveRangeRaw[0]!, moveRangeRaw[1]!)]
      : null;
    const mistakesOnly = opts.mistakesOnly === true;

    const nodes = collectNodesInTree(state.rootNode);
    const total = nodes.length;
    if (total <= 1) {
      set({ isGameAnalysisRunning: false, gameAnalysisType: null, gameAnalysisDone: 0, gameAnalysisTotal: total });
      return;
    }

    set({ isGameAnalysisRunning: true, gameAnalysisType: 'full', gameAnalysisDone: 0, gameAnalysisTotal: total });

    void (async () => {
      let done = 0;
      let lastUiUpdate = performance.now();
      let metaSynced = false;

      const thresholds = get().settings.trainerEvalThresholds?.length ? get().settings.trainerEvalThresholds : [12, 6, 3, 1.5, 0.5, 0];
      const mistakesThreshold =
        thresholds.length >= 4 ? thresholds[thresholds.length - 4]! : 3;

      for (const node of nodes) {
        if (token !== gameAnalysisToken) return;
        if (!get().isGameAnalysisRunning) return;
        if (get().gameAnalysisType !== 'full') return;

        // If interactive analysis is running/queued, pause bulk analysis.
        while (get().engineStatus === 'loading') {
          if (token !== gameAnalysisToken) return;
          if (!get().isGameAnalysisRunning) return;
          if (get().gameAnalysisType !== 'full') return;
          await sleep(50);
        }

        const moveIndex = node.gameState.moveHistory.length - 1;
        if (moveRange && !(moveIndex >= moveRange[0] && moveIndex <= moveRange[1])) {
          done++;
          continue;
        }

        if (mistakesOnly) {
          let maxLoss = Math.max(0, computePointsLostForNode(node) ?? 0);
          for (const child of node.children) {
            maxLoss = Math.max(maxLoss, Math.max(0, computePointsLostForNode(child) ?? 0));
          }
          if (maxLoss <= mistakesThreshold) {
            done++;
            continue;
          }
        }

        const already = node.analysis && (node.analysisVisitsRequested ?? 0) >= visits;
        if (!already) {
          try {
            const s = get();
            const parentBoard = node.parent?.gameState.board;
            const grandparentBoard = node.parent?.parent?.gameState.board;
            const maxTimeMs = ENGINE_MAX_TIME_MS;
            const batchSize = Math.max(1, Math.min(s.settings.katagoBatchSize, 64));
            const maxChildren = Math.max(4, Math.min(s.settings.katagoMaxChildren, 361));
            const topK = Math.max(5, Math.min(s.settings.katagoTopK, 50));
            const analysisPvLen = Math.max(0, Math.min(s.settings.katagoAnalysisPvLen, 60));
            const modelUrl = resolveModelUrlForFetch(s.settings.katagoModelUrl);

            const analysis = await getKataGoEngineClient().analyze({
              positionId: node.id,
              parentPositionId: node.parent?.id,
              modelUrl,
              board: node.gameState.board,
              previousBoard: parentBoard,
              previousPreviousBoard: grandparentBoard,
              currentPlayer: node.gameState.currentPlayer,
              moveHistory: node.gameState.moveHistory,
              komi: node.gameState.komi,
              rules: s.settings.gameRules,
              topK,
              analysisPvLen,
              includeMovesOwnership: s.settings.katagoOwnershipMode === 'tree',
              wideRootNoise: s.settings.katagoWideRootNoise,
              nnRandomize: s.settings.katagoNnRandomize,
              conservativePass: s.settings.katagoConservativePass,
              visits,
              maxTimeMs,
              batchSize,
              maxChildren,
              reuseTree: false,
              ownershipMode: s.settings.katagoOwnershipMode,
              analysisGroup: 'background',
            });

            if (!metaSynced) {
              const engineInfo = getKataGoEngineClient().getEngineInfo();
              set({ engineBackend: engineInfo.backend, engineModelName: engineInfo.modelName });
              metaSynced = true;
            }

            node.analysis = {
              rootWinRate: analysis.rootWinRate,
              rootScoreLead: analysis.rootScoreLead,
              rootScoreSelfplay: analysis.rootScoreSelfplay,
              rootScoreStdev: analysis.rootScoreStdev,
              rootVisits: analysis.rootVisits,
              moves: analysis.moves,
              territory: ownershipToTerritoryGrid(analysis.ownership),
              policy: analysis.policy,
              ownershipStdev: analysis.ownershipStdev,
              ownershipMode: s.settings.katagoOwnershipMode,
            };
            node.analysisVisitsRequested = Math.max(node.analysisVisitsRequested ?? 0, visits);
          } catch {
            // Ignore failures for bulk analysis; individual node analysis can still run later.
          }
        }

        done++;

        const now = performance.now();
        if (now - lastUiUpdate > 120 || done === total) {
          set((s) => ({
            gameAnalysisDone: done,
            gameAnalysisTotal: total,
            treeVersion: s.treeVersion + 1,
          }));
          lastUiUpdate = now;
        }

        await sleep(0);
      }

      if (token !== gameAnalysisToken) return;
      set((s) => ({
        isGameAnalysisRunning: false,
        gameAnalysisType: null,
        gameAnalysisDone: done,
        gameAnalysisTotal: total,
        treeVersion: s.treeVersion + 1,
      }));
    })();
  },

  stopGameAnalysis: () => {
    gameAnalysisToken++;
    set({ isGameAnalysisRunning: false, gameAnalysisType: null });
  },

  runAnalysis: async (opts) => {
      const state = get();
      if (!state.isAnalysisMode) return;

      // Check if current node already has analysis
      const desiredVisits = Math.max(16, Math.min(opts?.visits ?? state.settings.katagoVisits, ENGINE_MAX_VISITS));
      if (!opts?.force && state.currentNode.analysis) {
        const existing = state.currentNode.analysis;
        const existingOwnershipMode = existing.ownershipMode ?? 'root';
        const requiredOwnershipMode = state.settings.katagoOwnershipMode;
        const ownershipOk =
          requiredOwnershipMode === 'tree'
            ? existingOwnershipMode === 'tree'
            : requiredOwnershipMode === 'root'
              ? existingOwnershipMode === 'root' || existingOwnershipMode === 'tree'
              : true;
        const needsPolicy = state.settings.analysisShowPolicy;
        const policyOk = !needsPolicy || !!existing.policy;
        if ((state.currentNode.analysisVisitsRequested ?? 0) >= desiredVisits && ownershipOk && policyOk) {
          set({ analysisData: existing });
          return;
        }
      }

		      const node = state.currentNode;
		      const parentBoard = node.parent?.gameState.board;
		      const grandparentBoard = node.parent?.parent?.gameState.board;
		      const modelUrl = resolveModelUrlForFetch(state.settings.katagoModelUrl);
          const rules = state.settings.gameRules;
          const analysisPvLen = opts?.analysisPvLen ?? state.settings.katagoAnalysisPvLen;
          const wideRootNoise = opts?.wideRootNoise ?? state.settings.katagoWideRootNoise;
          const nnRandomize = opts?.nnRandomize ?? state.settings.katagoNnRandomize;
          const conservativePass = opts?.conservativePass ?? state.settings.katagoConservativePass;
          const visits = Math.max(16, Math.min(opts?.visits ?? state.settings.katagoVisits, ENGINE_MAX_VISITS));
          const maxTimeMs = Math.max(25, Math.min(opts?.maxTimeMs ?? state.settings.katagoMaxTimeMs, ENGINE_MAX_TIME_MS));
          const batchSize = Math.max(1, Math.min(opts?.batchSize ?? state.settings.katagoBatchSize, 64));
          const maxChildren = Math.max(4, Math.min(opts?.maxChildren ?? state.settings.katagoMaxChildren, 361));
          const topK = Math.max(1, Math.min(opts?.topK ?? state.settings.katagoTopK, 50));
          const reuseTree = opts?.reuseTree ?? state.settings.katagoReuseTree;
          const ownershipRefreshIntervalMs = opts?.ownershipRefreshIntervalMs;
          const reportEveryMsRaw = opts?.reportEveryMs;
          const reportEveryMs =
            typeof reportEveryMsRaw === 'number' && Number.isFinite(reportEveryMsRaw)
              ? Math.max(0, reportEveryMsRaw)
              : (state.isContinuousAnalysis ? CONTINUOUS_REPORT_DURING_SEARCH_MS : REPORT_DURING_SEARCH_EVERY_MS);
          const reportDuringSearchEveryMs = reportEveryMs > 0 ? reportEveryMs : undefined;
          const progressApplyMinMs = reportEveryMs > 0 ? Math.max(reportEveryMs, PROGRESS_APPLY_MIN_MS) : 0;
          let lastProgressVisits = -1;
          let lastProgressApplyAt = 0;
          let lastTreeUpdateAt = 0;
          let lastTerritoryUpdateAt = 0;
          const treeUpdateEveryMs = reportEveryMs > 0 ? reportEveryMs : 0;

          const buildAnalysisResult = (
            analysis: KataGoAnalysisPayload,
            opts: { includeTerritory: boolean; fallbackTerritory: number[][] }
          ): AnalysisResult => {
            let analysisWithTerritory: AnalysisResult = {
              rootWinRate: analysis.rootWinRate,
              rootScoreLead: analysis.rootScoreLead,
              rootScoreSelfplay: analysis.rootScoreSelfplay,
              rootScoreStdev: analysis.rootScoreStdev,
              rootVisits: analysis.rootVisits,
              moves: analysis.moves,
              territory: opts.includeTerritory ? ownershipToTerritoryGrid(analysis.ownership) : opts.fallbackTerritory,
              policy: analysis.policy,
              ownershipStdev: analysis.ownershipStdev,
              ownershipMode: state.settings.katagoOwnershipMode,
            };

            const roi = get().regionOfInterest;
            if (roi) {
              analysisWithTerritory = {
                ...analysisWithTerritory,
                moves: analysisWithTerritory.moves.filter((m) => isMoveInRegion(m, roi)),
                policy: analysisWithTerritory.policy
                  ? (() => {
                      const p = analysisWithTerritory.policy.slice();
                      for (let y = 0; y < BOARD_SIZE; y++) {
                        for (let x = 0; x < BOARD_SIZE; x++) {
                          if (x >= roi.xMin && x <= roi.xMax && y >= roi.yMin && y <= roi.yMax) continue;
                          p[y * BOARD_SIZE + x] = -1;
                        }
                      }
                      return p;
                    })()
                  : analysisWithTerritory.policy,
              };
            }

            return analysisWithTerritory;
          };

          const applyAnalysis = (analysis: KataGoAnalysisPayload, isFinal: boolean, now = performance.now()) => {
            const showOwnership = get().settings.analysisShowOwnership;
            const shouldUpdateTerritory =
              isFinal || (showOwnership && progressApplyMinMs > 0 && now - lastTerritoryUpdateAt >= progressApplyMinMs);
            if (shouldUpdateTerritory) lastTerritoryUpdateAt = now;
            const fallbackTerritory = node.analysis?.territory ?? EMPTY_TERRITORY;
            const analysisWithTerritory = buildAnalysisResult(analysis, {
              includeTerritory: shouldUpdateTerritory,
              fallbackTerritory,
            });
            node.analysis = analysisWithTerritory;

            const latest = get();
            const isCurrent = latest.currentNode.id === node.id;
            const updateNow = performance.now();
            const shouldBumpTree =
              isFinal || (isCurrent && treeUpdateEveryMs > 0 && updateNow - lastTreeUpdateAt >= treeUpdateEveryMs);
            if (shouldBumpTree) lastTreeUpdateAt = updateNow;

            if (!isCurrent && !isFinal && !shouldBumpTree) return;

            const engineInfo = isFinal ? getKataGoEngineClient().getEngineInfo() : null;
            set((s) => {
              const next: Partial<GameStore> = {};
              if (isCurrent) next.analysisData = analysisWithTerritory;
              if (isFinal && engineInfo) {
                next.engineStatus = 'ready';
                next.engineError = null;
                next.engineBackend = engineInfo.backend;
                next.engineModelName = engineInfo.modelName;
              }
              if (shouldBumpTree) next.treeVersion = s.treeVersion + 1;
              return next;
            });
          };

          const onProgress = reportDuringSearchEveryMs
            ? (analysis: KataGoAnalysisPayload) => {
                const visits = typeof analysis.rootVisits === 'number' ? analysis.rootVisits : 0;
                if (visits <= lastProgressVisits) return;
                const now = performance.now();
                if (progressApplyMinMs > 0 && now - lastProgressApplyAt < progressApplyMinMs) return;
                lastProgressVisits = visits;
                lastProgressApplyAt = now;
                applyAnalysis(analysis, false, now);
              }
            : undefined;

      set({ engineStatus: 'loading', engineError: null });
      node.analysisVisitsRequested = visits;

	      return getKataGoEngineClient()
	        .analyze({
	          positionId: node.id,
	          parentPositionId: node.parent?.id,
	          modelUrl,
	          board: state.board,
	          previousBoard: parentBoard,
	          previousPreviousBoard: grandparentBoard,
	          currentPlayer: state.currentPlayer,
	          moveHistory: state.moveHistory,
	          komi: state.komi,
            rules,
            regionOfInterest: state.regionOfInterest,
	          topK,
            includeMovesOwnership: state.settings.katagoOwnershipMode === 'tree',
            analysisPvLen,
            wideRootNoise,
            nnRandomize,
            conservativePass,
          visits,
          maxTimeMs,
          batchSize,
          maxChildren,
          reportDuringSearchEveryMs,
          ownershipRefreshIntervalMs,
          reuseTree,
          ownershipMode: state.settings.katagoOwnershipMode,
          analysisGroup: 'interactive',
          onProgress,
        })
        .then((analysis) => {
          applyAnalysis(analysis, true);

          const maybeApplyTeachUndo = () => {
            const latestState = get();
            if (!latestState.isTeachMode) return;

            const current = latestState.currentNode;
            const move = current.move;
            const parent = current.parent;
            if (!move || !parent) return;
            if (current.autoUndo !== null && current.autoUndo !== undefined) return;
            if (latestState.isAiPlaying && latestState.aiColor === move.player) return;

            const parentScore = parent.analysis?.rootScoreLead;
            const childScore = current.analysis?.rootScoreLead;
            if (typeof parentScore !== 'number' || typeof childScore !== 'number') return;

            const pointsLost = (move.player === 'black' ? 1 : -1) * (parentScore - childScore);
            const thresholds = latestState.settings.trainerEvalThresholds?.length
              ? latestState.settings.trainerEvalThresholds
              : ([12, 6, 3, 1.5, 0.5, 0] as const);

            let i = 0;
            while (i < thresholds.length - 1 && pointsLost < thresholds[i]!) i++;
            const undoPrompts = latestState.settings.teachNumUndoPrompts ?? [];
            const idx = Math.max(0, Math.min(i, undoPrompts.length - 1));
            const numUndos = undoPrompts[idx] ?? 0;

            let undo = false;
            if (numUndos === 0) {
              undo = false;
            } else if (numUndos < 1) {
              const r = typeof current.undoThreshold === 'number' ? current.undoThreshold : Math.random();
              current.undoThreshold = r;
              undo = r < numUndos && parent.children.length === 1;
            } else {
              undo = parent.children.length <= numUndos;
            }

            current.autoUndo = undo;
            set((s) => ({ treeVersion: s.treeVersion + 1 }));

            if (!undo) return;

            const moveLabel =
              move.x < 0 || move.y < 0
                ? 'Pass'
                : `${String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x))}${19 - move.y}`;

            set({
              notification: {
                message: `Teaching undo: ${moveLabel} (${pointsLost.toFixed(1)} points lost)`,
                type: 'info',
              },
            });
            setTimeout(() => set({ notification: null }), 3000);
            latestState.navigateBack();
          };

          maybeApplyTeachUndo();
        })
        .catch((err: unknown) => {
          if (isKataGoCanceledError(err)) return;
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
      saveStoredSettings(nextSettings);
      const engineKeys: Array<keyof GameSettings> = [
        'katagoModelUrl',
        'katagoVisits',
        'katagoMaxTimeMs',
        'katagoBatchSize',
        'katagoMaxChildren',
        'katagoTopK',
        'katagoOwnershipMode',
        'katagoWideRootNoise',
        'katagoAnalysisPvLen',
        'katagoNnRandomize',
        'katagoConservativePass',
        'gameRules',
      ];

      const engineChanged = engineKeys.some((k) => newSettings[k] !== undefined && newSettings[k] !== state.settings[k]);
      if (!engineChanged) return { settings: nextSettings };

      const clearAnalysis = (node: GameNode) => {
        node.analysis = null;
        node.analysisVisitsRequested = 0;
        for (const child of node.children) clearAnalysis(child);
      };
      clearAnalysis(state.rootNode);

      const rulesChanged = newSettings.gameRules !== undefined && newSettings.gameRules !== state.settings.gameRules;
      if (rulesChanged) {
        state.rootNode.properties = state.rootNode.properties ?? {};
        state.rootNode.properties['RU'] = [rulesToSgfRu(nextSettings.gameRules)];
      }

      return {
        settings: nextSettings,
        analysisData: null,
        engineStatus: 'idle',
        engineError: null,
        engineBackend: null,
        engineModelName: null,
        treeVersion: rulesChanged ? state.treeVersion + 1 : state.treeVersion,
      };
    }),

  setRootProperty: (key, value) =>
    set((state) => {
      state.rootNode.properties = state.rootNode.properties ?? {};
      const trimmed = value.trim();
      if (!trimmed) {
        delete state.rootNode.properties[key];
      } else {
        state.rootNode.properties[key] = [trimmed];
      }
      return { rootNode: state.rootNode, treeVersion: state.treeVersion + 1 };
    }),

  setCurrentNodeNote: (note) =>
    set((state) => {
      state.currentNode.note = note;
      return { treeVersion: state.treeVersion + 1 };
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

	    const tentativeBoard = state.board.map((row) => [...row]);
	    tentativeBoard[y][x] = state.currentPlayer;

	    const captured = applyCapturesInPlace(tentativeBoard, x, y, state.currentPlayer);
	    const newBoard = tentativeBoard;

	    // Suicide check
	    if (captured.length === 0) {
	      const { liberties } = getLiberties(newBoard, x, y);
      if (liberties === 0) return;
    }

    // Ko check
    // Simple Ko: Check just the state from 2 moves ago?
    // Let's traverse up one step (parent).
    if (state.currentNode.parent && boardsEqual(newBoard, state.currentNode.parent.gameState.board)) {
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
      analysisData: null, // Clear old analysis
      treeVersion: state.treeVersion + 1,
    });

    if (!isLoad) {
      const newState = get();
      if (newState.isAiPlaying && newState.currentPlayer === newState.aiColor) {
        setTimeout(() => get().makeAiMove(), 500);
      }
	      if (newState.isAnalysisMode && !newState.isSelfplayToEnd) {
	          setTimeout(() => void get().runAnalysis(), 500);
	      }
	    }
	  },

	  makeAiMove: () => {
	      const state = get();
	      if (!state.isAiPlaying || !state.aiColor) return;
	      if (state.currentPlayer !== state.aiColor) return;

	      const node = state.currentNode;
	      const nodeId = node.id;
	      const playerAtStart = state.currentPlayer;

	      const parentBoard = node.parent?.gameState.board;
	      const grandparentBoard = node.parent?.parent?.gameState.board;
	      const modelUrl = resolveModelUrlForFetch(state.settings.katagoModelUrl);
        const rules = state.settings.gameRules;
        const analysisPvLen = state.settings.katagoAnalysisPvLen;
        const wideRootNoise = state.settings.katagoWideRootNoise;
        const nnRandomize = state.settings.katagoNnRandomize;
        const conservativePass = state.settings.katagoConservativePass;
        const aiNeedsMovesOwnership = state.settings.aiStrategy === 'simple' || state.settings.aiStrategy === 'settle';
        const aiOwnershipMode = aiNeedsMovesOwnership ? 'tree' : state.settings.katagoOwnershipMode;

      void getKataGoEngineClient()
	        .analyze({
	          positionId: nodeId,
	          parentPositionId: node.parent?.id,
	          modelUrl,
	          board: state.board,
	          previousBoard: parentBoard,
	          previousPreviousBoard: grandparentBoard,
	          currentPlayer: state.currentPlayer,
	          moveHistory: state.moveHistory,
	          komi: state.komi,
            rules,
	          topK:
	            state.settings.aiStrategy === 'default'
	              ? state.settings.katagoTopK
	              : Math.max(state.settings.katagoTopK, 30),
            includeMovesOwnership: aiNeedsMovesOwnership,
            analysisPvLen,
            wideRootNoise,
            nnRandomize,
            conservativePass,
          visits: Math.max(16, Math.min(state.settings.katagoVisits, ENGINE_MAX_VISITS)),
          maxTimeMs: Math.max(25, Math.min(state.settings.katagoMaxTimeMs, ENGINE_MAX_TIME_MS)),
          batchSize: state.settings.katagoBatchSize,
          maxChildren: state.settings.katagoMaxChildren,
          reuseTree: state.settings.katagoReuseTree,
          ownershipMode: aiOwnershipMode,
          analysisGroup: 'background',
        })
        .then((analysis) => {
          const engineInfo = getKataGoEngineClient().getEngineInfo();
          set({ engineBackend: engineInfo.backend, engineModelName: engineInfo.modelName });

          const latest = get();
          if (latest.currentNode.id !== nodeId) return;
          if (latest.currentPlayer !== playerAtStart) return;
          if (!latest.isAiPlaying || latest.aiColor !== playerAtStart) return;
          const settings = latest.settings;

          const analysisWithTerritory: AnalysisResult = {
            rootWinRate: analysis.rootWinRate,
            rootScoreLead: analysis.rootScoreLead,
            rootScoreSelfplay: analysis.rootScoreSelfplay,
            rootScoreStdev: analysis.rootScoreStdev,
            rootVisits: analysis.rootVisits,
            moves: analysis.moves,
            territory: ownershipToTerritoryGrid(analysis.ownership),
            policy: analysis.policy,
            ownershipStdev: analysis.ownershipStdev,
            ownershipMode: aiOwnershipMode,
          };

          // Cache analysis on the node we analyzed.
          node.analysis = analysisWithTerritory;

          type PolicyMove = { prob: number; x: number; y: number; isPass: boolean };
          const policyRanking = (policy: FloatArray): PolicyMove[] => {
            const out: PolicyMove[] = [];
            for (let y = 0; y < BOARD_SIZE; y++) {
              for (let x = 0; x < BOARD_SIZE; x++) {
                const p = policy[y * BOARD_SIZE + x] ?? -1;
                if (p > 0) out.push({ prob: p, x, y, isPass: false });
              }
            }
            const pass = policy[BOARD_SIZE * BOARD_SIZE] ?? -1;
            if (pass > 0) out.push({ prob: pass, x: -1, y: -1, isPass: true });
            out.sort((a, b) => b.prob - a.prob);
            return out;
          };

          const pickOneWeighted = <T,>(items: Array<{ weight: number; value: T }>): T | null => {
            let total = 0;
            for (const it of items) {
              if (it.weight > 0 && Number.isFinite(it.weight)) total += it.weight;
            }
            if (!(total > 0)) return null;
            let r = Math.random() * total;
            for (const it of items) {
              const w = it.weight;
              if (!(w > 0) || !Number.isFinite(w)) continue;
              if (r < w) return it.value;
              r -= w;
            }
            return items.length > 0 ? items[items.length - 1]!.value : null;
          };

          const weightedSampleWithoutReplacement = <T,>(
            items: T[],
            n: number,
            weightFn: (item: T) => number
          ): T[] => {
            const scored = items.map((item) => {
              const w = Math.max(1e-18, weightFn(item));
              const u = Math.random();
              const key = Math.log(Math.max(1e-18, u)) / w;
              return { key, item };
            });
            scored.sort((a, b) => b.key - a.key);
            return scored.slice(0, Math.min(Math.max(0, n), scored.length)).map((s) => s.item);
          };

          const chooseByStrategy = (): { x: number; y: number; thoughts: string } | null => {
            const strategy = settings.aiStrategy;
            const candidates = analysisWithTerritory.moves ?? [];

            const best =
              candidates.find((m) => m.order === 0) ?? candidates[0] ?? null;
            const bestLabel =
              !best
                ? 'pass'
                : best.x < 0 || best.y < 0
                  ? 'pass'
                  : `${String.fromCharCode(65 + (best.x >= 8 ? best.x + 1 : best.x))}${19 - best.y}`;

            if (strategy === 'default') {
              if (!best) return null;
              return {
                x: best.x,
                y: best.y,
                thoughts: `Default strategy chose top move ${bestLabel}.`,
              };
            }

            if (strategy === 'scoreloss') {
              if (candidates.length === 0) return null;
              const c = Math.max(0, settings.aiScoreLossStrength);
              const weighted = candidates.map((m) => ({
                weight: Math.exp(Math.min(200, -c * Math.max(0, m.pointsLost))),
                value: m,
              }));
              const picked = pickOneWeighted(weighted);
              if (!picked) return null;
              const label =
                picked.x < 0 || picked.y < 0
                  ? 'pass'
                  : `${String.fromCharCode(65 + (picked.x >= 8 ? picked.x + 1 : picked.x))}${19 - picked.y}`;
              return {
                x: picked.x,
                y: picked.y,
                thoughts: `ScoreLoss picked ${label} (pointsLost ${picked.pointsLost.toFixed(1)}, strength ${c}).`,
              };
            }

            if (strategy === 'jigo') {
              if (candidates.length === 0) return null;
              const target = settings.aiJigoTargetScore;
              const sign = playerAtStart === 'black' ? 1 : -1;

              let bestCand = candidates[0]!;
              let bestDiff = Math.abs(sign * bestCand.scoreLead - target);
              for (const m of candidates) {
                const diff = Math.abs(sign * m.scoreLead - target);
                if (diff < bestDiff) {
                  bestDiff = diff;
                  bestCand = m;
                }
              }
              const label =
                bestCand.x < 0 || bestCand.y < 0
                  ? 'pass'
                  : `${String.fromCharCode(65 + (bestCand.x >= 8 ? bestCand.x + 1 : bestCand.x))}${19 - bestCand.y}`;
              return {
                x: bestCand.x,
                y: bestCand.y,
                thoughts: `Jigo picked ${label} (target ${target}, diff ${bestDiff.toFixed(1)}).`,
              };
            }

            if (strategy === 'simple' || strategy === 'settle') {
              const modeName = strategy === 'simple' ? 'ai:simple' : 'ai:settle';

              if (candidates.length === 0) return null;
              const topCand = candidates[0]!;
              if (topCand.x < 0 || topCand.y < 0) {
                return { x: topCand.x, y: topCand.y, thoughts: `${modeName}: top move is pass.` };
              }

              const nextPlayer = playerAtStart;
              const lastMovePlayer = latest.currentNode.move?.player ?? null;

              const xyToGtp = (x: number, y: number): string => {
                if (x < 0 || y < 0) return 'pass';
                const col = x >= 8 ? x + 1 : x;
                const letter = String.fromCharCode(65 + col);
                return `${letter}${BOARD_SIZE - y}`;
              };

              const inBounds = (x: number, y: number) => x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;

              const isAttachment = (x: number, y: number): boolean => {
                if (x < 0 || y < 0) return false;
                // KaTrain: self.cn.player is last mover; if none, no attachment penalty.
                if (!lastMovePlayer) return false;

                const opp = lastMovePlayer;
                let attachOpp = 0;
                const dirs: Array<[number, number]> = [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ];
                for (const [dx, dy] of dirs) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (!inBounds(nx, ny)) continue;
                  if (latest.board[ny]?.[nx] === opp) attachOpp++;
                }

                let nearbyOwn = 0;
                // NOTE: Mirrors KaTrain upstream exactly (including its odd ranges).
                const dxs = [-2, 0, 1, 2];
                const dys = [-3, 0, 1, 2];
                for (const dx of dxs) {
                  for (const dy of dys) {
                    if (Math.abs(dx) + Math.abs(dy) > 2) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (!inBounds(nx, ny)) continue;
                    if (latest.board[ny]?.[nx] === nextPlayer) nearbyOwn++;
                  }
                }

                return attachOpp >= 1 && nearbyOwn === 0;
              };

              const isTenuki = (x: number, y: number): boolean => {
                if (x < 0 || y < 0) return false;
                const a = latest.currentNode;
                const b = latest.currentNode.parent;
                if (!a || !a.move || a.move.x < 0 || a.move.y < 0) return false;
                if (!b || !b.move || b.move.x < 0 || b.move.y < 0) return false;

              const cheb = (m: Move) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y));
              return cheb(a.move) >= 5 && cheb(b.move) >= 5;
            };

              const settledness = (ownership: FloatArray, player: Player): number => {
                if (strategy === 'simple') {
                  const sign = player === 'black' ? 1 : -1;
                  let sum = 0;
                  for (const o of ownership) {
                    if (sign * o > 0) sum += Math.abs(o);
                  }
                  return sum;
                }

                // settle: sum |ownership| for existing stones of the player
                let sum = 0;
                for (let yy = 0; yy < BOARD_SIZE; yy++) {
                  for (let xx = 0; xx < BOARD_SIZE; xx++) {
                    if (latest.board[yy]?.[xx] !== player) continue;
                    const v = ownership[yy * BOARD_SIZE + xx] ?? 0;
                    sum += Math.abs(v);
                  }
                }
                return sum;
              };

              const maxPointsLost = settings.aiOwnershipMaxPointsLost;
              const settledWeight = settings.aiOwnershipSettledWeight;
              const opponentFac = settings.aiOwnershipOpponentFac;
              const minVisits = settings.aiOwnershipMinVisits;
              const attachPenalty = settings.aiOwnershipAttachPenalty;
              const tenukiPenalty = settings.aiOwnershipTenukiPenalty;

              type Scored = {
                move: CandidateMove;
                ownSettled: number;
                oppSettled: number;
                attach: boolean;
                tenuki: boolean;
                score: number;
              };
              const scored: Scored[] = [];

              for (const m of candidates) {
                if (m.pointsLost >= maxPointsLost) continue;
                if (!m.ownership || m.ownership.length < BOARD_SIZE * BOARD_SIZE) continue;
                if (!(m.order <= 1 || m.visits >= minVisits)) continue;
                const isPass = m.x < 0 || m.y < 0;
                if (isPass && m.pointsLost > 0.75) continue;

                const ownSettled = settledness(m.ownership, nextPlayer);
                const oppSettled =
                  strategy === 'settle'
                    ? lastMovePlayer
                      ? settledness(m.ownership, lastMovePlayer)
                      : 0
                    : settledness(m.ownership, nextPlayer === 'black' ? 'white' : 'black');
                const attach = isAttachment(m.x, m.y);
                const tenuki = isTenuki(m.x, m.y);
                const score =
                  m.pointsLost +
                  attachPenalty * (attach ? 1 : 0) +
                  tenukiPenalty * (tenuki ? 1 : 0) -
                  settledWeight * (ownSettled + opponentFac * oppSettled);

                scored.push({ move: m, ownSettled, oppSettled, attach, tenuki, score });
              }

              scored.sort((a, b) => a.score - b.score);
              const best = scored[0]?.move ?? candidates[0]!;
              if (scored.length === 0) {
                return { x: best.x, y: best.y, thoughts: `${modeName}: no moves with ownership; playing top move.` };
              }

              const top5 = scored.slice(0, 5).map((s) => {
                const mv = s.move;
                const label = xyToGtp(mv.x, mv.y);
                return `${label} (${mv.pointsLost.toFixed(1)} pt lost, ${mv.visits} visits, ${s.ownSettled.toFixed(1)} settledness, ${s.oppSettled.toFixed(1)} opponent settledness${s.attach ? ', attachment' : ''}${s.tenuki ? ', tenuki' : ''})`;
              });

              return {
                x: scored[0]!.move.x,
                y: scored[0]!.move.y,
                thoughts: `${modeName} strategy. Top 5 Candidates ${top5.join(', ')} `,
              };
            }

            const policy = analysisWithTerritory.policy;
            const policyMoves = policy ? policyRanking(policy) : [];
            if (policyMoves.length === 0) {
              if (!best) return null;
              return {
                x: best.x,
                y: best.y,
                thoughts: `No policy available; fell back to top move ${bestLabel}.`,
              };
            }

            const top5Pass = policyMoves.slice(0, 5).some((m) => m.isPass);

            const shouldPlayTopMove = (override: number, overridetwo = 1.0): { move: PolicyMove; thoughts: string } | null => {
              const top = policyMoves[0]!;
              if (top5Pass) return { move: top, thoughts: 'Playing top policy move because pass is in top 5.' };
              if (top.prob > override) return { move: top, thoughts: `Top policy move prob > ${override}.` };
              const second = policyMoves[1];
              if (second && top.prob + second.prob > overridetwo) {
                return { move: top, thoughts: `Top 2 policy moves prob sum > ${overridetwo}.` };
              }
              return null;
            };

            const passProb = policy?.[BOARD_SIZE * BOARD_SIZE] ?? -1;
            const legalPolicyMoves = policyMoves.filter((m) => !m.isPass && m.prob > 0);

            type WeightedCoord = { score: number; weight: number; x: number; y: number };

            const pickFromWeightedCoords = (
              weightedCoords: WeightedCoord[],
              nMoves: number,
              strategyName: string
            ): { x: number; y: number; thoughts: string } => {
              const picked = weightedSampleWithoutReplacement(weightedCoords, nMoves, (c) => c.weight);

              if (picked.length === 0) {
                const top = policyMoves[0]!;
                return { x: top.x, y: top.y, thoughts: `${strategyName}: no moves selected; playing top policy move.` };
              }

              picked.sort((a, b) => (b.score - a.score) || (b.weight - a.weight));
              const topPicked = picked[0]!;

              if (passProb > 0 && topPicked.score < passProb) {
                const top = policyMoves[0]!;
                return {
                  x: top.x,
                  y: top.y,
                  thoughts: `${strategyName}: pass prob ${(passProb * 100).toFixed(2)}% > picked ${(topPicked.score * 100).toFixed(2)}%; playing top policy move.`,
                };
              }

              return {
                x: topPicked.x,
                y: topPicked.y,
                thoughts: `${strategyName}: picked from ${Math.min(nMoves, weightedCoords.length)} sampled moves.`,
              };
            };

            const getPickNMoves = (pickFrac: number, pickN: number, legalCount: number): number =>
              Math.max(1, Math.floor(Math.max(0, pickFrac) * legalCount + Math.max(0, pickN)));

            const fallbackWeightedPolicy = (reason: string): { x: number; y: number; thoughts: string } => {
              const weakenFac = 1.0;
              const lowerBound = 0.02;
              const override = 0.9;

              const forced = shouldPlayTopMove(override);
              if (forced) return { x: forced.move.x, y: forced.move.y, thoughts: `${reason}: ${forced.thoughts}` };

              const weighted = policyMoves
                .filter((m) => !m.isPass && m.prob > lowerBound)
                .map((m) => ({ weight: Math.pow(m.prob, 1 / weakenFac), value: m }));
              const picked = pickOneWeighted(weighted) ?? policyMoves[0]!;
              return {
                x: picked.x,
                y: picked.y,
                thoughts: `${reason}: fallback weighted policy (lower_bound ${lowerBound}, weaken_fac ${weakenFac}).`,
              };
            };

            if (strategy === 'pick') {
              const override = Math.max(0, settings.aiPickPickOverride);
              const forced = shouldPlayTopMove(override);
              if (forced) return { x: forced.move.x, y: forced.move.y, thoughts: forced.thoughts };

              const nMoves = getPickNMoves(settings.aiPickPickFrac, settings.aiPickPickN, legalPolicyMoves.length);
              const weightedCoords: WeightedCoord[] = legalPolicyMoves.map((m) => ({
                score: m.prob,
                weight: 1,
                x: m.x,
                y: m.y,
              }));
              return pickFromWeightedCoords(weightedCoords, nMoves, 'Pick');
            }

            if (strategy === 'local' || strategy === 'tenuki') {
              const lastMove = latest.currentNode.move;
              if (!lastMove || lastMove.x < 0 || lastMove.y < 0) {
                return fallbackWeightedPolicy(strategy === 'local' ? 'Local: no previous move' : 'Tenuki: no previous move');
              }

              const override = Math.max(0, strategy === 'local' ? settings.aiLocalPickOverride : settings.aiTenukiPickOverride);
              const forced = shouldPlayTopMove(override);
              if (forced) return { x: forced.move.x, y: forced.move.y, thoughts: forced.thoughts };

              const boardSquares = BOARD_SIZE * BOARD_SIZE;
              const depth = latest.moveHistory.length;
              const endgame = Math.max(0, strategy === 'local' ? settings.aiLocalEndgame : settings.aiTenukiEndgame);
              const pickFrac = strategy === 'local' ? settings.aiLocalPickFrac : settings.aiTenukiPickFrac;
              const pickN = strategy === 'local' ? settings.aiLocalPickN : settings.aiTenukiPickN;

              if (depth > endgame * boardSquares) {
                const baseN = getPickNMoves(pickFrac, pickN, legalPolicyMoves.length);
                const nMoves = Math.floor(Math.max(baseN, Math.floor(legalPolicyMoves.length / 2)));
                const endCoords: WeightedCoord[] = legalPolicyMoves.map((m) => ({
                  score: m.prob,
                  weight: 1,
                  x: m.x,
                  y: m.y,
                }));
                return pickFromWeightedCoords(endCoords, nMoves, strategy === 'local' ? 'Local endgame' : 'Tenuki endgame');
              }

              const stddev = Math.max(0, strategy === 'local' ? settings.aiLocalStddev : settings.aiTenukiStddev);
              const var_ = stddev * stddev;
              if (!(var_ > 0)) {
                return fallbackWeightedPolicy(strategy === 'local' ? 'Local: stddev <= 0' : 'Tenuki: stddev <= 0');
              }

              const weightedCoords: WeightedCoord[] = legalPolicyMoves.map((m) => {
                const dx = m.x - lastMove.x;
                const dy = m.y - lastMove.y;
                const gaussian = Math.exp(-0.5 * (dx * dx + dy * dy) / var_);
                const w = strategy === 'tenuki' ? 1 - gaussian : gaussian;
                return {
                  score: m.prob,
                  weight: Number.isFinite(w) ? Math.max(0, w) : 0,
                  x: m.x,
                  y: m.y,
                };
              });

              const nMoves = getPickNMoves(pickFrac, pickN, legalPolicyMoves.length);
              return pickFromWeightedCoords(weightedCoords, nMoves, strategy === 'local' ? 'Local' : 'Tenuki');
            }

            if (strategy === 'influence' || strategy === 'territory') {
              const override = Math.max(0, strategy === 'influence' ? settings.aiInfluencePickOverride : settings.aiTerritoryPickOverride);
              const forced = shouldPlayTopMove(override);
              if (forced) return { x: forced.move.x, y: forced.move.y, thoughts: forced.thoughts };

              const boardSquares = BOARD_SIZE * BOARD_SIZE;
              const depth = latest.moveHistory.length;
              const endgame = Math.max(0, strategy === 'influence' ? settings.aiInfluenceEndgame : settings.aiTerritoryEndgame);
              const pickFrac = strategy === 'influence' ? settings.aiInfluencePickFrac : settings.aiTerritoryPickFrac;
              const pickN = strategy === 'influence' ? settings.aiInfluencePickN : settings.aiTerritoryPickN;

              if (depth > endgame * boardSquares) {
                const baseN = getPickNMoves(pickFrac, pickN, legalPolicyMoves.length);
                const nMoves = Math.floor(Math.max(baseN, Math.floor(legalPolicyMoves.length / 2)));
                const endCoords: WeightedCoord[] = legalPolicyMoves.map((m) => ({
                  score: m.prob,
                  weight: 1,
                  x: m.x,
                  y: m.y,
                }));
                return pickFromWeightedCoords(endCoords, nMoves, strategy === 'influence' ? 'Influence endgame' : 'Territory endgame');
              }

              const threshold = Math.max(0, strategy === 'influence' ? settings.aiInfluenceThreshold : settings.aiTerritoryThreshold);
              const lineWeightRaw = strategy === 'influence' ? settings.aiInfluenceLineWeight : settings.aiTerritoryLineWeight;
              const lineWeight = Math.max(1, lineWeightRaw);
              const thrLine = threshold - 1;

              const weightedCoords: WeightedCoord[] = legalPolicyMoves.map((m) => {
                const distX = Math.min(BOARD_SIZE - 1 - m.x, m.x);
                const distY = Math.min(BOARD_SIZE - 1 - m.y, m.y);

                let exponent = 0;
                if (strategy === 'influence') {
                  exponent = Math.max(0, thrLine - distX) + Math.max(0, thrLine - distY);
                } else {
                  const distMin = Math.min(distX, distY);
                  exponent = Math.max(0, distMin - thrLine);
                }

                const w = Math.pow(1 / lineWeight, exponent);
                return {
                  score: m.prob * w,
                  weight: Number.isFinite(w) ? Math.max(0, w) : 0,
                  x: m.x,
                  y: m.y,
                };
              });

              const nMoves = getPickNMoves(pickFrac, pickN, legalPolicyMoves.length);
              return pickFromWeightedCoords(weightedCoords, nMoves, strategy === 'influence' ? 'Influence' : 'Territory');
            }

            if (strategy === 'rank') {
              const kyuRank = settings.aiRankKyu;
              const boardSquares = BOARD_SIZE * BOARD_SIZE;
              const legalPolicyMoves = policyMoves.filter((m) => !m.isPass && m.prob > 0);
              const normLegMoves = legalPolicyMoves.length / boardSquares;

              const origCalibAveModRank =
                0.063015 + (0.7624 * boardSquares) / Math.pow(10, -0.05737 * kyuRank + 1.9482);

              const exponentTerm =
                3.002 * normLegMoves * normLegMoves - normLegMoves - 0.034889 * kyuRank - 0.5097;

              const modifiedCalibAveModRank =
                (0.3931 +
                  0.6559 * normLegMoves * Math.exp(-1 * exponentTerm * exponentTerm) -
                  0.01093 * kyuRank) *
                origCalibAveModRank;

              const denominator = 1.31165 * (modifiedCalibAveModRank + 1) - 0.082653;
              const nMoves = Math.max(1, Math.round((boardSquares * normLegMoves) / denominator));

              const ratio = (boardSquares - legalPolicyMoves.length) / boardSquares;
              const override = 0.8 * (1 - 0.5 * ratio);
              const overridetwo = 0.85 + Math.max(0, 0.02 * (kyuRank - 8));

              const forced = shouldPlayTopMove(override, overridetwo);
              if (forced) return { x: forced.move.x, y: forced.move.y, thoughts: forced.thoughts };

              const sampled = weightedSampleWithoutReplacement(legalPolicyMoves, nMoves, () => 1);
              sampled.sort((a, b) => b.prob - a.prob);
              const picked = sampled[0] ?? null;

              if (!picked) {
                const top = policyMoves[0]!;
                return { x: top.x, y: top.y, thoughts: 'Rank: no legal policy moves; playing top policy move.' };
              }

              if (passProb > picked.prob) {
                const top = policyMoves[0]!;
                return {
                  x: top.x,
                  y: top.y,
                  thoughts: `Rank: pass prob ${(passProb * 100).toFixed(1)}% > picked ${(picked.prob * 100).toFixed(1)}%; playing top policy move.`,
                };
              }

              return {
                x: picked.x,
                y: picked.y,
                thoughts: `Rank picked from ${Math.min(nMoves, legalPolicyMoves.length)} sampled moves (kyu ${kyuRank}).`,
              };
            }

            if (strategy === 'policy') {
              const openingMoves = Math.max(0, settings.aiPolicyOpeningMoves);
              const depth = latest.moveHistory.length;
              if (depth <= openingMoves) {
                const weakenFac = 1.0;
                const lowerBound = 0.02;
                const override = 0.9;
                const forced = shouldPlayTopMove(override);
                if (forced) {
                  return { x: forced.move.x, y: forced.move.y, thoughts: forced.thoughts };
                }
                const weighted = policyMoves
                  .filter((m) => !m.isPass && m.prob > lowerBound)
                  .map((m) => ({ weight: Math.pow(m.prob, 1 / weakenFac), value: m }));
                const picked = pickOneWeighted(weighted) ?? policyMoves[0]!;
                return {
                  x: picked.x,
                  y: picked.y,
                  thoughts: `Policy opening: picked weighted policy move (depth ${depth} ≤ ${openingMoves}).`,
                };
              }
              const top = policyMoves[0]!;
              return {
                x: top.x,
                y: top.y,
                thoughts: top5Pass ? 'Playing top policy move because pass is in top 5.' : 'Playing top policy move.',
              };
            }

            if (strategy === 'weighted') {
              const weakenFac = Math.max(0.01, settings.aiWeightedWeakenFac);
              const lowerBound = Math.max(0, settings.aiWeightedLowerBound);
              const override = Math.max(0, settings.aiWeightedPickOverride);

              const forced = shouldPlayTopMove(override);
              if (forced) return { x: forced.move.x, y: forced.move.y, thoughts: forced.thoughts };

              const weighted = policyMoves
                .filter((m) => !m.isPass && m.prob > lowerBound)
                .map((m) => ({ weight: Math.pow(m.prob, 1 / weakenFac), value: m }));
              const picked = pickOneWeighted(weighted);
              const move = picked ?? policyMoves[0]!;
              return {
                x: move.x,
                y: move.y,
                thoughts:
                  picked
                    ? `Weighted picked random policy move (lower_bound ${lowerBound}, weaken_fac ${weakenFac}).`
                    : 'Weighted fallback to top policy move.',
              };
            }

            if (!best) return null;
            return { x: best.x, y: best.y, thoughts: `Fallback to top move ${bestLabel}.` };
          };

          const chosen = chooseByStrategy();
          if (!chosen) {
            makeHeuristicMove(get());
            return;
          }
          if (chosen.x === -1 || chosen.y === -1) get().passTurn();
          else get().playMove(chosen.x, chosen.y);

          const after = get();
          after.currentNode.aiThoughts = chosen.thoughts;
          set((s) => ({ treeVersion: s.treeVersion + 1 }));
        })
        .catch((err) => {
          if (isKataGoCanceledError(err)) {
            const latest = get();
            if (latest.currentNode.id !== nodeId) return;
            if (latest.currentPlayer !== playerAtStart) return;
            if (!latest.isAiPlaying || latest.aiColor !== playerAtStart) return;
            setTimeout(() => latest.makeAiMove(), 100);
            return;
          }
          makeHeuristicMove(get());
        });
  },

  undoMove: () => get().navigateBack(),

  navigateBack: () => set((state) => {
    if (state.isInsertMode && state.currentNode.parent && state.insertAfterNodeId) {
      const insertAfter = findNodeById(state.rootNode, state.insertAfterNodeId);
      if (insertAfter) {
        const above = new Set<string>();
        let n: GameNode | null = insertAfter;
        while (n) {
          above.add(n.id);
          n = n.parent;
        }
	        if (!above.has(state.currentNode.id)) {
	          const node = state.currentNode;
	          const parent = node.parent!;
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
        }
      }
    }
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

  startNewGame: ({ komi, rules }) => {
    const state = get();
    get().stopSelfplayToEnd();
    get().stopGameAnalysis();
    if (state.settings.soundEnabled) {
      playNewGameSound();
    }
    const nextSettings: GameSettings = { ...state.settings, gameRules: rules };
    saveStoredSettings(nextSettings);

    const rootState: GameState = {
      board: createEmptyBoard(),
      currentPlayer: 'black',
      moveHistory: [],
      capturedBlack: 0,
      capturedWhite: 0,
      komi,
    };
    const newRoot = createNode(null, null, rootState, 'root');
    newRoot.properties = { RU: [rulesToSgfRu(rules)] };

    set({
      settings: nextSettings,
      board: rootState.board,
      currentPlayer: rootState.currentPlayer,
      moveHistory: rootState.moveHistory,
      capturedBlack: rootState.capturedBlack,
      capturedWhite: rootState.capturedWhite,
      komi: rootState.komi,
      boardRotation: 0,
      regionOfInterest: null,
      isSelectingRegionOfInterest: false,
      isInsertMode: false,
      insertAfterNodeId: null,
      insertAnchorNodeId: null,
      isSelfplayToEnd: false,
      isAiPlaying: false,
      aiColor: null,
      analysisData: null,
      timerPaused: true,
      timerMainTimeUsedSeconds: 0,
      timerPeriodsUsed: { black: 0, white: 0 },

      rootNode: newRoot,
      currentNode: newRoot,
      treeVersion: state.treeVersion + 1,
    });
  },

  resetGame: () => {
    const state = get();
    get().stopSelfplayToEnd();
    get().stopGameAnalysis();
    if (state.settings.soundEnabled) {
        playNewGameSound();
    }
    const rootState: GameState = {
      board: createEmptyBoard(),
      currentPlayer: 'black',
      moveHistory: [],
      capturedBlack: 0,
      capturedWhite: 0,
      komi: 6.5,
    };
    const newRoot = createNode(null, null, rootState, 'root');
    newRoot.properties = { RU: [rulesToSgfRu(state.settings.gameRules)] };
    set({
      board: rootState.board,
      currentPlayer: rootState.currentPlayer,
      moveHistory: rootState.moveHistory,
      capturedBlack: rootState.capturedBlack,
      capturedWhite: rootState.capturedWhite,
      komi: rootState.komi,
      boardRotation: 0,
      regionOfInterest: null,
      isSelectingRegionOfInterest: false,
      isInsertMode: false,
      insertAfterNodeId: null,
      insertAnchorNodeId: null,
      isSelfplayToEnd: false,
      isAiPlaying: false,
      aiColor: null,
      analysisData: null,
      timerPaused: true,
      timerMainTimeUsedSeconds: 0,
      timerPeriodsUsed: { black: 0, white: 0 },

      // Reset Tree
      rootNode: newRoot,
      currentNode: newRoot,
      treeVersion: state.treeVersion + 1,
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
    const rules = parseSgfRu(sgfProps?.['RU']?.[0]) ?? get().settings.gameRules;

    const rootState: GameState = {
      board: currentBoard,
      currentPlayer: rootPlayer,
      moveHistory: [],
      capturedBlack: 0,
      capturedWhite: 0,
      komi: sgf.komi || 6.5,
    };

    const newRoot = createNode(null, null, rootState, 'root');
    newRoot.properties = { RU: [rulesToSgfRu(rules)] };

    const applyKtAnalysis = (node: GameNode, kt: string[]) => {
      const decoded = decodeKaTrainKt({ kt });
      if (!decoded) return;
      const analysis = kaTrainAnalysisToAnalysisResult({ analysis: decoded, currentPlayer: node.gameState.currentPlayer });
      if (!analysis) return;
      node.analysis = analysis;
      const rootInfo = decoded.root as { visits?: unknown } | null;
      const visitsRaw = rootInfo?.visits;
      const visits = typeof visitsRaw === 'number' && Number.isFinite(visitsRaw) ? Math.max(0, Math.floor(visitsRaw)) : 0;
      if (visits > 0) node.analysisVisitsRequested = Math.max(node.analysisVisitsRequested ?? 0, Math.min(visits, ENGINE_MAX_VISITS));
    };

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
	      const captured = applyCapturesInPlace(tentativeBoard, move.x, move.y, move.player);
	      const newBoard = tentativeBoard;

      if (captured.length === 0) {
        const { liberties } = getLiberties(newBoard, move.x, move.y);
        if (liberties === 0) return null;
      }

      if (parent.parent && boardsEqual(newBoard, parent.parent.gameState.board)) {
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
      const rootNote = extractKaTrainUserNoteFromSgfComment(rootPropsCopy['C']);
      if (rootNote) newRoot.note = rootNote;
      delete rootPropsCopy['C'];
      if (!rootPropsCopy['RU']?.length) rootPropsCopy['RU'] = [rulesToSgfRu(rules)];
      newRoot.properties = rootPropsCopy;
      const rootMove = extractMove(sgf.tree.props);
      if (!rootMove && sgf.tree.props['KT'] && !newRoot.analysis) {
        applyKtAnalysis(newRoot, sgf.tree.props['KT']);
      }

      const buildFromSgfNode = (parent: GameNode, node: NonNullable<ParsedSgf['tree']>) => {
        const move = extractMove(node.props);
        if (!move) {
          if (node.props['KT'] && !parent.analysis) {
            applyKtAnalysis(parent, node.props['KT']);
          }
          const note = extractKaTrainUserNoteFromSgfComment(node.props['C']);
          if (note) parent.note = parent.note ? `${parent.note}\n${note}` : note;

          const propsNoComments = cloneProps(node.props);
          delete propsNoComments['C'];
          mergeProps(parent.properties ?? (parent.properties = {}), propsNoComments);
          for (const child of node.children) buildFromSgfNode(parent, child);
          return;
        }

        const childNode = applyMoveToNode(parent, move);
        if (!childNode) return;
        childNode.properties = cloneProps(node.props);
        const nodeNote = extractKaTrainUserNoteFromSgfComment(childNode.properties['C']);
        if (nodeNote) childNode.note = nodeNote;
        delete childNode.properties['C'];
        if (node.props['KT'] && !childNode.analysis) {
          applyKtAnalysis(childNode, node.props['KT']);
        }
        parent.children.push(childNode);

        for (const child of node.children) buildFromSgfNode(childNode, child);
      };

      if (rootMove) {
        const first = applyMoveToNode(newRoot, rootMove);
        if (first) {
          first.properties = cloneProps(sgf.tree.props);
          const firstNote = extractKaTrainUserNoteFromSgfComment(first.properties['C']);
          if (firstNote) first.note = firstNote;
          delete first.properties['C'];
          if (sgf.tree.props['KT'] && !first.analysis) {
            applyKtAnalysis(first, sgf.tree.props['KT']);
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

    const rewind = get().settings.loadSgfRewind;
    let current = newRoot;
    if (!rewind) {
      while (current.children.length > 0) current = current.children[0]!;
    }

	    set((state) => ({
	      rootNode: newRoot,
	      currentNode: current,
	      board: current.gameState.board,
      currentPlayer: current.gameState.currentPlayer,
      moveHistory: current.gameState.moveHistory,
      capturedBlack: current.gameState.capturedBlack,
      capturedWhite: current.gameState.capturedWhite,
      komi: rootState.komi,
      boardRotation: 0,
      analysisData: current.analysis || null,
	      treeVersion: state.treeVersion + 1,
	      settings: { ...state.settings, gameRules: rules },
		    }));

		    // KaTrain-like: start a quick background analysis of the whole mainline so graphs populate fast.
		    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
		      const fast = get().settings.loadSgfFastAnalysis;
		      setTimeout(() => (fast ? get().startFastGameAnalysis() : get().startQuickGameAnalysis()), 0);
		    }
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
           const after = get();
           const ended = isPassMove(after.currentNode.move) && isPassMove(after.currentNode.parent?.move);
           if (!ended && after.isAiPlaying && after.aiColor && after.currentPlayer === after.aiColor) {
             setTimeout(() => after.makeAiMove(), 500);
           }
           if (after.isAnalysisMode && !after.isSelfplayToEnd) {
             setTimeout(() => void after.runAnalysis(), 0);
           }
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
          analysisData: null,
      });

      const after = get();
      const ended = isPassMove(after.currentNode.move) && isPassMove(after.currentNode.parent?.move);
      if (!ended && after.isAiPlaying && after.aiColor && after.currentPlayer === after.aiColor) {
        setTimeout(() => after.makeAiMove(), 500);
      }
      if (after.isAnalysisMode && !after.isSelfplayToEnd) setTimeout(() => void after.runAnalysis(), 0);
  },

  resign: () => {
    const state = get();
    const winner = state.currentPlayer === 'black' ? 'W' : 'B';
    const endState = `${winner}+R`;
    state.currentNode.endState = endState;

    if (!state.rootNode.properties) state.rootNode.properties = {};
    state.rootNode.properties.RE = [endState];

    get().stopSelfplayToEnd();

    set((s) => ({
      isAiPlaying: false,
      aiColor: null,
      treeVersion: s.treeVersion + 1,
    }));
  },

  rotateBoard: () =>
    set((state) => ({
      boardRotation: (((state.boardRotation ?? 0) + 1) % 4) as 0 | 1 | 2 | 3,
    })),
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
	        const captured = applyCapturesInPlace(tentativeBoard, x, y, currentPlayer);
	        return { captured, newBoard: tentativeBoard };
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

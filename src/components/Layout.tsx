import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { AnalysisPanel } from './AnalysisPanel';
import { EditToolbar } from './EditToolbar';
import { ManualScorePanel } from './ManualScorePanel';
import type { GameInfoValues, AiConfigValues, TimerConfigValues } from './NewGameModal';
import { downloadSgfFromTree, formatSgfDate, generateSgfFromTree, getSgfDownloadFilenameFromProperties, parseSgf, type KaTrainSgfExportOptions } from '../utils/sgf';
import { clearAutoSavedGame, readAutoSavedGame, writeAutoSavedGame, type AutoSavedGame } from '../utils/autoSave';
import type { LibraryFile } from '../utils/library';
import { loadLibrary, saveLibrary, updateLibraryFileSgf, updateLibraryItem } from '../utils/library';
import { isOgsUrl, loadSgfOrOgs } from '../utils/ogs';
import type { CandidateMove, GameNode, Player } from '../types';
import { DEFAULT_BOARD_SIZE } from '../types';
import { parseGtpMove } from '../lib/gtp';
import { computeJapaneseManualScoreFromOwnership, formatResultScoreLead, roundToHalf } from '../utils/manualScore';
import { computeManualScoreEstimate, toggleDeadStoneChain } from '../utils/scoring';
import { getKaTrainEvalColors } from '../utils/katrainTheme';
import { getEngineModelLabel } from '../utils/engineLabel';
import { normalizeBoardSize } from '../utils/boardSize';
import { PHOTO_BOARD_IMAGE_EXTENSIONS, isPhotoBoardImageFile } from '../utils/photoBoard';
import { isEditableKeyboardTarget } from '../utils/keyboardTarget';
import {
  createUploadedModelUrl,
  isKataGoModelWeightsFile,
  MODEL_UPLOAD_ACCEPT,
  restorePersistedUploadedModelUrl,
  savePersistedUploadedModel,
  validateModelUploadFile,
} from '../utils/modelUpload';

// Layout components
import { MenuDrawer } from './layout/MenuDrawer';
import { TopControlBar } from './layout/TopControlBar';
import { BottomControlBar } from './layout/BottomControlBar';
import { RightPanel } from './layout/RightPanel';
import { StatusBar, type AutoSaveStatus } from './layout/StatusBar';
import { MobileTabBar, type MobileTab } from './layout/MobileTabBar';
import { NotificationToast } from './layout/NotificationToast';
import { LibraryPanel } from './LibraryPanel';
import { MobileHome } from './MobileHome';
import { AutoSaveRecoveryModal } from './AutoSaveRecoveryModal';
import {
  type UiMode,
  type UiState,
  type AnalysisControlsState,
  GHOST_ALPHA,
  loadUiState,
  saveUiState,
} from './layout/types';
import { PanelEdgeToggle } from './layout/ui';
import { formatMoveLabel, playerToShort, rgba } from './layout/ui-utils';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useShortcutLabels } from '../hooks/useShortcutLabels';
import { useGamepadNavigation } from '../hooks/useGamepadNavigation';
import { UnsavedChangesModal, type UnsavedChangesChoice } from './UnsavedChangesModal';
import { getCurrentLineMoveCount } from '../utils/branchNavigation';

const SettingsModal = lazy(() => import('./SettingsModal').then((module) => ({ default: module.SettingsModal })));
const GameAnalysisModal = lazy(() => import('./GameAnalysisModal').then((module) => ({ default: module.GameAnalysisModal })));
const GameReportModal = lazy(() => import('./GameReportModal').then((module) => ({ default: module.GameReportModal })));
const KeyboardHelpModal = lazy(() => import('./KeyboardHelpModal').then((module) => ({ default: module.KeyboardHelpModal })));
const NewGameModal = lazy(() => import('./NewGameModal').then((module) => ({ default: module.NewGameModal })));
const PhotoBoardModal = lazy(() => import('./PhotoBoardModal').then((module) => ({ default: module.PhotoBoardModal })));
const PasteSgfModal = lazy(() => import('./PasteSgfModal').then((module) => ({ default: module.PasteSgfModal })));

const MOBILE_HOME_DISMISSED_KEY = 'web-katrain:mobile_home_dismissed:v1';
const mainFileInputAccept = ['.sgf', ...PHOTO_BOARD_IMAGE_EXTENSIONS, 'image/*', MODEL_UPLOAD_ACCEPT].join(',');
const LAYOUT_SHORTCUT_IDS = ['toggle-library', 'toggle-sidebar'] as const;
type LoadedExternalFile = { name: string; kind: 'file' | 'ogs' | 'pasted' };

const getImportedSgfName = (parsed: ReturnType<typeof parseSgf>, fallback: string): string => {
  const props = parsed.tree?.props ?? {};
  const hasNamedProps = !!(props.GN?.some((value) => value.trim()) || props.PB?.[0]?.trim() || props.PW?.[0]?.trim());
  return hasNamedProps ? getSgfDownloadFilenameFromProperties(props) : fallback;
};

type LayoutShortcutId = (typeof LAYOUT_SHORTCUT_IDS)[number];

function computePointsLost(args: { currentNode: GameNode }): number | null {
  const node = args.currentNode;
  const move = node.move;
  const parent = node.parent;
  if (!move || !parent) return null;

  const parentScore = parent.analysis?.rootScoreLead;
  const childScore = node.analysis?.rootScoreLead;
  if (typeof parentScore === 'number' && typeof childScore === 'number') {
    const sign = move.player === 'black' ? 1 : -1;
    return sign * (parentScore - childScore);
  }

  const candidate = parent.analysis?.moves.find((m) => m.x === move.x && m.y === move.y);
  return candidate?.pointsLost ?? null;
}

export const Layout: React.FC = () => {
  const {
    startNewGame,
    passTurn,
    resign,
    playMove,
    makeAiMove,
    isAiPlaying,
    aiColor,
    navigateBack,
    navigateForward,
    navigateToMove,
    navigateStart,
    navigateEnd,
    switchBranch,
    switchToBranchIndex,
    undoToBranchPoint,
    undoToMainBranch,
    makeCurrentNodeMainBranch,
    findMistake,
    loadGame,
    applySetupStones,
    analyzeExtra,
    resetCurrentAnalysis,
    clearAnalysisCache,
    analysisCacheSize,
    toggleAnalysisMode,
    isAnalysisMode,
    isContinuousAnalysis,
    toggleContinuousAnalysis,
    toggleTeachMode,
    isTeachMode,
    regionOfInterest,
    isSelectingRegionOfInterest,
    startSelectRegionOfInterest,
    setRegionOfInterest,
    isInsertMode,
    isEditMode,
    toggleInsertMode,
    isSelfplayToEnd,
    selfplayToEnd,
    notification,
    clearNotification,
    analysisData,
    board,
    currentNode,
    activeBranchChildIds,
    treeVersion,
    runAnalysis,
    settings,
    updateSettings,
    setRootProperty,
    rootNode,
    currentPlayer,
    moveHistory,
    capturedBlack,
    capturedWhite,
    komi,
    engineStatus,
    engineError,
    engineBackend,
    engineModelName,
    isGameAnalysisRunning,
    gameAnalysisType,
    gameAnalysisDone,
    gameAnalysisTotal,
    startQuickGameAnalysis,
    startFastGameAnalysis,
    stopGameAnalysis,
    rotateBoard,
  } = useGameStore(
    (state) => ({
      resetGame: state.resetGame,
      startNewGame: state.startNewGame,
      passTurn: state.passTurn,
      resign: state.resign,
      playMove: state.playMove,
      makeAiMove: state.makeAiMove,
      isAiPlaying: state.isAiPlaying,
      aiColor: state.aiColor,
      navigateBack: state.navigateBack,
      navigateForward: state.navigateForward,
      navigateToMove: state.navigateToMove,
      navigateStart: state.navigateStart,
      navigateEnd: state.navigateEnd,
      switchBranch: state.switchBranch,
      switchToBranchIndex: state.switchToBranchIndex,
      undoToBranchPoint: state.undoToBranchPoint,
      undoToMainBranch: state.undoToMainBranch,
      makeCurrentNodeMainBranch: state.makeCurrentNodeMainBranch,
      findMistake: state.findMistake,
      loadGame: state.loadGame,
      applySetupStones: state.applySetupStones,
      analyzeExtra: state.analyzeExtra,
      resetCurrentAnalysis: state.resetCurrentAnalysis,
      clearAnalysisCache: state.clearAnalysisCache,
      analysisCacheSize: state.analysisCacheSize,
      toggleAnalysisMode: state.toggleAnalysisMode,
      isAnalysisMode: state.isAnalysisMode,
      isContinuousAnalysis: state.isContinuousAnalysis,
      toggleContinuousAnalysis: state.toggleContinuousAnalysis,
      toggleTeachMode: state.toggleTeachMode,
      isTeachMode: state.isTeachMode,
      regionOfInterest: state.regionOfInterest,
      isSelectingRegionOfInterest: state.isSelectingRegionOfInterest,
      startSelectRegionOfInterest: state.startSelectRegionOfInterest,
      setRegionOfInterest: state.setRegionOfInterest,
      isInsertMode: state.isInsertMode,
      isEditMode: state.isEditMode,
      toggleInsertMode: state.toggleInsertMode,
      isSelfplayToEnd: state.isSelfplayToEnd,
      selfplayToEnd: state.selfplayToEnd,
      notification: state.notification,
      clearNotification: state.clearNotification,
      analysisData: state.analysisData,
      board: state.board,
      currentNode: state.currentNode,
      activeBranchChildIds: state.activeBranchChildIds,
      treeVersion: state.treeVersion,
      runAnalysis: state.runAnalysis,
      settings: state.settings,
      updateSettings: state.updateSettings,
      setRootProperty: state.setRootProperty,
      rootNode: state.rootNode,
      currentPlayer: state.currentPlayer,
      moveHistory: state.moveHistory,
      capturedBlack: state.capturedBlack,
      capturedWhite: state.capturedWhite,
      komi: state.komi,
      engineStatus: state.engineStatus,
      engineError: state.engineError,
      engineBackend: state.engineBackend,
      engineModelName: state.engineModelName,
      isGameAnalysisRunning: state.isGameAnalysisRunning,
      gameAnalysisType: state.gameAnalysisType,
      gameAnalysisDone: state.gameAnalysisDone,
      gameAnalysisTotal: state.gameAnalysisTotal,
      startQuickGameAnalysis: state.startQuickGameAnalysis,
      startFastGameAnalysis: state.startFastGameAnalysis,
      stopGameAnalysis: state.stopGameAnalysis,
      rotateBoard: state.rotateBoard,
    }),
    shallow
  );

  const boardSize = normalizeBoardSize(board.length, DEFAULT_BOARD_SIZE);
  const handicap = useMemo(() => {
    const raw = rootNode.properties?.HA?.[0];
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
    const abCount = rootNode.properties?.AB?.length ?? 0;
    return abCount > 0 ? abCount : 0;
  }, [rootNode.properties]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hoveredMove, setHoveredMove] = useState<CandidateMove | null>(null);
  const [reportHoverMove, setReportHoverMove] = useState<CandidateMove | null>(null);
  const [pvAnim, setPvAnim] = useState<{ key: string; startMs: number } | null>(null);
  const [pvAnimNowMs, setPvAnimNowMs] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGameAnalysisOpen, setIsGameAnalysisOpen] = useState(false);
  const [isGameReportOpen, setIsGameReportOpen] = useState(false);
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState(false);
  const [isNewGameOpen, setIsNewGameOpen] = useState(false);
  const [isPhotoBoardOpen, setIsPhotoBoardOpen] = useState(false);
  const [photoBoardInitialFile, setPhotoBoardInitialFile] = useState<File | null>(null);
  const [isPasteSgfOpen, setIsPasteSgfOpen] = useState(false);
  const [isUnsavedChangesOpen, setIsUnsavedChangesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [lastRightTab, setLastRightTab] = useState<MobileTab>('tree');
  const [uiState, setUiState] = useState<UiState>(() => loadUiState());
  const [libraryOpen, setLibraryOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('web-katrain:library_open:v1') === 'true';
  });
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:sidebar_open:v1') !== 'false';
  });
  const [topBarOpen, setTopBarOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:top_bar_open:v1') !== 'false';
  });
  const [bottomBarOpen, setBottomBarOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:bottom_bar_open:v1') !== 'false';
  });
  const layoutShortcutLabels = useShortcutLabels(LAYOUT_SHORTCUT_IDS);
  const withLayoutShortcut = (label: string, id: LayoutShortcutId) => `${label} (${layoutShortcutLabels[id]})`;
  const [mobileHomeOpen, setMobileHomeOpen] = useState(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
    const isMobileViewport = window.matchMedia('(max-width: 1023px)').matches;
    return isMobileViewport && localStorage.getItem(MOBILE_HOME_DISMISSED_KEY) !== 'true';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.uiTheme = settings.uiTheme;
    document.documentElement.dataset.uiDensity = settings.uiDensity;
  }, [settings.uiDensity, settings.uiTheme]);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    if (typeof localStorage === 'undefined') return 300;
    const raw = localStorage.getItem('web-katrain:left_panel_width:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 300;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    if (typeof localStorage === 'undefined') return 360;
    const raw = localStorage.getItem('web-katrain:right_panel_width:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 360;
  });
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [recentLibraryItems, setRecentLibraryItems] = useState<LibraryFile[]>([]);
  const [loadedLibraryFileId, setLoadedLibraryFileId] = useState<string | null>(null);
  const [loadedLibraryFileName, setLoadedLibraryFileName] = useState<string | null>(null);
  const [loadedExternalFile, setLoadedExternalFile] = useState<LoadedExternalFile | null>(null);
  const [externalLibraryFileUpdate, setExternalLibraryFileUpdate] = useState<{
    id: string;
    sgf: string;
    updatedAt: number;
  } | null>(null);
  const [externalLibraryItemRename, setExternalLibraryItemRename] = useState<{
    id: string;
    name: string;
    updatedAt: number;
  } | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [scoringMode, setScoringMode] = useState(false);
  const [manualDeadStones, setManualDeadStones] = useState<Set<string>>(() => new Set());
  const fileDragCounter = useRef(0);
  const cleanGameSgfRef = useRef<string | null>(null);
  const unsavedChangesResolveRef = useRef<((choice: UnsavedChangesChoice) => void) | null>(null);
  const autoSaveRecoveryCheckedRef = useRef(false);
  const uploadedModelRestorePromiseRef = useRef<ReturnType<typeof restorePersistedUploadedModelUrl> | null>(null);
  const uploadedModelRestoreHandledRef = useRef(false);
  const [autoSaveRecovery, setAutoSaveRecovery] = useState<AutoSavedGame | null>(null);
  const [autoSaveRecoveryChecked, setAutoSaveRecoveryChecked] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === 'undefined') return 1200;
    return window.innerWidth;
  });

  const mode = uiState.mode;
  const boardUiMode = reportHoverMove ? 'analyze' : mode;
  const modeControls = uiState.analysisControls[mode];
  const modePanels = uiState.panels[mode];
  const lockAiDetails = mode === 'play' && settings.trainerLockAi;
  void treeVersion;

  const sgfExportOptions = useMemo<KaTrainSgfExportOptions>(() => {
    const saveCommentsPlayer =
      settings.trainerEvalShowAi
        ? { black: true, white: true }
        : {
          black: !(isAiPlaying && aiColor === 'black'),
          white: !(isAiPlaying && aiColor === 'white'),
        };
    return {
      trainer: {
        evalThresholds: settings.trainerEvalThresholds,
        saveFeedback: settings.trainerSaveFeedback,
        saveCommentsPlayer,
        saveAnalysis: settings.trainerSaveAnalysis,
        saveMarks: settings.trainerSaveMarks,
      },
    };
  }, [
    aiColor,
    isAiPlaying,
    settings.trainerEvalShowAi,
    settings.trainerEvalThresholds,
    settings.trainerSaveAnalysis,
    settings.trainerSaveFeedback,
    settings.trainerSaveMarks,
  ]);

  const endResult = useMemo(() => {
    const nodeEnd = currentNode.endState;
    if (nodeEnd && nodeEnd.includes('+')) return nodeEnd;
    const rootEnd = rootNode.properties?.RE?.[0];
    if (rootEnd && rootEnd.includes('+')) return rootEnd;
    const pass = (n: GameNode | null | undefined) => !!n?.move && (n.move.x < 0 || n.move.y < 0);
    if (pass(currentNode) && pass(currentNode.parent)) {
      if (settings.gameRules === 'japanese') {
        const currentOwnership =
          currentNode.analysis && (currentNode.analysis.ownershipMode ?? 'root') !== 'none'
            ? currentNode.analysis.territory
            : null;
        const previousOwnership =
          currentNode.parent?.analysis && (currentNode.parent.analysis.ownershipMode ?? 'root') !== 'none'
            ? currentNode.parent.analysis.territory
            : null;
        if (currentOwnership && previousOwnership) {
          const manual = computeJapaneseManualScoreFromOwnership({
            board,
            komi,
            capturedBlack,
            capturedWhite,
            currentOwnership,
            previousOwnership,
          });
          if (manual) return manual;
        }
      }

      const scoreLead = currentNode.analysis?.rootScoreLead;
      if (Number.isFinite(scoreLead)) {
        return `${formatResultScoreLead(roundToHalf(scoreLead as number))}?`;
      }
      return 'Game ended';
    }
    return null;
  }, [board, capturedBlack, capturedWhite, currentNode, komi, rootNode, settings.gameRules]);

  useEffect(() => {
    setManualDeadStones(new Set());
  }, [boardSize, currentNode.id]);

  const manualScoreEstimate = useMemo(
    () =>
      computeManualScoreEstimate({
        board,
        komi,
        capturedBlack,
        capturedWhite,
        deadStones: manualDeadStones,
      }),
    [board, capturedBlack, capturedWhite, komi, manualDeadStones]
  );

  const rootProps = rootNode.properties ?? {};
  const getRootProp = (key: string) => rootProps[key]?.[0] ?? '';
  const defaultGameInfo: GameInfoValues = {
    blackName: getRootProp('PB'),
    whiteName: getRootProp('PW'),
    blackRank: getRootProp('BR'),
    whiteRank: getRootProp('WR'),
    event: getRootProp('EV'),
    date: formatSgfDate(),
    place: getRootProp('PC'),
    gameName: getRootProp('GN'),
  };

  const defaultAiConfig: AiConfigValues = {
    opponent: isAiPlaying && aiColor ? aiColor : 'none',
    aiStrategy: settings.aiStrategy,
    aiRankKyu: settings.aiRankKyu,
    aiScoreLossStrength: settings.aiScoreLossStrength,
    aiPolicyOpeningMoves: settings.aiPolicyOpeningMoves,
    aiWeightedPickOverride: settings.aiWeightedPickOverride,
    aiWeightedWeakenFac: settings.aiWeightedWeakenFac,
    aiWeightedLowerBound: settings.aiWeightedLowerBound,
    aiPickPickOverride: settings.aiPickPickOverride,
    aiPickPickN: settings.aiPickPickN,
    aiPickPickFrac: settings.aiPickPickFrac,
    aiLocalPickOverride: settings.aiLocalPickOverride,
    aiLocalStddev: settings.aiLocalStddev,
    aiLocalPickN: settings.aiLocalPickN,
    aiLocalPickFrac: settings.aiLocalPickFrac,
    aiLocalEndgame: settings.aiLocalEndgame,
    aiTenukiPickOverride: settings.aiTenukiPickOverride,
    aiTenukiStddev: settings.aiTenukiStddev,
    aiTenukiPickN: settings.aiTenukiPickN,
    aiTenukiPickFrac: settings.aiTenukiPickFrac,
    aiTenukiEndgame: settings.aiTenukiEndgame,
    aiInfluencePickOverride: settings.aiInfluencePickOverride,
    aiInfluencePickN: settings.aiInfluencePickN,
    aiInfluencePickFrac: settings.aiInfluencePickFrac,
    aiInfluenceThreshold: settings.aiInfluenceThreshold,
    aiInfluenceLineWeight: settings.aiInfluenceLineWeight,
    aiInfluenceEndgame: settings.aiInfluenceEndgame,
    aiTerritoryPickOverride: settings.aiTerritoryPickOverride,
    aiTerritoryPickN: settings.aiTerritoryPickN,
    aiTerritoryPickFrac: settings.aiTerritoryPickFrac,
    aiTerritoryThreshold: settings.aiTerritoryThreshold,
    aiTerritoryLineWeight: settings.aiTerritoryLineWeight,
    aiTerritoryEndgame: settings.aiTerritoryEndgame,
    aiJigoTargetScore: settings.aiJigoTargetScore,
    aiOwnershipMaxPointsLost: settings.aiOwnershipMaxPointsLost,
    aiOwnershipSettledWeight: settings.aiOwnershipSettledWeight,
    aiOwnershipOpponentFac: settings.aiOwnershipOpponentFac,
    aiOwnershipMinVisits: settings.aiOwnershipMinVisits,
    aiOwnershipAttachPenalty: settings.aiOwnershipAttachPenalty,
    aiOwnershipTenukiPenalty: settings.aiOwnershipTenukiPenalty,
  };
  const defaultTimerConfig: TimerConfigValues = {
    mode: settings.timerMainTimeMinutes > 0 || settings.timerByoPeriods > 0 ? 'byo-yomi' : 'none',
    mainTimeMinutes: settings.timerMainTimeMinutes,
    byoLengthSeconds: settings.timerByoLengthSeconds,
    byoPeriods: settings.timerByoPeriods,
  };

  // Toast helper
  const toast = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    useGameStore.setState({ notification: { message, type } });
    window.setTimeout(() => useGameStore.setState({ notification: null }), 2500);
  }, []);

  const toggleScoringMode = useCallback(() => {
    if (!scoringMode && (isEditMode || isInsertMode || isSelectingRegionOfInterest)) {
      toast('Finish editing before scoring.', 'error');
      return;
    }
    setScoringMode((prev) => !prev);
  }, [isEditMode, isInsertMode, isSelectingRegionOfInterest, scoringMode, toast]);

  const clearManualDeadStones = useCallback(() => {
    setManualDeadStones(new Set());
  }, []);

  const toggleManualDeadStone = useCallback((x: number, y: number) => {
    setManualDeadStones((prev) => toggleDeadStoneChain(board, prev, x, y));
  }, [board]);

  useEffect(() => {
    if (!scoringMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === 'Escape') setScoringMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scoringMode]);

  useEffect(() => {
    if (scoringMode && (isEditMode || isInsertMode || isSelectingRegionOfInterest)) {
      setScoringMode(false);
    }
  }, [isEditMode, isInsertMode, isSelectingRegionOfInterest, scoringMode]);

  const generateCurrentSgf = useCallback(
    () => generateSgfFromTree(useGameStore.getState().rootNode, sgfExportOptions),
    [sgfExportOptions]
  );

  const markCurrentGameClean = useCallback((sgf?: string) => {
    cleanGameSgfRef.current = sgf ?? generateCurrentSgf();
  }, [generateCurrentSgf]);

  const markCurrentGameCleanAndClearAutoSave = useCallback((sgf?: string) => {
    markCurrentGameClean(sgf);
    clearAutoSavedGame();
    setAutoSaveStatus(null);
  }, [markCurrentGameClean]);

  const setLoadedLibraryFile = useCallback((id: string | null, name?: string | null) => {
    setLoadedLibraryFileId(id);
    setLoadedLibraryFileName(id ? (name?.trim() || 'Library game') : null);
    setLoadedExternalFile(null);
  }, []);

  const saveLoadedLibraryFile = useCallback(async (sgf: string): Promise<boolean> => {
    if (!loadedLibraryFileId) return false;
    try {
      const items = await loadLibrary();
      const loadedItem = items.find((item) => item.id === loadedLibraryFileId);
      if (!loadedItem || loadedItem.type !== 'file') {
        setLoadedLibraryFile(null);
        toast('Loaded library file was not found. Downloading SGF instead.', 'info');
        return false;
      }
      const updatedAt = Date.now();
      await saveLibrary(updateLibraryFileSgf(items, loadedLibraryFileId, sgf, updatedAt));
      setExternalLibraryFileUpdate({ id: loadedLibraryFileId, sgf, updatedAt });
      setLibraryVersion((prev) => prev + 1);
      markCurrentGameCleanAndClearAutoSave(sgf);
      toast(`Updated "${loadedItem.name}" in Library.`, 'success');
      return true;
    } catch {
      toast('Failed to update loaded library file. Downloading SGF instead.', 'error');
      return false;
    }
  }, [loadedLibraryFileId, markCurrentGameCleanAndClearAutoSave, setLoadedLibraryFile, toast]);

  const renameLoadedLibraryFile = useCallback(async (name: string) => {
    const nextName = name.trim();
    if (!loadedLibraryFileId || !nextName || nextName === loadedLibraryFileName) return;
    try {
      const items = await loadLibrary();
      const loadedItem = items.find((item) => item.id === loadedLibraryFileId);
      if (!loadedItem || loadedItem.type !== 'file') {
        setLoadedLibraryFile(null);
        toast('Loaded library file was not found.', 'error');
        return;
      }
      const updatedAt = Date.now();
      await saveLibrary(updateLibraryItem(items, loadedLibraryFileId, { name: nextName }, updatedAt));
      setLoadedLibraryFile(loadedLibraryFileId, nextName);
      setExternalLibraryItemRename({ id: loadedLibraryFileId, name: nextName, updatedAt });
      setLibraryVersion((prev) => prev + 1);
      toast(`Renamed "${loadedItem.name}" to "${nextName}".`, 'success');
    } catch {
      toast('Failed to rename loaded library file.', 'error');
    }
  }, [loadedLibraryFileId, loadedLibraryFileName, setLoadedLibraryFile, toast]);

  useLayoutEffect(() => {
    if (cleanGameSgfRef.current === null) markCurrentGameClean();
  }, [markCurrentGameClean]);

  const hasUnsavedChanges = useCallback(() => {
    if (cleanGameSgfRef.current === null) return false;
    try {
      return generateCurrentSgf() !== cleanGameSgfRef.current;
    } catch {
      return false;
    }
  }, [generateCurrentSgf]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (autoSaveRecoveryCheckedRef.current) return;
    autoSaveRecoveryCheckedRef.current = true;
    const snapshot = readAutoSavedGame();
    if (snapshot && snapshot.sgf !== generateCurrentSgf()) {
      setAutoSaveRecovery(snapshot);
    }
    setAutoSaveRecoveryChecked(true);
  }, [generateCurrentSgf]);

  useEffect(() => {
    if (!autoSaveRecoveryChecked || autoSaveRecovery) return;
    if (!hasUnsavedChanges()) {
      clearAutoSavedGame();
      setAutoSaveStatus(null);
      return;
    }
    setAutoSaveStatus((current) => (current?.state === 'pending' ? current : { state: 'pending' }));
    const timeout = window.setTimeout(() => {
      const savedAt = Date.now();
      const saved = writeAutoSavedGame(generateCurrentSgf(), undefined, savedAt);
      setAutoSaveStatus(saved ? { state: 'saved', savedAt } : { state: 'failed' });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [autoSaveRecovery, autoSaveRecoveryChecked, generateCurrentSgf, hasUnsavedChanges, treeVersion]);

  const dismissAutoSaveRecovery = useCallback(() => {
    clearAutoSavedGame();
    setAutoSaveRecovery(null);
  }, []);

  const restoreAutoSavedGame = useCallback(() => {
    const snapshot = autoSaveRecovery;
    if (!snapshot) return;
    try {
      const parsed = parseSgf(snapshot.sgf);
      loadGame(parsed);
      setLoadedLibraryFile(null);
      navigateEnd();
      setAutoSaveRecovery(null);
      toast('Restored auto-saved game.', 'success');
    } catch {
      clearAutoSavedGame();
      setAutoSaveRecovery(null);
      toast('Failed to restore auto-saved game.', 'error');
    }
  }, [autoSaveRecovery, loadGame, navigateEnd, setLoadedLibraryFile, toast]);

  const handleSaveCurrentSgf = useCallback(async () => {
    const sgf = generateCurrentSgf();
    if (await saveLoadedLibraryFile(sgf)) return;
    const saved = downloadSgfFromTree(useGameStore.getState().rootNode, sgfExportOptions);
    markCurrentGameCleanAndClearAutoSave(saved);
    toast('Downloaded SGF.', 'success');
  }, [generateCurrentSgf, markCurrentGameCleanAndClearAutoSave, saveLoadedLibraryFile, sgfExportOptions, toast]);

  const confirmReplaceCurrentGame = useCallback(async (): Promise<UnsavedChangesChoice> => {
    if (!hasUnsavedChanges()) return 'discard';
    setIsUnsavedChangesOpen(true);
    return new Promise((resolve) => {
      unsavedChangesResolveRef.current = resolve;
    });
  }, [hasUnsavedChanges]);

  const prepareForGameReplacement = useCallback(async () => {
    const choice = await confirmReplaceCurrentGame();
    if (choice === 'cancel') return false;
    if (choice === 'save') await handleSaveCurrentSgf();
    return true;
  }, [confirmReplaceCurrentGame, handleSaveCurrentSgf]);

  const handleUnsavedChangesChoice = useCallback((choice: UnsavedChangesChoice) => {
    setIsUnsavedChangesOpen(false);
    unsavedChangesResolveRef.current?.(choice);
    unsavedChangesResolveRef.current = null;
  }, []);

  // Persist UI state
  useEffect(() => {
    saveUiState(uiState);
  }, [uiState]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_open:v1', String(libraryOpen));
  }, [libraryOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:sidebar_open:v1', String(showSidebar));
  }, [showSidebar]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:top_bar_open:v1', String(topBarOpen));
  }, [topBarOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:bottom_bar_open:v1', String(bottomBarOpen));
  }, [bottomBarOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:left_panel_width:v1', String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:right_panel_width:v1', String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getPanelLimits = useCallback(() => {
    const minLeft = 220;
    const minRight = 280;
    const minMain = isDesktop ? Math.max(380, Math.min(560, Math.round(viewportWidth * 0.4))) : 0;
    const maxLeftLimit = Math.max(minLeft, Math.min(560, Math.floor(viewportWidth * 0.32)));
    const maxRightLimit = Math.max(minRight, Math.min(600, Math.floor(viewportWidth * 0.34)));
    const maxLeft = Math.max(
      minLeft,
      Math.min(maxLeftLimit, viewportWidth - minMain - (showSidebar ? rightPanelWidth : 0))
    );
    const maxRight = Math.max(
      minRight,
      Math.min(maxRightLimit, viewportWidth - minMain - (libraryOpen ? leftPanelWidth : 0))
    );
    return { minLeft, minRight, maxLeft, maxRight };
  }, [isDesktop, libraryOpen, leftPanelWidth, rightPanelWidth, showSidebar, viewportWidth]);

  useEffect(() => {
    if (!isResizingLeft && !isResizingRight) return;
    const { minLeft, minRight, maxLeft, maxRight } = getPanelLimits();
    const onMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const next = Math.min(maxLeft, Math.max(minLeft, e.clientX));
        setLeftPanelWidth(next);
      }
      if (isResizingRight) {
        const next = Math.min(maxRight, Math.max(minRight, window.innerWidth - e.clientX));
        setRightPanelWidth(next);
      }
    };
    const onUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [
    getPanelLimits,
    isResizingLeft,
    isResizingRight,
  ]);

  useEffect(() => {
    if (!isDesktop) return;
    const { minLeft, minRight, maxLeft, maxRight } = getPanelLimits();

    if (libraryOpen) {
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, leftPanelWidth));
      if (nextLeft !== leftPanelWidth) setLeftPanelWidth(nextLeft);
    }
    if (showSidebar) {
      const nextRight = Math.min(maxRight, Math.max(minRight, rightPanelWidth));
      if (nextRight !== rightPanelWidth) setRightPanelWidth(nextRight);
    }
  }, [getPanelLimits, isDesktop, libraryOpen, leftPanelWidth, rightPanelWidth, showSidebar]);

  // Apply per-mode analysis controls to settings on mode changes
  useEffect(() => {
    updateSettings(modeControls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Keep mode controls in sync if settings are changed elsewhere
  useEffect(() => {
    setUiState((prev) => ({
      ...prev,
      analysisControls: {
        ...prev.analysisControls,
        [prev.mode]: {
          analysisShowChildren: settings.analysisShowChildren,
          analysisShowEval: settings.analysisShowEval,
          analysisShowHints: settings.analysisShowHints,
          analysisShowPolicy: settings.analysisShowPolicy,
          analysisShowOwnership: settings.analysisShowOwnership,
        },
      },
    }));
  }, [
    settings.analysisShowChildren,
    settings.analysisShowEval,
    settings.analysisShowHints,
    settings.analysisShowPolicy,
    settings.analysisShowOwnership,
  ]);

  // Auto-run analysis when in analysis mode
  useEffect(() => {
    if (!isAnalysisMode) return;
    void runAnalysis();
  }, [currentNode.id, isAnalysisMode, runAnalysis]);

  // PV animation
  const activeHoverMove = reportHoverMove ?? hoveredMove;
  const pvOverlayEnabled = isAnalysisMode || !!reportHoverMove;
  const pvKey = useMemo(() => {
    const pv = activeHoverMove?.pv;
    if (!pvOverlayEnabled || !pv || pv.length === 0) return null;
    return `${currentNode.id}|${pv.join(' ')}`;
  }, [currentNode.id, activeHoverMove, pvOverlayEnabled]);

  const evalColors = useMemo(() => getKaTrainEvalColors(settings.trainerTheme), [settings.trainerTheme]);
  const pvAnimTimeS = useMemo(() => {
    if (reportHoverMove) return 0;
    const t = settings.animPvTimeSeconds;
    return typeof t === 'number' && Number.isFinite(t) ? t : 0.5;
  }, [reportHoverMove, settings.animPvTimeSeconds]);

  useEffect(() => {
    if (!pvKey || pvAnimTimeS <= 0) {
      setPvAnim(null);
      return;
    }
    setPvAnim((prev) => (prev?.key === pvKey ? prev : { key: pvKey, startMs: performance.now() }));
    setPvAnimNowMs(performance.now());
  }, [pvKey, pvAnimTimeS]);

  const pvLen = activeHoverMove?.pv?.length ?? 0;
  useEffect(() => {
    if (!pvAnim) return;
    if (!pvKey || pvKey !== pvAnim.key) return;
    if (pvLen <= 0) return;

    const delayMs = Math.max(pvAnimTimeS, 0.1) * 1000;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setPvAnimNowMs(now);
      const upToMove = Math.min(pvLen, (now - pvAnim.startMs) / delayMs);
      if (upToMove < pvLen) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pvAnim, pvAnimTimeS, pvKey, pvLen]);

  const pvUpToMove = useMemo(() => {
    const pv = activeHoverMove?.pv;
    if (!pvOverlayEnabled || !pv || pv.length === 0) return null;
    if (pvAnimTimeS <= 0) return pv.length;
    if (!pvAnim || pvAnim.key !== pvKey) return pv.length;
    const delayMs = Math.max(pvAnimTimeS, 0.1) * 1000;
    return Math.min(pv.length, (pvAnimNowMs - pvAnim.startMs) / delayMs);
  }, [activeHoverMove, pvOverlayEnabled, pvAnim, pvAnimNowMs, pvAnimTimeS, pvKey]);

  const passPv = useMemo(() => {
    const pv = activeHoverMove?.pv;
    if (!pvOverlayEnabled || !pv || pv.length === 0) return null;
    const upToMove = typeof pvUpToMove === 'number' ? pvUpToMove : pv.length;
    const opp: Player = currentPlayer === 'black' ? 'white' : 'black';
    let last: { idx: number; player: Player } | null = null;
    for (let i = 0; i < pv.length; i++) {
      if (i > upToMove) break;
      const m = parseGtpMove(pv[i]!, boardSize);
      if (m?.kind === 'pass') last = { idx: i + 1, player: i % 2 === 0 ? currentPlayer : opp };
    }
    return last;
  }, [boardSize, currentPlayer, activeHoverMove, pvOverlayEnabled, pvUpToMove]);

  const noteCount = useMemo(() => {
    void treeVersion;
    let count = 0;
    const stack: GameNode[] = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.note && node.note.trim()) count += 1;
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
    }
    return count;
  }, [rootNode, treeVersion]);

  // Close popovers on outside clicks
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-menu-popover]')) return;
      setAnalysisMenuOpen(false);
      setViewMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  // Computed values
  const engineDot = useMemo(() => {
    if (engineStatus === 'loading') return 'bg-yellow-400';
    if (engineStatus === 'ready') return 'bg-green-400';
    if (engineStatus === 'error') return 'bg-red-500';
    return 'bg-slate-500';
  }, [engineStatus]);

  const engineModelLabel = useMemo(
    () => getEngineModelLabel(engineModelName, settings.katagoModelUrl),
    [engineModelName, settings.katagoModelUrl]
  );

  const engineMeta = useMemo(() => {
    const stateLabel = engineError
      ? 'Error'
      : engineStatus === 'loading'
        ? 'Loading'
        : engineStatus === 'ready'
          ? 'Ready'
          : 'Idle';
    const requestedBackend = settings.katagoBackend;
    const fallback = !!engineBackend && engineBackend !== requestedBackend;
    const parts: string[] = [];
    parts.push(fallback ? 'Fallback' : stateLabel);
    parts.push(engineBackend ?? requestedBackend);
    if (engineModelLabel) parts.push(engineModelLabel);
    return parts.join(' · ');
  }, [engineBackend, engineError, engineModelLabel, engineStatus, settings.katagoBackend]);

  const engineMetaTitle = useMemo(() => {
    const requestedBackend = settings.katagoBackend;
    const actualBackend = engineBackend ?? requestedBackend;
    const lines = [
      `State: ${engineError ? 'error' : engineStatus}`,
      `Backend: ${actualBackend}`,
    ];
    if (engineModelLabel) lines.push(`Model: ${engineModelLabel}`);
    if (engineBackend && engineBackend !== requestedBackend) {
      lines.push(`Fallback: requested ${requestedBackend}, running ${engineBackend}.`);
    }
    if (engineError) lines.push(`Error: ${engineError}`);
    return lines.filter(Boolean).join('\n');
  }, [engineBackend, engineError, engineModelLabel, engineStatus, settings.katagoBackend]);

  const statusText = engineError
    ? `Engine error: ${engineError}`
    : isSelfplayToEnd
      ? 'Selfplay to end… (Esc to stop)'
      : isSelectingRegionOfInterest
        ? 'Select region of interest (drag on board, Esc cancels)'
        : scoringMode
          ? 'Scoring mode'
        : notification?.message
          ? notification.message
          : isInsertMode
            ? 'Insert mode (I to finish)'
            : isGameAnalysisRunning
              ? `Analyzing game (${gameAnalysisType ?? '…'})… ${gameAnalysisDone}/${gameAnalysisTotal}`
              : isContinuousAnalysis
                ? 'Pondering… (Space)'
                : isAnalysisMode
                  ? 'Analysis mode on (Tab toggles)'
                  : 'Ready';

  const pointsLost = computePointsLost({ currentNode });
  const winRate = analysisData?.rootWinRate ?? currentNode.analysis?.rootWinRate;
  const scoreLead = analysisData?.rootScoreLead ?? currentNode.analysis?.rootScoreLead;
  const totalMovesInCurrentLine = useMemo(() => {
    void treeVersion;
    return getCurrentLineMoveCount(currentNode, activeBranchChildIds);
  }, [activeBranchChildIds, currentNode, treeVersion]);
  const passPolicyColor = useMemo(() => {
    if (!isAnalysisMode || !settings.analysisShowPolicy) return null;
    const policy = analysisData?.policy;
    if (!policy) return null;
    const passPolicy = policy[boardSize * boardSize];
    if (!Number.isFinite(passPolicy)) return null;
    const polOrder = 5 - Math.trunc(-Math.log10(Math.max(1e-9, passPolicy - 1e-9)));
    if (polOrder < 0) return null;
    const col = evalColors[Math.min(evalColors.length - 1, Math.max(0, polOrder))]!;
    return rgba(col, GHOST_ALPHA);
  }, [analysisData, boardSize, evalColors, isAnalysisMode, settings.analysisShowPolicy]);

  const winRateLabel = typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : null;
  const scoreLeadLabel = typeof scoreLead === 'number' ? formatResultScoreLead(scoreLead) : null;
  const pointsLostLabel = typeof pointsLost === 'number' ? formatResultScoreLead(pointsLost) : null;

  const setMode = (next: UiMode) => {
    setUiState((prev) => ({ ...prev, mode: next }));
  };

  const updateControls = (partial: Partial<AnalysisControlsState>) => {
    updateSettings(partial);
    setUiState((prev) => ({
      ...prev,
      analysisControls: {
        ...prev.analysisControls,
        [prev.mode]: { ...prev.analysisControls[prev.mode], ...partial },
      },
    }));
  };

  const updatePanels = (
    partial:
      | Partial<UiState['panels'][UiMode]>
      | ((current: UiState['panels'][UiMode]) => Partial<UiState['panels'][UiMode]>)
  ) => {
    setUiState((prev) => {
      const current = prev.panels[prev.mode];
      const nextPartial = typeof partial === 'function' ? partial(current) : partial;
      return {
        ...prev,
        panels: { ...prev.panels, [prev.mode]: { ...current, ...nextPartial } },
      };
    });
  };

  const isMobile = !isDesktop;

  useEffect(() => {
    if (!isDesktop) return;
    setMobileHomeOpen(false);
  }, [isDesktop]);

  const closeMobileHome = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MOBILE_HOME_DISMISSED_KEY, 'true');
    }
    setMobileHomeOpen(false);
  };

  const openMobileHome = () => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    setMobileHomeOpen(true);
  };

  const openRightPanelForTab = (tab: MobileTab) => {
    setRightPanelOpen(true);
    setLibraryOpen(false);
    setMobileTab(tab);
    if (tab === 'tree') updatePanels({ treeOpen: true });
    if (tab === 'info') updatePanels({ infoOpen: true, notesOpen: true, analysisOpen: true, graphOpen: true, statsOpen: true });
    if (tab === 'tree' || tab === 'info') {
      setLastRightTab(tab);
    }
  };

  const handleMobileTabChange = (tab: MobileTab) => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    if (tab === 'board') {
      setMobileTab('board');
      setLibraryOpen(false);
      setRightPanelOpen(false);
      return;
    }
    if (tab === 'library') {
      setMobileTab('library');
      setLibraryOpen(true);
      setRightPanelOpen(false);
      return;
    }
    openRightPanelForTab(tab);
  };

  const handleToggleLibrary = () => {
    if (isMobile) {
      handleMobileTabChange(libraryOpen ? 'board' : 'library');
      return;
    }
    setLibraryOpen((prev) => !prev);
  };

  const handleCloseLibrary = () => {
    setLibraryOpen(false);
    if (isMobile) setMobileTab('board');
  };

  const handleToggleSidebar = () => {
    if (isMobile) {
      handleMobileTabChange(rightPanelOpen ? 'board' : lastRightTab);
      return;
    }
    setShowSidebar((prev) => !prev);
  };

  const handleOpenSidePanel = () => {
    if (isMobile) {
      handleMobileTabChange(lastRightTab);
      return;
    }
    setRightPanelOpen(true);
  };

  const handleCloseRightPanel = () => {
    if (isMobile) {
      setRightPanelOpen(false);
      setMobileTab('board');
    } else {
      setShowSidebar(false);
    }
  };

  const handleLoadClick = () => fileInputRef.current?.click();

  useEffect(() => {
    if (uploadedModelRestoreHandledRef.current) return;
    let cancelled = false;
    const restorePromise = uploadedModelRestorePromiseRef.current ?? restorePersistedUploadedModelUrl(settings.katagoModelUrl);
    uploadedModelRestorePromiseRef.current = restorePromise;

    void restorePromise.then((restored) => {
      if (cancelled || uploadedModelRestoreHandledRef.current) return;
      uploadedModelRestoreHandledRef.current = true;
      if (!restored) return;
      updateSettings({ katagoModelUrl: restored.url });
      toast(`Restored uploaded KataGo model weights "${restored.name}".`, 'success');
    });

    return () => {
      cancelled = true;
    };
  }, [settings.katagoModelUrl, toast, updateSettings]);

  const handleModelWeightsFile = useCallback(async (file: File): Promise<boolean> => {
    const error = validateModelUploadFile(file);
    if (error) {
      toast(error, 'error');
      return false;
    }
    updateSettings({ katagoModelUrl: createUploadedModelUrl(file, settings.katagoModelUrl) });
    const persisted = await savePersistedUploadedModel(file);
    toast(
      persisted
        ? `Loaded and saved KataGo model weights "${file.name}".`
        : `Loaded KataGo model weights "${file.name}" for this session.`,
      'success'
    );
    return true;
  }, [settings.katagoModelUrl, toast, updateSettings]);

  const openNewGameWithGuard = useCallback(async () => {
    setMenuOpen(false);
    if (!(await prepareForGameReplacement())) return;
    setIsNewGameOpen(true);
  }, [prepareForGameReplacement]);

  const loadLocalSgfText = async (text: string, sourceName: string): Promise<boolean> => {
    const parsed = parseSgf(text);
    if (!(await prepareForGameReplacement())) return false;
    loadGame(parsed);
    setLoadedLibraryFile(null);
    setLoadedExternalFile({ kind: 'file', name: sourceName || getImportedSgfName(parsed, 'Loaded SGF') });
    markCurrentGameCleanAndClearAutoSave();
    toast(`Loaded "${sourceName || 'SGF'}".`, 'success');
    return true;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (isKataGoModelWeightsFile(file)) {
        await handleModelWeightsFile(file);
        return;
      }
      if (isPhotoBoardImageFile(file)) {
        openPhotoBoard(file);
        toast('Opened photo board from image.', 'info');
        return;
      }
      const text = await file.text();
      await loadLocalSgfText(text, file.name);
    } catch {
      toast('Failed to parse SGF file.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadFromLibrary = async (sgfText: string): Promise<boolean> => {
    try {
      const parsed = parseSgf(sgfText);
      if (!(await prepareForGameReplacement())) return false;
      loadGame(parsed);
      markCurrentGameCleanAndClearAutoSave();
      return true;
    } catch {
      toast('Failed to load SGF from library.', 'error');
      return false;
    }
  };

  const handleCopySgf = async () => {
    const sgf = generateSgfFromTree(rootNode, sgfExportOptions);
    try {
      await navigator.clipboard.writeText(sgf);
      toast('Copied SGF to clipboard.', 'success');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = sgf;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copied SGF to clipboard.', 'success');
      } catch {
        toast('Copy failed (clipboard unavailable).', 'error');
      }
    }
  };

  const handlePasteSgf = () => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    setMenuOpen(false);
    setIsPasteSgfOpen(true);
  };

  const openPhotoBoard = useCallback((file: File | null = null) => {
    setPhotoBoardInitialFile(file);
    setIsPhotoBoardOpen(true);
  }, []);

  const closePhotoBoard = useCallback(() => {
    setIsPhotoBoardOpen(false);
    setPhotoBoardInitialFile(null);
  }, []);

  const handleOpenSgfFromText = async (text: string): Promise<boolean> => {
    try {
      const result = await loadSgfOrOgs(text);
      if (!result.sgf.trim()) return false;
      const parsed = parseSgf(result.sgf);
      if (!(await prepareForGameReplacement())) return false;
      loadGame(parsed);
      setLoadedLibraryFile(null);
      setLoadedExternalFile(
        result.source === 'ogs'
          ? { kind: 'ogs', name: `ogs-${result.gameId ?? 'game'}.sgf` }
          : { kind: 'pasted', name: getImportedSgfName(parsed, 'Pasted SGF') }
      );
      markCurrentGameCleanAndClearAutoSave();
      toast(result.source === 'ogs' ? `Downloaded OGS game ${result.gameId ?? ''}.` : 'Loaded SGF.', 'success');
      return true;
    } catch {
      toast('Failed to load SGF or OGS URL.', 'error');
      return false;
    }
  };

  const handleOpenRecent = async (item: LibraryFile) => {
    const loaded = await handleLoadFromLibrary(item.sgf);
    if (!loaded) return;
    setLoadedLibraryFile(item.id, item.name);
    toast(`Loaded "${item.name}".`, 'success');
  };

  useEffect(() => {
    const handlePasteEvent = (event: ClipboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && (target.isContentEditable || target.closest('[contenteditable="true"]')))
      ) {
        return;
      }

      const trimmed = event.clipboardData?.getData('text/plain')?.trim() ?? '';
      if (!trimmed || (!trimmed.startsWith('(') && !isOgsUrl(trimmed))) return;

      event.preventDefault();
      void handleOpenSgfFromText(trimmed);
    };

    document.addEventListener('paste', handlePasteEvent);
    return () => document.removeEventListener('paste', handlePasteEvent);
  });

  const handlePasteSgfShortcut = async () => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    setMenuOpen(false);

    try {
      const clipboardText = await navigator.clipboard?.readText?.();
      const trimmed = clipboardText?.trim() ?? '';
      if (trimmed && (trimmed.startsWith('(') || isOgsUrl(trimmed))) {
        await handleOpenSgfFromText(trimmed);
        return;
      }
    } catch {
      // Fall back to the modal when direct clipboard access is unavailable.
    }

    setIsPasteSgfOpen(true);
  };

  const handlePhotoBoardImport = async (sgfText: string) => {
    try {
      const parsed = parseSgf(sgfText);
      if (!(await prepareForGameReplacement())) return;
      loadGame(parsed);
      setLoadedLibraryFile(null);
      navigateStart();
      markCurrentGameCleanAndClearAutoSave();
      closePhotoBoard();
      toast('Imported board position.', 'success');
    } catch {
      toast('Failed to import board position.', 'error');
    }
  };

  const handlePhotoBoardAddSetup = async (
    stones: Array<{ x: number; y: number; player: Player }>,
    scannedBoardSize: number
  ) => {
    if (scannedBoardSize !== boardSize) {
      toast(`Photo board is ${scannedBoardSize}x${scannedBoardSize}; current board is ${boardSize}x${boardSize}.`, 'error');
      return;
    }
    const changed = applySetupStones(stones);
    if (changed === 0) {
      toast('No new photo board stones to add.', 'info');
      return;
    }
    closePhotoBoard();
    toast(`Added ${changed} setup stone${changed === 1 ? '' : 's'} from photo board.`, 'success');
  };

  const handlePhotoBoardPlayMove = async (x: number, y: number) => {
    const beforeNodeId = useGameStore.getState().currentNode.id;
    playMove(x, y);
    const after = useGameStore.getState();
    if (after.currentNode.id === beforeNodeId) {
      toast('Could not play photo board move.', 'error');
      return;
    }
    closePhotoBoard();
    toast('Played photo board move.', 'success');
  };

  const handleLibraryUpdated = useCallback(() => {
    setLibraryVersion((prev) => prev + 1);
  }, []);

  const isFileDragEvent = (event: React.DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  const isDragOverLibrary = (target: EventTarget | null) => {
    if (!target || !(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('[data-dropzone="library"]'));
  };

  const handleAppDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event) || isDragOverLibrary(event.target)) return;
    event.preventDefault();
    fileDragCounter.current += 1;
    setIsFileDragActive(true);
  };

  const handleAppDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDragOverLibrary(event.target)) return;
    fileDragCounter.current = Math.max(0, fileDragCounter.current - 1);
    if (fileDragCounter.current === 0) {
      setIsFileDragActive(false);
    }
  };

  const handleAppDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event) || isDragOverLibrary(event.target)) return;
    event.preventDefault();
  };

  const handleAppDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      fileDragCounter.current = 0;
      setIsFileDragActive(false);
      return;
    }
    if (!isFileDragEvent(event) || isDragOverLibrary(event.target)) {
      fileDragCounter.current = 0;
      setIsFileDragActive(false);
      return;
    }
    event.preventDefault();
    fileDragCounter.current = 0;
    setIsFileDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (isKataGoModelWeightsFile(file)) {
      await handleModelWeightsFile(file);
      return;
    }
    if (isPhotoBoardImageFile(file)) {
      openPhotoBoard(file);
      toast('Opened photo board from dropped image.', 'info');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.sgf')) {
      toast('Drop an SGF file, board photo, or KataGo model weights here.', 'error');
      return;
    }
    try {
      const text = await file.text();
      await loadLocalSgfText(text, file.name);
    } catch {
      toast('Failed to load the dropped SGF file.', 'error');
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadLibrary()
      .then((libraryItems) => {
        if (cancelled) return;
        setRecentLibraryItems(
          libraryItems
            .filter((item): item is LibraryFile => item.type === 'file')
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 6)
        );
      })
      .catch(() => {
        if (!cancelled) setRecentLibraryItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [libraryOpen, libraryVersion]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    mode,
    sgfExportOptions,
    saveSgf: handleSaveCurrentSgf,
    openSgf: handleLoadClick,
    setIsSettingsOpen,
    setIsGameAnalysisOpen,
    setIsGameReportOpen,
    setAnalysisMenuOpen,
    setViewMenuOpen,
    setMenuOpen,
    setIsKeyboardHelpOpen,
    openPasteSgf: handlePasteSgfShortcut,
    openNewGame: () => void openNewGameWithGuard(),
    toggleLibrary: handleToggleLibrary,
    closeLibrary: handleCloseLibrary,
    toggleSidebar: handleToggleSidebar,
    toast,
  });

  const jumpBack = (n: number) => {
    for (let i = 0; i < n; i++) navigateBack();
  };
  const jumpForward = (n: number) => {
    for (let i = 0; i < n; i++) navigateForward();
  };

  const blackName = getRootProp('PB') || 'Black';
  const whiteName = getRootProp('PW') || 'White';
  const moveName = currentNode.move
    ? `Move ${moveHistory.length}: ${playerToShort(currentNode.move.player)} ${formatMoveLabel(currentNode.move.x, currentNode.move.y, boardSize)}`
    : 'Root';

  const handleUndo = () => {
    const st = useGameStore.getState();
    const lastMover = st.currentNode.move?.player ?? null;
    const shouldUndoTwice = !!st.isAiPlaying && !!st.aiColor && lastMover === st.aiColor && st.currentPlayer !== st.aiColor;
    navigateBack();
    if (shouldUndoTwice) navigateBack();
  };

  const handleResign = () => {
    const result = currentPlayer === 'black' ? 'W+R' : 'B+R';
    resign();
    toast(`Result: ${result}`, 'info');
  };

  const handleDisableGamepadNavigation = useCallback(() => {
    updateSettings({ gamepadNavigation: false });
    toast('Gamepad navigation disabled.', 'info');
  }, [toast, updateSettings]);

  const gamepadStatus = useGamepadNavigation({
    enabled:
      settings.gamepadNavigation &&
      !scoringMode &&
      !isSelectingRegionOfInterest &&
      !isInsertMode &&
      !isEditMode &&
      !isSettingsOpen &&
      !isGameAnalysisOpen &&
      !isGameReportOpen &&
      !isKeyboardHelpOpen &&
      !isNewGameOpen &&
      !isPhotoBoardOpen &&
      !isPasteSgfOpen &&
      !isUnsavedChangesOpen,
    handlers: {
      back: mode === 'play' ? handleUndo : navigateBack,
      forward: navigateForward,
      backFast: () => jumpBack(10),
      forwardFast: () => jumpForward(10),
      start: navigateStart,
      end: navigateEnd,
      branchPrev: () => switchBranch(-1),
      branchNext: () => switchBranch(1),
    },
  });
  const currentGameDirty = hasUnsavedChanges();
  const saveControlLabel = loadedLibraryFileId ? 'Save to Library' : 'Save SGF';
  const desktopBottomControlsHeight =
    !isMobile && settings.showBoardControls && bottomBarOpen ? 'var(--ui-bar-height)' : '0px';

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--desktop-bottom-controls-height', desktopBottomControlsHeight);
    return () => {
      root.style.removeProperty('--desktop-bottom-controls-height');
    };
  }, [desktopBottomControlsHeight]);

  return (
    <div
      className="relative flex flex-col h-screen h-[100dvh] overflow-hidden app-root ui-root font-sans mobile-safe-inset"
      onDragEnter={handleAppDragEnter}
      onDragLeave={handleAppDragLeave}
      onDragOver={handleAppDragOver}
      onDrop={handleAppDrop}
    >
      <Suspense fallback={null}>
        {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
        {autoSaveRecovery && (
          <AutoSaveRecoveryModal
            snapshot={autoSaveRecovery}
            onRestore={restoreAutoSavedGame}
            onDismiss={dismissAutoSaveRecovery}
          />
        )}
        {isUnsavedChangesOpen && (
          <UnsavedChangesModal
            onChoice={handleUnsavedChangesChoice}
            saveTarget={loadedLibraryFileId ? 'library' : 'download'}
          />
        )}
        {isGameAnalysisOpen && <GameAnalysisModal onClose={() => setIsGameAnalysisOpen(false)} />}
        {isGameReportOpen && (
          <GameReportModal
            onClose={() => {
              setIsGameReportOpen(false);
              setReportHoverMove(null);
            }}
            setReportHoverMove={setReportHoverMove}
          />
        )}
        {isKeyboardHelpOpen && <KeyboardHelpModal onClose={() => setIsKeyboardHelpOpen(false)} />}
        {isPhotoBoardOpen && (
          <PhotoBoardModal
            onClose={closePhotoBoard}
            onImportSgf={handlePhotoBoardImport}
            onAddSetupStones={handlePhotoBoardAddSetup}
            onPlayMove={handlePhotoBoardPlayMove}
            defaultBoardSize={boardSize}
            defaultKomi={komi}
            currentBoard={board}
            currentPlayer={currentPlayer}
            initialPhotoFile={photoBoardInitialFile}
          />
        )}
        {isPasteSgfOpen && (
          <PasteSgfModal
            onClose={() => setIsPasteSgfOpen(false)}
            onSubmit={handleOpenSgfFromText}
          />
        )}
        {isNewGameOpen && (
          <NewGameModal
            onClose={() => setIsNewGameOpen(false)}
            onStart={({ komi: nextKomi, rules, info, aiConfig, timerConfig, boardSize: nextBoardSize, handicap: nextHandicap }) => {
            startNewGame({ komi: nextKomi, rules, boardSize: nextBoardSize, handicap: nextHandicap });
            setLoadedLibraryFile(null);
            setRootProperty('PB', info.blackName);
            setRootProperty('PW', info.whiteName);
            setRootProperty('BR', info.blackRank);
            setRootProperty('WR', info.whiteRank);
            setRootProperty('EV', info.event);
            setRootProperty('DT', info.date);
            setRootProperty('PC', info.place);
            setRootProperty('GN', info.gameName);
            const timerEnabled = timerConfig.mode === 'byo-yomi';
            const safeMainTimeMinutes = Number.isFinite(timerConfig.mainTimeMinutes)
              ? Math.max(0, timerConfig.mainTimeMinutes)
              : 0;
            const safeByoLengthSeconds = Number.isFinite(timerConfig.byoLengthSeconds)
              ? Math.max(1, Math.floor(timerConfig.byoLengthSeconds))
              : 1;
            const safeByoPeriods = Number.isFinite(timerConfig.byoPeriods)
              ? Math.max(1, Math.floor(timerConfig.byoPeriods))
              : 1;
            const timerSettings = timerEnabled
              ? {
                timerMainTimeMinutes: safeMainTimeMinutes,
                timerByoLengthSeconds: safeByoLengthSeconds,
                timerByoPeriods: safeByoPeriods,
              }
              : {
                timerMainTimeMinutes: 0,
                timerByoLengthSeconds: 0,
                timerByoPeriods: 0,
                timerMinimalUseSeconds: 0,
              };
            updateSettings({
              aiStrategy: aiConfig.aiStrategy,
              aiRankKyu: aiConfig.aiRankKyu,
              aiScoreLossStrength: aiConfig.aiScoreLossStrength,
              aiPolicyOpeningMoves: aiConfig.aiPolicyOpeningMoves,
              aiWeightedPickOverride: aiConfig.aiWeightedPickOverride,
              aiWeightedWeakenFac: aiConfig.aiWeightedWeakenFac,
              aiWeightedLowerBound: aiConfig.aiWeightedLowerBound,
              aiPickPickOverride: aiConfig.aiPickPickOverride,
              aiPickPickN: aiConfig.aiPickPickN,
              aiPickPickFrac: aiConfig.aiPickPickFrac,
              aiLocalPickOverride: aiConfig.aiLocalPickOverride,
              aiLocalStddev: aiConfig.aiLocalStddev,
              aiLocalPickN: aiConfig.aiLocalPickN,
              aiLocalPickFrac: aiConfig.aiLocalPickFrac,
              aiLocalEndgame: aiConfig.aiLocalEndgame,
              aiTenukiPickOverride: aiConfig.aiTenukiPickOverride,
              aiTenukiStddev: aiConfig.aiTenukiStddev,
              aiTenukiPickN: aiConfig.aiTenukiPickN,
              aiTenukiPickFrac: aiConfig.aiTenukiPickFrac,
              aiTenukiEndgame: aiConfig.aiTenukiEndgame,
              aiInfluencePickOverride: aiConfig.aiInfluencePickOverride,
              aiInfluencePickN: aiConfig.aiInfluencePickN,
              aiInfluencePickFrac: aiConfig.aiInfluencePickFrac,
              aiInfluenceThreshold: aiConfig.aiInfluenceThreshold,
              aiInfluenceLineWeight: aiConfig.aiInfluenceLineWeight,
              aiInfluenceEndgame: aiConfig.aiInfluenceEndgame,
              aiTerritoryPickOverride: aiConfig.aiTerritoryPickOverride,
              aiTerritoryPickN: aiConfig.aiTerritoryPickN,
              aiTerritoryPickFrac: aiConfig.aiTerritoryPickFrac,
              aiTerritoryThreshold: aiConfig.aiTerritoryThreshold,
              aiTerritoryLineWeight: aiConfig.aiTerritoryLineWeight,
              aiTerritoryEndgame: aiConfig.aiTerritoryEndgame,
              aiJigoTargetScore: aiConfig.aiJigoTargetScore,
              aiOwnershipMaxPointsLost: aiConfig.aiOwnershipMaxPointsLost,
              aiOwnershipSettledWeight: aiConfig.aiOwnershipSettledWeight,
              aiOwnershipOpponentFac: aiConfig.aiOwnershipOpponentFac,
              aiOwnershipMinVisits: aiConfig.aiOwnershipMinVisits,
              aiOwnershipAttachPenalty: aiConfig.aiOwnershipAttachPenalty,
              aiOwnershipTenukiPenalty: aiConfig.aiOwnershipTenukiPenalty,
              ...timerSettings,
            });
            const opponent = aiConfig.opponent === 'none' ? null : aiConfig.opponent;
            useGameStore.setState({ isAiPlaying: !!opponent, aiColor: opponent });
            const after = useGameStore.getState();
            if (after.isAiPlaying && after.aiColor === after.currentPlayer) {
              window.setTimeout(() => after.makeAiMove(), 0);
            }
            markCurrentGameCleanAndClearAutoSave();
            setIsNewGameOpen(false);
          }}
            defaultKomi={komi}
            defaultRules={settings.gameRules}
            defaultBoardSize={settings.defaultBoardSize}
            defaultHandicap={settings.defaultHandicap}
            defaultInfo={defaultGameInfo}
            defaultAiConfig={defaultAiConfig}
            defaultTimerConfig={defaultTimerConfig}
          />
        )}
      </Suspense>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept={mainFileInputAccept} />

      {isFileDragActive && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="rounded-xl border-2 border-dashed border-[var(--ui-accent)] px-6 py-4 text-center ui-panel">
            <div className="text-sm font-semibold text-[var(--ui-accent)]">Drop SGF, board photo, or model weights</div>
            <div className="text-xs ui-text-faint">Release to load a game, trace a photo, or switch browser KataGo weights.</div>
          </div>
        </div>
      )}

      <MenuDrawer
        open={menuOpen && isMobile}
        onClose={() => setMenuOpen(false)}
        onHome={openMobileHome}
        onNewGame={() => void openNewGameWithGuard()}
        onSave={handleSaveCurrentSgf}
        saveLabel={saveControlLabel}
        onLoad={handleLoadClick}
        onScanBoard={() => openPhotoBoard()}
        onCopy={handleCopySgf}
        onPaste={handlePasteSgf}
        onSettings={() => setIsSettingsOpen(true)}
        onKeyboardHelp={() => setIsKeyboardHelpOpen(true)}
        recentItems={recentLibraryItems}
        onOpenRecent={handleOpenRecent}
      />

      {isMobile && (
        <MobileHome
          open={mobileHomeOpen}
          blackName={blackName}
          whiteName={whiteName}
          boardSize={boardSize}
          moveCount={moveHistory.length}
          engineMeta={engineMeta}
          recentItems={recentLibraryItems}
          onClose={closeMobileHome}
          onNewGame={() => {
            closeMobileHome();
            void openNewGameWithGuard();
          }}
          onOpenSgf={() => {
            closeMobileHome();
            handleLoadClick();
          }}
          onScanBoard={() => {
            closeMobileHome();
            openPhotoBoard();
          }}
          onPasteSgf={() => {
            closeMobileHome();
            void handlePasteSgf();
          }}
          onOpenLibrary={() => {
            closeMobileHome();
            handleMobileTabChange('library');
          }}
          onOpenReport={() => {
            closeMobileHome();
            setIsGameReportOpen(true);
          }}
          onOpenSettings={() => {
            closeMobileHome();
            setIsSettingsOpen(true);
          }}
          onOpenRecent={(item) => {
            closeMobileHome();
            void handleOpenRecent(item);
          }}
        />
      )}

      <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden">
        <LibraryPanel
          open={libraryOpen}
          onClose={handleCloseLibrary}
          docked={isDesktop}
          width={leftPanelWidth}
          getCurrentSgf={() => generateSgfFromTree(rootNode, sgfExportOptions)}
          onLoadSgf={handleLoadFromLibrary}
          onToast={toast}
          onOpenPhotoBoard={openPhotoBoard}
          isMobile={isMobile}
          onLibraryUpdated={handleLibraryUpdated}
          onCurrentSaved={markCurrentGameCleanAndClearAutoSave}
          loadedFileId={loadedLibraryFileId}
          onLoadedFileChange={setLoadedLibraryFile}
          externalFileUpdate={externalLibraryFileUpdate}
          externalItemRename={externalLibraryItemRename}
          isAnalysisRunning={isGameAnalysisRunning}
          onStopAnalysis={stopGameAnalysis}
          analysisContent={
            isDesktop ? (
              <AnalysisPanel
                mode={mode}
                modePanels={modePanels}
                analysisControls={modeControls}
                updatePanels={updatePanels}
                updateControls={updateControls}
                statusText={statusText}
                engineDot={engineDot}
                engineMeta={engineMeta}
                engineMetaTitle={engineMetaTitle}
                engineStatus={engineStatus}
                engineError={engineError}
                engineBackend={engineBackend}
                engineModelLabel={engineModelLabel}
                requestedBackend={settings.katagoBackend}
                modelUrl={settings.katagoModelUrl}
                isGameAnalysisRunning={isGameAnalysisRunning}
                gameAnalysisType={gameAnalysisType}
                gameAnalysisDone={gameAnalysisDone}
                gameAnalysisTotal={gameAnalysisTotal}
                startQuickGameAnalysis={startQuickGameAnalysis}
                startFastGameAnalysis={startFastGameAnalysis}
                stopGameAnalysis={stopGameAnalysis}
                clearAnalysisCache={clearAnalysisCache}
                analysisCacheSize={analysisCacheSize}
                onOpenGameAnalysis={() => setIsGameAnalysisOpen(true)}
                onOpenGameReport={() => setIsGameReportOpen(true)}
                currentMoveNumber={moveHistory.length}
                winRate={winRate ?? null}
                scoreLead={scoreLead ?? null}
                pointsLost={pointsLost}
              />
            ) : null
          }
        />

        {isDesktop && libraryOpen && (
          <div
            className="hidden lg:block w-1 cursor-col-resize bg-[var(--ui-border)] hover:bg-[var(--ui-border-strong)] transition-colors"
            onMouseDown={() => setIsResizingLeft(true)}
            onDoubleClick={handleToggleLibrary}
          />
        )}

        {/* Main board column */}
        <div
          className={['flex flex-col flex-1 min-w-0 min-h-0 w-full max-w-full relative', isMobile ? 'mobile-safe-bottom' : ''].join(' ')}
          style={isMobile ? { paddingBottom: `calc(var(--mobile-tabbar-height) + ${settings.showBoardControls && bottomBarOpen && mobileTab === 'board' ? 'var(--ui-bar-height) + ' : ''}var(--pwa-banner-height, 0px) + env(safe-area-inset-bottom))` } : undefined}
        >
          {topBarOpen && (
            <TopControlBar
              settings={settings}
              updateControls={updateControls}
              updateSettings={updateSettings}
              regionOfInterest={regionOfInterest}
              setRegionOfInterest={setRegionOfInterest}
              isInsertMode={isInsertMode}
              isEditMode={isEditMode}
              isAnalysisMode={isAnalysisMode}
              toggleAnalysisMode={toggleAnalysisMode}
              engineDot={engineDot}
              analysisMenuOpen={analysisMenuOpen}
              setAnalysisMenuOpen={setAnalysisMenuOpen}
              viewMenuOpen={viewMenuOpen}
              setViewMenuOpen={setViewMenuOpen}
              analyzeExtra={analyzeExtra}
              startSelectRegionOfInterest={startSelectRegionOfInterest}
              resetCurrentAnalysis={resetCurrentAnalysis}
              clearAnalysisCache={clearAnalysisCache}
              analysisCacheSize={analysisCacheSize}
              toggleInsertMode={toggleInsertMode}
              selfplayToEnd={selfplayToEnd}
              toggleContinuousAnalysis={toggleContinuousAnalysis}
              makeAiMove={makeAiMove}
              rotateBoard={rotateBoard}
              toggleTeachMode={toggleTeachMode}
              isTeachMode={isTeachMode}
              isGameAnalysisRunning={isGameAnalysisRunning}
              gameAnalysisType={gameAnalysisType}
              gameAnalysisDone={gameAnalysisDone}
              gameAnalysisTotal={gameAnalysisTotal}
              startQuickGameAnalysis={startQuickGameAnalysis}
              startFastGameAnalysis={startFastGameAnalysis}
              stopGameAnalysis={stopGameAnalysis}
              setIsGameAnalysisOpen={setIsGameAnalysisOpen}
              setIsGameReportOpen={setIsGameReportOpen}
              onOpenMenu={() => setMenuOpen(true)}
              onNewGame={() => void openNewGameWithGuard()}
              onSaveSgf={handleSaveCurrentSgf}
              saveTitle={saveControlLabel}
              onLoadSgf={handleLoadClick}
              onOpenSidePanel={handleOpenSidePanel}
              onCopySgf={handleCopySgf}
              onPasteSgf={handlePasteSgf}
              onScanBoard={() => openPhotoBoard()}
              onSettings={() => setIsSettingsOpen(true)}
              onKeyboardHelp={() => setIsKeyboardHelpOpen(true)}
              winRateLabel={winRateLabel}
              scoreLeadLabel={scoreLeadLabel}
              pointsLostLabel={pointsLostLabel}
              engineMeta={engineMeta}
              engineMetaTitle={engineMetaTitle}
              engineError={engineError}
              isMobile={isMobile}
            />
          )}

          {/* Board */}
          <div className={['flex-1 flex flex-col justify-center ui-bg overflow-hidden relative', isMobile ? 'p-2 sm:p-3 pb-0' : 'p-4 xl:p-6'].join(' ')}>
            {notification && (
              <NotificationToast notification={notification} onClose={clearNotification} />
            )}
            <EditToolbar isMobile={isMobile} />
            <ManualScorePanel
              active={scoringMode}
              disabled={isEditMode || isInsertMode || isSelectingRegionOfInterest}
              score={manualScoreEstimate}
              blackName={blackName}
              whiteName={whiteName}
              capturedBlack={capturedBlack}
              capturedWhite={capturedWhite}
              komi={komi}
              deadStoneCount={manualDeadStones.size}
              onToggle={toggleScoringMode}
              onClear={clearManualDeadStones}
              onDone={() => setScoringMode(false)}
            />
            <div className="flex-1 flex items-center justify-center min-h-0 min-w-0">
              <GoBoard
                hoveredMove={activeHoverMove}
                onHoverMove={setHoveredMove}
                pvUpToMove={pvUpToMove}
                uiMode={boardUiMode}
                forcePvOverlay={!!reportHoverMove}
                scoringMode={scoringMode}
                scoreTerritory={manualScoreEstimate.territory}
                deadStones={manualDeadStones}
                onToggleDeadStone={toggleManualDeadStone}
              />
            </div>
          </div>

          {!isMobile && settings.showBoardControls && bottomBarOpen && (
            <BottomControlBar
              passTurn={passTurn}
              navigateBack={navigateBack}
              navigateForward={navigateForward}
              navigateToMove={navigateToMove}
              navigateStart={navigateStart}
              navigateEnd={navigateEnd}
              findMistake={findMistake}
              rotateBoard={rotateBoard}
              currentPlayer={currentPlayer}
              moveHistory={moveHistory}
              totalMovesInCurrentLine={totalMovesInCurrentLine}
              boardSize={boardSize}
              handicap={handicap}
              isInsertMode={isInsertMode}
              passPolicyColor={passPolicyColor}
              passPv={passPv}
              jumpBack={jumpBack}
              jumpForward={jumpForward}
              isMobile={false}
              onUndo={handleUndo}
              onAiMove={makeAiMove}
              onResign={handleResign}
            />
          )}

          {!isMobile && (
            <div
              className="absolute right-3 z-30"
              style={{ top: topBarOpen ? 'calc(var(--ui-bar-height) + 8px)' : 8 }}
            >
              <PanelEdgeToggle
                side="top"
                state={topBarOpen ? 'open' : 'closed'}
                title={topBarOpen ? 'Hide top bar' : 'Show top bar'}
                onClick={() => setTopBarOpen((prev) => !prev)}
                className="rounded-lg border border-[var(--ui-border)]"
              />
            </div>
          )}
        </div>

        {isDesktop && showSidebar && (
          <div
            className="hidden lg:block w-1 cursor-col-resize bg-[var(--ui-border)] hover:bg-[var(--ui-border-strong)] transition-colors"
            onMouseDown={() => setIsResizingRight(true)}
            onDoubleClick={handleToggleSidebar}
          />
        )}

        <RightPanel
          open={rightPanelOpen}
          onClose={handleCloseRightPanel}
          width={isDesktop ? rightPanelWidth : undefined}
          showOnDesktop={showSidebar}
          mode={mode}
          setMode={setMode}
          modePanels={modePanels}
          analysisControls={modeControls}
          updatePanels={updatePanels}
          updateControls={updateControls}
          rootNode={rootNode}
          treeVersion={treeVersion}
          isGameAnalysisRunning={isGameAnalysisRunning}
          gameAnalysisType={gameAnalysisType}
          gameAnalysisDone={gameAnalysisDone}
          gameAnalysisTotal={gameAnalysisTotal}
          startQuickGameAnalysis={startQuickGameAnalysis}
          startFastGameAnalysis={startFastGameAnalysis}
          stopGameAnalysis={stopGameAnalysis}
          clearAnalysisCache={clearAnalysisCache}
          analysisCacheSize={analysisCacheSize}
          onOpenGameAnalysis={() => setIsGameAnalysisOpen(true)}
          onOpenGameReport={() => setIsGameReportOpen(true)}
          currentPlayer={currentPlayer}
          onUndo={handleUndo}
          onResign={handleResign}
          onAiMove={makeAiMove}
          navigateStart={navigateStart}
          navigateEnd={navigateEnd}
          switchBranch={switchBranch}
          switchToBranchIndex={switchToBranchIndex}
          undoToBranchPoint={undoToBranchPoint}
          undoToMainBranch={undoToMainBranch}
          makeCurrentNodeMainBranch={makeCurrentNodeMainBranch}
          isInsertMode={isInsertMode}
          toast={toast}
          winRate={winRate ?? null}
          scoreLead={scoreLead ?? null}
          pointsLost={pointsLost}
          engineDot={engineDot}
          engineMeta={engineMeta}
          engineMetaTitle={engineMetaTitle}
          engineStatus={engineStatus}
          engineError={engineError}
          engineBackend={engineBackend}
          engineModelLabel={engineModelLabel}
          requestedBackend={settings.katagoBackend}
          modelUrl={settings.katagoModelUrl}
          statusText={statusText}
          lockAiDetails={lockAiDetails}
          currentNode={currentNode}
          moveHistory={moveHistory}
          isMobile={isMobile}
          activeMobileTab={mobileTab}
          showAnalysisSection={!isDesktop}
        />

        {isDesktop && (
          <>
            <div
              className="absolute top-1/2 z-30"
              style={
                libraryOpen
                  ? { left: leftPanelWidth, transform: 'translate(0, -50%)' }
                  : { left: 0, transform: 'translate(0, -50%)' }
              }
            >
              <PanelEdgeToggle
                side="left"
                state={libraryOpen ? 'open' : 'closed'}
                title={libraryOpen ? withLayoutShortcut('Hide panel', 'toggle-library') : withLayoutShortcut('Show library', 'toggle-library')}
                onClick={handleToggleLibrary}
              />
            </div>
            <div
              className="absolute top-1/2 z-30"
              style={
                showSidebar
                  ? { right: rightPanelWidth, transform: 'translate(0, -50%)' }
                  : { right: 0, transform: 'translate(0, -50%)' }
              }
            >
              <PanelEdgeToggle
                side="right"
                state={showSidebar ? 'open' : 'closed'}
                title={showSidebar ? withLayoutShortcut('Hide panel', 'toggle-sidebar') : withLayoutShortcut('Show panel', 'toggle-sidebar')}
                onClick={handleToggleSidebar}
              />
            </div>
          </>
        )}

        {!isMobile && (
          <>
            {settings.showBoardControls && (
              <div
                className="absolute left-1/2 -translate-x-1/2 z-30"
                style={{ bottom: bottomBarOpen ? 'calc(var(--ui-bar-height) + 28px)' : 28 }}
              >
                <PanelEdgeToggle
                  side="bottom"
                  state={bottomBarOpen ? 'open' : 'closed'}
                  title={bottomBarOpen ? 'Hide bottom bar' : 'Show bottom bar'}
                  onClick={() => setBottomBarOpen((prev) => !prev)}
                />
              </div>
            )}
          </>
        )}

        {isMobile && (
          <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col pointer-events-none">
            <div className="pointer-events-auto bg-[var(--ui-bar)]/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.3)] border-t border-[var(--ui-border)] divide-y divide-[var(--ui-border)]">
              {settings.showBoardControls && bottomBarOpen && mobileTab === 'board' && (
                <div className="[&>div]:border-t-0 [&>div]:bg-transparent">
                  <BottomControlBar
                    passTurn={passTurn}
                    navigateBack={navigateBack}
                    navigateForward={navigateForward}
                    navigateToMove={navigateToMove}
                    navigateStart={navigateStart}
                    navigateEnd={navigateEnd}
                    findMistake={findMistake}
                    rotateBoard={rotateBoard}
                    currentPlayer={currentPlayer}
                    moveHistory={moveHistory}
                    totalMovesInCurrentLine={totalMovesInCurrentLine}
                    boardSize={boardSize}
                    handicap={handicap}
                    isInsertMode={isInsertMode}
                    passPolicyColor={passPolicyColor}
                    passPv={passPv}
                    jumpBack={jumpBack}
                    jumpForward={jumpForward}
                    isMobile={true}
                    onUndo={handleUndo}
                    onAiMove={makeAiMove}
                    onResign={handleResign}
                  />
                </div>
              )}
              <MobileTabBar
                activeTab={mobileTab}
                onTabChange={handleMobileTabChange}
                commentBadge={noteCount}
                hasControlBarAbove={settings.showBoardControls && bottomBarOpen && mobileTab === 'board'}
              />
            </div>
          </div>
        )}
      </div>
      <StatusBar
        moveName={moveName}
        blackName={blackName}
        whiteName={whiteName}
        komi={komi}
        boardSize={boardSize}
        handicap={handicap}
        moveCount={moveHistory.length}
        capturedBlack={capturedBlack}
        capturedWhite={capturedWhite}
        endResult={endResult}
        gamepadName={gamepadStatus.connected ? gamepadStatus.name : null}
        onGamepadNavigationDisable={handleDisableGamepadNavigation}
        loadedFileKind={loadedLibraryFileName ? 'library' : loadedExternalFile?.kind}
        loadedFileName={loadedLibraryFileName ?? loadedExternalFile?.name ?? null}
        onLoadedFileRename={loadedLibraryFileName ? renameLoadedLibraryFile : undefined}
        unsavedChanges={currentGameDirty}
        autoSaveStatus={autoSaveStatus}
      />
    </div>
  );
};

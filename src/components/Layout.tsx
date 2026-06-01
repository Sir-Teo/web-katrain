import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { AnalysisPanel } from './AnalysisPanel';
import { AnalysisCommandBar } from './AnalysisCommandBar';
import { EditToolbar } from './EditToolbar';
import { ManualScorePanel } from './ManualScorePanel';
import type { GameInfoValues, AiConfigValues, TimerConfigValues } from './NewGameModal';
import { downloadSgfFromTree, formatSgfDate, generateSgfFromTree, getSgfDownloadFilenameFromProperties, parseSgf, type KaTrainSgfExportOptions } from '../utils/sgf';
import { AUTO_SAVE_MAX_LABEL, clearAutoSavedGame, readAutoSavedGame, writeAutoSavedGame, type AutoSavedGame } from '../utils/autoSave';
import {
  createLibraryItem,
  getLibraryFolderOptions,
  loadLibrary,
  saveLibrary,
  suggestLibraryItemNameFromSgf,
  updateLibraryFileSgf,
  updateLibraryItem,
  type LibraryFile,
  type LibraryFolderOption,
} from '../utils/library';
import { isOgsUrl, loadSgfOrOgs } from '../utils/ogs';
import type { CandidateMove, EditTool, GameNode, Player } from '../types';
import { DEFAULT_BOARD_SIZE } from '../types';
import { parseGtpMove } from '../lib/gtp';
import { computeJapaneseManualScoreFromOwnership, formatResultScoreLead, roundToHalf } from '../utils/manualScore';
import { computeManualScoreEstimate, estimateDeadStonesByPlayout, estimateDeadStonesFromOwnership, toggleDeadStoneChain } from '../utils/scoring';
import { summarizePointsLost } from '../utils/analysisSummary';
import { getKaTrainEvalColors } from '../utils/katrainTheme';
import { getEngineModelLabel } from '../utils/engineLabel';
import { getEngineStatusSummary } from '../utils/engineStatusSummary';
import { normalizeBoardSize } from '../utils/boardSize';
import { PHOTO_BOARD_IMAGE_EXTENSIONS, isPhotoBoardImageFile } from '../utils/photoBoard';
import { isEditableKeyboardTarget } from '../utils/keyboardTarget';
import { getMoveInsight } from '../utils/moveInsight';
import {
  createUploadedModelUrl,
  isKataGoModelWeightsFile,
  MODEL_UPLOAD_ACCEPT,
  restorePersistedUploadedModelUrl,
  savePersistedUploadedModel,
  validateModelUploadFile,
} from '../utils/modelUpload';
import { cancelAnimationFrameSafe, getAnimationNow, requestAnimationFrameSafe, type AnimationFrameHandle } from '../utils/animationFrame';

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
import { AboutDialog } from './AboutDialog';
import type { CommandPaletteCommand } from './CommandPaletteModal';
import type { PasteSgfSubmitResult } from '../utils/pasteSgfInput';
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
import { ResignConfirmModal } from './ResignConfirmModal';
import { getResignResult } from '../utils/resign';
import { DESKTOP_LAYOUT_MEDIA, isDesktopLayoutSize, isDesktopLayoutViewport, isMobileLayoutViewport } from '../utils/responsiveLayout';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';
import { getMediaQueryList, subscribeMediaQueryList } from '../utils/mediaQuery';
import { copyTextToClipboard, readClipboardText } from '../utils/clipboard';
import { FIRST_RUN_LIBRARY_MIN_WIDTH, getInitialLibraryOpen, LIBRARY_OPEN_STORAGE_KEY } from '../utils/layoutPreferences';
import { saveSettingsActiveTab } from '../utils/settingsTabs';
import { nextPolicyHeatmapMetric } from '../utils/topMoveMetric';
import { EDIT_TOOL_SHORTCUT_DEFINITIONS } from '../utils/shortcuts';
import { dispatchMoveTreeCommand, type MoveTreeCommand } from '../utils/moveTreeCommands';
import { ANALYSIS_VISIT_PRESETS, formatVisitCount, visitPresetDescription, visitPresetLabel } from '../utils/visitPresets';

const SettingsModal = lazy(() => import('./SettingsModal').then((module) => ({ default: module.SettingsModal })));
const GameAnalysisModal = lazy(() => import('./GameAnalysisModal').then((module) => ({ default: module.GameAnalysisModal })));
const GameReportModal = lazy(() => import('./GameReportModal').then((module) => ({ default: module.GameReportModal })));
const CommandPaletteModal = lazy(() => import('./CommandPaletteModal').then((module) => ({ default: module.CommandPaletteModal })));
const KeyboardHelpModal = lazy(() => import('./KeyboardHelpModal').then((module) => ({ default: module.KeyboardHelpModal })));
const NewGameModal = lazy(() => import('./NewGameModal').then((module) => ({ default: module.NewGameModal })));
const PhotoBoardModal = lazy(() => import('./PhotoBoardModal').then((module) => ({ default: module.PhotoBoardModal })));
const PasteSgfModal = lazy(() => import('./PasteSgfModal').then((module) => ({ default: module.PasteSgfModal })));
const SaveToLibraryDialog = lazy(() => import('./SaveToLibraryDialog').then((module) => ({ default: module.SaveToLibraryDialog })));

const MOBILE_HOME_DISMISSED_KEY = 'web-katrain:mobile_home_dismissed:v1';
const mainFileInputAccept = ['.sgf', ...PHOTO_BOARD_IMAGE_EXTENSIONS, 'image/*', MODEL_UPLOAD_ACCEPT].join(',');
const LAYOUT_SHORTCUT_IDS = [
  'toggle-library',
  'toggle-sidebar',
  'toggle-scoring',
  'toggle-top-bar',
  'toggle-bottom-bar',
] as const;
type LoadedExternalFile = { name: string; kind: 'file' | 'ogs' | 'pasted' };
type SaveToLibraryDialogState = {
  sgf: string;
  initialName: string;
  initialFolderId: string | null;
  folderOptions: LibraryFolderOption[];
};

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
    toggleEditMode,
    setEditTool,
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
      toggleEditMode: state.toggleEditMode,
      setEditTool: state.setEditTool,
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
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isGameAnalysisOpen, setIsGameAnalysisOpen] = useState(false);
  const [isGameReportOpen, setIsGameReportOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState(false);
  const [noteFocusRequest, setNoteFocusRequest] = useState(0);
  const [isNewGameOpen, setIsNewGameOpen] = useState(false);
  const [isPhotoBoardOpen, setIsPhotoBoardOpen] = useState(false);
  const [photoBoardInitialFile, setPhotoBoardInitialFile] = useState<File | null>(null);
  const [isPasteSgfOpen, setIsPasteSgfOpen] = useState(false);
  const [saveToLibraryDialog, setSaveToLibraryDialog] = useState<SaveToLibraryDialogState | null>(null);
  const [isUnsavedChangesOpen, setIsUnsavedChangesOpen] = useState(false);
  const [pendingResignPlayer, setPendingResignPlayer] = useState<Player | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');
  const [lastRightTab, setLastRightTab] = useState<MobileTab>('tree');
  const [uiState, setUiState] = useState<UiState>(() => loadUiState());
  const [libraryOpen, setLibraryOpen] = useState(getInitialLibraryOpen);
  const [showSidebar, setShowSidebar] = useState(() => {
    return readLocalStorage('web-katrain:sidebar_open:v1') !== 'false';
  });
  const [topBarOpen, setTopBarOpen] = useState(() => {
    return readLocalStorage('web-katrain:top_bar_open:v1') !== 'false';
  });
  const [bottomBarOpen, setBottomBarOpen] = useState(() => {
    return readLocalStorage('web-katrain:bottom_bar_open:v1') !== 'false';
  });
  const layoutShortcutLabels = useShortcutLabels(LAYOUT_SHORTCUT_IDS);
  const withLayoutShortcut = (label: string, id: LayoutShortcutId) => `${label} (${layoutShortcutLabels[id]})`;
  const [mobileHomeOpen, setMobileHomeOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isMobileLayoutViewport() && readLocalStorage(MOBILE_HOME_DISMISSED_KEY) !== 'true';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.uiTheme = settings.uiTheme;
    document.documentElement.dataset.uiDensity = settings.uiDensity;
  }, [settings.uiDensity, settings.uiTheme]);
  const [isDesktop, setIsDesktop] = useState(() => {
    return isDesktopLayoutViewport();
  });
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const raw = readLocalStorage('web-katrain:left_panel_width:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 300;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const raw = readLocalStorage('web-katrain:right_panel_width:v1');
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
  const [externalLibraryItemCreate, setExternalLibraryItemCreate] = useState<{
    item: LibraryFile;
    updatedAt: number;
  } | null>(null);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [scoringMode, setScoringMode] = useState(false);
  const [manualDeadStones, setManualDeadStones] = useState<Set<string>>(() => new Set());
  const [manualScoreMode, setManualScoreMode] = useState<'manual' | 'estimate'>('manual');
  const fileDragCounter = useRef(0);
  const fileDragResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanGameSgfRef = useRef<string | null>(null);
  const unsavedChangesResolveRef = useRef<((choice: UnsavedChangesChoice) => void) | null>(null);
  const autoSaveRecoveryCheckedRef = useRef(false);
  const autoSaveTooLargeToastShownRef = useRef(false);
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
  const shapeCoachEnabled = uiState.shapeCoachEnabled;
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

  const endResult = (() => {
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
  })();

  useEffect(() => {
    setManualDeadStones(new Set());
    setManualScoreMode('manual');
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
  const manualScoreOwnership = useMemo(() => {
    if (!currentNode.analysis || (currentNode.analysis.ownershipMode ?? 'root') === 'none') return null;
    const ownership = currentNode.analysis.territory;
    if (ownership.length !== board.length) return null;
    const width = board[0]?.length ?? 0;
    if (!ownership.every((row) => row.length === width)) return null;
    return ownership;
  }, [board, currentNode.analysis]);
  const canEstimateFromBoardShape = useMemo(
    () => board.some((row) => row.some((stone) => stone !== null)),
    [board]
  );
  const scoreEstimateSource = manualScoreOwnership
    ? 'ownership'
    : canEstimateFromBoardShape
      ? 'playout'
      : null;

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
    const notification = { message, type };
    useGameStore.setState({ notification });
    window.setTimeout(() => {
      useGameStore.setState((state) => (state.notification === notification ? { notification: null } : {}));
    }, 2500);
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
    setManualScoreMode('manual');
  }, []);

  const autoEstimateDeadStones = useCallback(() => {
    if (!manualScoreOwnership && !canEstimateFromBoardShape) {
      toast('Score a position with stones before auto-estimating dead stones.', 'info');
      return;
    }

    const nextDeadStones = manualScoreOwnership
      ? estimateDeadStonesFromOwnership(board, manualScoreOwnership)
      : estimateDeadStonesByPlayout(board, { currentPlayer });
    setManualDeadStones(nextDeadStones);
    setManualScoreMode('estimate');
    const sourceLabel = manualScoreOwnership ? 'ownership' : 'local playouts';
    toast(
      nextDeadStones.size > 0
        ? `Auto-marked ${nextDeadStones.size} dead ${nextDeadStones.size === 1 ? 'stone' : 'stones'} from ${sourceLabel}.`
        : `No dead stones found from ${sourceLabel}.`,
      'info'
    );
  }, [board, canEstimateFromBoardShape, currentPlayer, manualScoreOwnership, toast]);

  const toggleManualDeadStone = useCallback((x: number, y: number) => {
    setManualScoreMode('manual');
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
      autoSaveTooLargeToastShownRef.current = false;
      return;
    }
    setAutoSaveStatus((current) => (current?.state === 'pending' ? current : { state: 'pending' }));
    const timeout = window.setTimeout(() => {
      const savedAt = Date.now();
      const result = writeAutoSavedGame(generateCurrentSgf(), undefined, savedAt);
      if (result === 'saved') {
        autoSaveTooLargeToastShownRef.current = false;
        setAutoSaveStatus({ state: 'saved', savedAt });
      } else if (result === 'too-large') {
        setAutoSaveStatus({ state: 'too-large' });
        if (!autoSaveTooLargeToastShownRef.current) {
          autoSaveTooLargeToastShownRef.current = true;
          toast(`Game is too large for recovery auto-save (${AUTO_SAVE_MAX_LABEL}). Save to Library or download SGF to keep changes.`, 'info');
        }
      } else {
        setAutoSaveStatus({ state: 'failed' });
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [autoSaveRecovery, autoSaveRecoveryChecked, generateCurrentSgf, hasUnsavedChanges, toast, treeVersion]);

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
    try {
      const saved = downloadSgfFromTree(useGameStore.getState().rootNode, sgfExportOptions);
      markCurrentGameCleanAndClearAutoSave(saved);
      toast('Downloaded SGF.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to download SGF.', 'error');
    }
  }, [generateCurrentSgf, markCurrentGameCleanAndClearAutoSave, saveLoadedLibraryFile, sgfExportOptions, toast]);

  const openSaveToLibraryDialog = useCallback(async () => {
    const sgf = generateCurrentSgf();
    try {
      const items = await loadLibrary();
      const currentLibraryItem = loadedLibraryFileId
        ? items.find((item) => item.id === loadedLibraryFileId)
        : null;
      const fileCount = items.filter((item): item is LibraryFile => item.type === 'file').length;
      const fallbackName = loadedLibraryFileName ?? loadedExternalFile?.name ?? `Game ${fileCount + 1}`;
      setSaveToLibraryDialog({
        sgf,
        initialName: suggestLibraryItemNameFromSgf(sgf, fallbackName),
        initialFolderId: currentLibraryItem?.type === 'file' ? currentLibraryItem.parentId ?? null : null,
        folderOptions: getLibraryFolderOptions(items),
      });
    } catch {
      toast('Failed to open Library save dialog.', 'error');
    }
  }, [generateCurrentSgf, loadedExternalFile?.name, loadedLibraryFileId, loadedLibraryFileName, toast]);

  const handleOpenSaveToLibraryDialog = useCallback(() => {
    void openSaveToLibraryDialog();
  }, [openSaveToLibraryDialog]);

  const handleSaveCopyToLibrary = useCallback(async (name: string, folderId: string | null): Promise<boolean> => {
    const sgf = saveToLibraryDialog?.sgf ?? generateCurrentSgf();
    const itemName = name.trim().replace(/\.sgf$/i, '').trim() || 'Untitled';
    try {
      const items = await loadLibrary();
      const targetFolderId =
        folderId && items.some((item) => item.type === 'folder' && item.id === folderId) ? folderId : null;
      const updatedAt = Date.now();
      const newItem = createLibraryItem(itemName, sgf, targetFolderId, updatedAt);
      await saveLibrary([newItem, ...items]);
      setLoadedLibraryFile(newItem.id, newItem.name);
      setExternalLibraryItemCreate({ item: newItem, updatedAt });
      setLibraryVersion((prev) => prev + 1);
      markCurrentGameCleanAndClearAutoSave(sgf);
      toast(`Saved "${newItem.name}" to Library.`, 'success');
      setSaveToLibraryDialog(null);
      return true;
    } catch {
      toast('Failed to save game to Library.', 'error');
      return false;
    }
  }, [generateCurrentSgf, markCurrentGameCleanAndClearAutoSave, saveToLibraryDialog?.sgf, setLoadedLibraryFile, toast]);

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
    writeLocalStorage(LIBRARY_OPEN_STORAGE_KEY, String(libraryOpen));
  }, [libraryOpen]);

  useEffect(() => {
    writeLocalStorage('web-katrain:sidebar_open:v1', String(showSidebar));
  }, [showSidebar]);

  useEffect(() => {
    writeLocalStorage('web-katrain:top_bar_open:v1', String(topBarOpen));
  }, [topBarOpen]);

  useEffect(() => {
    writeLocalStorage('web-katrain:bottom_bar_open:v1', String(bottomBarOpen));
  }, [bottomBarOpen]);

  useEffect(() => {
    writeLocalStorage('web-katrain:left_panel_width:v1', String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    writeLocalStorage('web-katrain:right_panel_width:v1', String(rightPanelWidth));
  }, [rightPanelWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = getMediaQueryList(DESKTOP_LAYOUT_MEDIA);
    const update = () => setIsDesktop(
      mq?.matches ?? isDesktopLayoutSize(window.innerWidth, window.innerHeight)
    );
    update();
    if (mq) return subscribeMediaQueryList(mq, update);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isDesktop || viewportWidth >= FIRST_RUN_LIBRARY_MIN_WIDTH) return;
    if (libraryOpen && showSidebar) setShowSidebar(false);
  }, [isDesktop, libraryOpen, showSidebar, viewportWidth]);

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
    const now = getAnimationNow();
    setPvAnim((prev) => (prev?.key === pvKey ? prev : { key: pvKey, startMs: now }));
    setPvAnimNowMs(now);
  }, [pvKey, pvAnimTimeS]);

  const pvLen = activeHoverMove?.pv?.length ?? 0;
  useEffect(() => {
    if (!pvAnim) return;
    if (!pvKey || pvKey !== pvAnim.key) return;
    if (pvLen <= 0) return;

    const delayMs = Math.max(pvAnimTimeS, 0.1) * 1000;
    let frame: AnimationFrameHandle | null = null;
    const tick = () => {
      const now = getAnimationNow();
      setPvAnimNowMs(now);
      const upToMove = Math.min(pvLen, (now - pvAnim.startMs) / delayMs);
      if (upToMove < pvLen) frame = requestAnimationFrameSafe(tick);
    };
    frame = requestAnimationFrameSafe(tick);
    return () => cancelAnimationFrameSafe(frame);
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
  const engineModelLabel = useMemo(
    () => getEngineModelLabel(engineModelName, settings.katagoModelUrl),
    [engineModelName, settings.katagoModelUrl]
  );

  const engineSummary = useMemo(() => getEngineStatusSummary({
    status: engineStatus,
    error: engineError,
    requestedBackend: settings.katagoBackend,
    activeBackend: engineBackend,
    modelLabel: engineModelLabel,
    modelUrl: settings.katagoModelUrl,
  }), [engineBackend, engineError, engineModelLabel, engineStatus, settings.katagoBackend, settings.katagoModelUrl]);
  const engineDot = engineSummary.dotClass;
  const engineMeta = engineSummary.compactLabel;
  const engineMetaTitle = engineSummary.title;

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
  const showAnalysisCommandBar =
    mode === 'analyze' ||
    isAnalysisMode ||
    isGameAnalysisRunning ||
    typeof winRate === 'number' ||
    typeof scoreLead === 'number';
  const totalMovesInCurrentLine = useMemo(() => {
    void treeVersion;
    return getCurrentLineMoveCount(currentNode, activeBranchChildIds);
  }, [activeBranchChildIds, currentNode, treeVersion]);
  const passPolicyColor = useMemo(() => {
    if (!settings.analysisShowPolicy) return null;
    const policy = (analysisData ?? currentNode.analysis)?.policy;
    if (!policy) return null;
    const passPolicy = policy[boardSize * boardSize];
    if (!Number.isFinite(passPolicy)) return null;
    const polOrder = 5 - Math.trunc(-Math.log10(Math.max(1e-9, passPolicy - 1e-9)));
    if (polOrder < 0) return null;
    const col = evalColors[Math.min(evalColors.length - 1, Math.max(0, polOrder))]!;
    return rgba(col, GHOST_ALPHA);
  }, [analysisData, boardSize, currentNode.analysis, evalColors, settings.analysisShowPolicy]);

  const winRateLabel = typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : null;
  const scoreLeadLabel = typeof scoreLead === 'number' ? formatResultScoreLead(scoreLead) : null;
  const pointsLostLabel = typeof pointsLost === 'number' ? summarizePointsLost(pointsLost).label : null;

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

  const toggleShapeCoach = () => {
    setUiState((prev) => ({ ...prev, shapeCoachEnabled: !prev.shapeCoachEnabled }));
  };

  const isMobile = !isDesktop;

  useEffect(() => {
    if (!isDesktop) return;
    setMobileHomeOpen(false);
  }, [isDesktop]);

  const closeMobileHome = () => {
    writeLocalStorage(MOBILE_HOME_DISMISSED_KEY, 'true');
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

  const handleToggleTopBar = () => {
    setTopBarOpen((prev) => !prev);
  };

  const handleToggleBottomBar = () => {
    setBottomBarOpen((prev) => !prev);
  };

  const handleOpenSidePanel = () => {
    if (isMobile) {
      handleMobileTabChange(lastRightTab);
      return;
    }
    setRightPanelOpen(true);
  };

  const openCurrentNoteEditor = () => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    setMenuOpen(false);
    if (isMobile) {
      openRightPanelForTab('info');
    } else {
      setShowSidebar(true);
      setRightPanelOpen(true);
    }
    updatePanels((current) => ({ notesOpen: true, notes: { ...current.notes, notes: true } }));
    setNoteFocusRequest((request) => request + 1);
  };

  const selectEditTool = (tool: EditTool) => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    setMenuOpen(false);
    if (!isEditMode) toggleEditMode();
    setEditTool(tool);
  };

  const runMoveTreeCommand = (command: MoveTreeCommand) => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    setMenuOpen(false);
    if (isMobile) {
      openRightPanelForTab('tree');
    } else {
      setShowSidebar(true);
      setRightPanelOpen(true);
      updatePanels({ treeOpen: true });
    }
    window.setTimeout(() => dispatchMoveTreeCommand(command), 0);
  };

  const handleCloseRightPanel = () => {
    if (isMobile) {
      setRightPanelOpen(false);
      setMobileTab('board');
    } else {
      setShowSidebar(false);
    }
  };

  const openShortcutSettings = useCallback(() => {
    setAnalysisMenuOpen(false);
    setViewMenuOpen(false);
    setMenuOpen(false);
    setIsKeyboardHelpOpen(false);
    saveSettingsActiveTab('shortcuts');
    setIsSettingsOpen(true);
  }, []);

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
    try {
      updateSettings({ katagoModelUrl: createUploadedModelUrl(file, settings.katagoModelUrl) });
    } catch (uploadError) {
      toast(uploadError instanceof Error ? uploadError.message : 'Could not load this model file.', 'error');
      return false;
    }
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

  const startQuickNewGame = useCallback(async () => {
    setMenuOpen(false);
    setMobileHomeOpen(false);
    setIsNewGameOpen(false);
    if (!(await prepareForGameReplacement())) return;
    startNewGame({
      komi,
      rules: settings.gameRules,
      boardSize: settings.defaultBoardSize,
      handicap: settings.defaultHandicap,
    });
    setLoadedLibraryFile(null);
    setScoringMode(false);
    setManualDeadStones(new Set());
    markCurrentGameCleanAndClearAutoSave();
    toast(`Started ${settings.defaultBoardSize}x${settings.defaultBoardSize} game.`, 'success');
  }, [
    komi,
    markCurrentGameCleanAndClearAutoSave,
    prepareForGameReplacement,
    settings.defaultBoardSize,
    settings.defaultHandicap,
    settings.gameRules,
    startNewGame,
    setLoadedLibraryFile,
    toast,
  ]);

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
    if (await copyTextToClipboard(sgf)) {
      toast('Copied SGF to clipboard.', 'success');
      return;
    }

    toast('Copy failed (clipboard unavailable).', 'error');
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

  const handleOpenSgfFromText = async (text: string): Promise<PasteSgfSubmitResult> => {
    try {
      const result = await loadSgfOrOgs(text);
      if (!result.sgf.trim()) return 'failed';
      const parsed = parseSgf(result.sgf);
      if (!(await prepareForGameReplacement())) return 'cancelled';
      loadGame(parsed);
      setLoadedLibraryFile(null);
      setLoadedExternalFile(
        result.source === 'ogs'
          ? { kind: 'ogs', name: `ogs-${result.gameId ?? 'game'}.sgf` }
          : { kind: 'pasted', name: getImportedSgfName(parsed, 'Pasted SGF') }
      );
      markCurrentGameCleanAndClearAutoSave();
      toast(result.source === 'ogs' ? `Downloaded OGS game ${result.gameId ?? ''}.` : 'Loaded SGF.', 'success');
      return 'loaded';
    } catch {
      toast('Failed to load SGF or OGS URL.', 'error');
      return 'failed';
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

    const clipboardText = await readClipboardText();
    const trimmed = clipboardText?.trim() ?? '';
    if (trimmed && (trimmed.startsWith('(') || isOgsUrl(trimmed))) {
      await handleOpenSgfFromText(trimmed);
      return;
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

  const resetFileDragState = useCallback(() => {
    fileDragCounter.current = 0;
    if (fileDragResetTimer.current) {
      clearTimeout(fileDragResetTimer.current);
      fileDragResetTimer.current = null;
    }
    setIsFileDragActive(false);
  }, []);

  const handleAppDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event) || isDragOverLibrary(event.target)) return;
    event.preventDefault();
    if (fileDragResetTimer.current) {
      clearTimeout(fileDragResetTimer.current);
      fileDragResetTimer.current = null;
    }
    fileDragCounter.current += 1;
    setIsFileDragActive(true);
  };

  const handleAppDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDragOverLibrary(event.target)) return;
    fileDragCounter.current = Math.max(0, fileDragCounter.current - 1);
    if (fileDragCounter.current === 0) {
      resetFileDragState();
    }
  };

  const handleAppDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(event) || isDragOverLibrary(event.target)) return;
    event.preventDefault();
    if (fileDragResetTimer.current) {
      clearTimeout(fileDragResetTimer.current);
    }
    fileDragResetTimer.current = setTimeout(() => {
      resetFileDragState();
    }, 350);
  };

  const handleAppDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      resetFileDragState();
      return;
    }
    if (!isFileDragEvent(event) || isDragOverLibrary(event.target)) {
      resetFileDragState();
      return;
    }
    event.preventDefault();
    resetFileDragState();
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

  useEffect(() => () => {
    if (fileDragResetTimer.current) {
      clearTimeout(fileDragResetTimer.current);
    }
  }, []);

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

  const saveControlLabel = loadedLibraryFileId ? 'Save to Library' : 'Save SGF';

  // Keyboard shortcuts
  useKeyboardShortcuts({
    mode,
    sgfExportOptions,
    saveSgf: handleSaveCurrentSgf,
    saveCopyToLibrary: handleOpenSaveToLibraryDialog,
    openSgf: handleLoadClick,
    setIsSettingsOpen,
    setIsGameAnalysisOpen,
    setIsGameReportOpen,
    setAnalysisMenuOpen,
    setViewMenuOpen,
    setMenuOpen,
    setIsCommandPaletteOpen,
    setIsKeyboardHelpOpen,
    openPasteSgf: handlePasteSgfShortcut,
    openNewGame: () => void openNewGameWithGuard(),
    toggleLibrary: handleToggleLibrary,
    closeLibrary: handleCloseLibrary,
    toggleSidebar: handleToggleSidebar,
    toggleScoringMode,
    editCurrentNote: openCurrentNoteEditor,
    runMoveTreeCommand,
    toggleTopBar: handleToggleTopBar,
    toggleBottomBar: handleToggleBottomBar,
    toast,
  });

  const commandPaletteCommands: CommandPaletteCommand[] = (() => {
    const closeFloatingMenus = () => {
      setAnalysisMenuOpen(false);
      setViewMenuOpen(false);
      setMenuOpen(false);
    };
    const openSimpleModal = (open: () => void) => {
      closeFloatingMenus();
      open();
    };
    const openSettingsTab = (tab: 'general' | 'analysis' | 'ai' | 'shortcuts') => {
      saveSettingsActiveTab(tab);
      openSimpleModal(() => setIsSettingsOpen(true));
    };
    const setLiveAnalysisDepth = (visits: number) => {
      if (isGameAnalysisRunning) {
        toast('Stop game review before changing live MCTS depth.', 'error');
        return;
      }
      updateSettings({ katagoVisits: visits });
      if (isAnalysisMode) {
        window.setTimeout(() => {
          void useGameStore.getState().runAnalysis({ force: true, visits });
        }, 0);
      }
      toast(`Live MCTS depth: ${formatVisitCount(visits)} visits (${visitPresetLabel(visits)}).`, 'info');
    };
    const toggleTopMoveHints = () => {
      if (settings.analysisShowPolicy) {
        toast('Policy overlay is showing; top move hints are hidden.', 'info');
        return;
      }
      updateControls({ analysisShowHints: !settings.analysisShowHints });
    };
    const guardNavigation = (action: () => void) => {
      if (isInsertMode) {
        toast('Finish inserting before navigating.', 'error');
        return;
      }
      action();
    };
    const openScoring = () => {
      if (isEditMode || isInsertMode || isSelectingRegionOfInterest) {
        toast('Finish editing before scoring.', 'error');
        return false;
      }
      setScoringMode(true);
      return true;
    };

    return [
      {
        id: 'quick-new-game',
        label: 'Quick new game',
        category: 'Game',
        run: () => { void startQuickNewGame(); },
        keywords: ['restart', 'fresh board'],
      },
      {
        id: 'new-game',
        label: 'New game setup',
        category: 'Game',
        shortcutId: 'new-game',
        run: () => { void openNewGameWithGuard(); },
        keywords: ['board size', 'handicap', 'players'],
      },
      {
        id: 'save-sgf',
        label: saveControlLabel,
        category: 'File',
        shortcutId: 'save-sgf',
        run: () => { void handleSaveCurrentSgf(); },
        keywords: ['download', 'export'],
      },
      {
        id: 'save-library',
        label: 'Save copy to library',
        category: 'File',
        shortcutId: 'save-library',
        run: handleOpenSaveToLibraryDialog,
        keywords: ['archive', 'collection'],
      },
      {
        id: 'load-sgf',
        label: 'Load SGF / photo / model',
        category: 'File',
        shortcutId: 'open-sgf',
        run: handleLoadClick,
        keywords: ['open', 'import', 'weights'],
      },
      {
        id: 'photo-board',
        label: 'Open photo board',
        category: 'File',
        run: () => openPhotoBoard(),
        keywords: ['scan', 'camera', 'image'],
      },
      {
        id: 'paste-sgf',
        label: 'Paste SGF or OGS URL',
        category: 'File',
        shortcutId: 'paste-sgf',
        run: () => { void handlePasteSgfShortcut(); },
        keywords: ['clipboard', 'load', 'read clipboard'],
      },
      {
        id: 'copy-sgf',
        label: 'Copy SGF',
        category: 'File',
        shortcutId: 'copy-sgf',
        run: () => { void handleCopySgf(); },
        keywords: ['clipboard'],
      },
      {
        id: 'nav-back',
        label: 'Previous move',
        category: 'Navigation',
        shortcutId: 'nav-back',
        run: () => { if (mode === 'play') handleUndo(); else navigateBack(); },
        keywords: ['back', 'undo move'],
      },
      {
        id: 'nav-forward',
        label: 'Next move',
        category: 'Navigation',
        shortcutId: 'nav-forward',
        run: () => guardNavigation(navigateForward),
        keywords: ['forward', 'redo move'],
      },
      {
        id: 'nav-back-10',
        label: 'Back 10 moves',
        category: 'Navigation',
        shortcutId: 'nav-back-10',
        run: () => { for (let i = 0; i < 10; i++) navigateBack(); },
        keywords: ['rewind'],
      },
      {
        id: 'nav-forward-10',
        label: 'Forward 10 moves',
        category: 'Navigation',
        shortcutId: 'nav-forward-10',
        run: () => guardNavigation(() => { for (let i = 0; i < 10; i++) navigateForward(); }),
        keywords: ['advance'],
      },
      {
        id: 'nav-start',
        label: 'Go to start',
        category: 'Navigation',
        shortcutId: 'nav-start',
        run: () => guardNavigation(navigateStart),
        keywords: ['root', 'beginning'],
      },
      {
        id: 'nav-end',
        label: 'Go to end',
        category: 'Navigation',
        shortcutId: 'nav-end',
        run: () => guardNavigation(navigateEnd),
        keywords: ['last move'],
      },
      {
        id: 'branch-prev',
        label: 'Previous branch',
        category: 'Navigation',
        shortcutId: 'branch-prev',
        run: () => guardNavigation(() => switchBranch(-1)),
        keywords: ['variation'],
      },
      {
        id: 'branch-next',
        label: 'Next branch',
        category: 'Navigation',
        shortcutId: 'branch-next',
        run: () => guardNavigation(() => switchBranch(1)),
        keywords: ['variation'],
      },
      {
        id: 'undo-branch-point',
        label: 'Undo to branch point',
        category: 'Navigation',
        shortcutId: 'undo-branch-point',
        run: () => guardNavigation(undoToBranchPoint),
        keywords: ['variation', 'fork'],
      },
      {
        id: 'undo-main-branch',
        label: 'Undo to main branch',
        category: 'Navigation',
        shortcutId: 'undo-main-branch',
        run: () => guardNavigation(undoToMainBranch),
        keywords: ['variation', 'main line'],
      },
      {
        id: 'make-main-branch',
        label: 'Make current branch main',
        category: 'Navigation',
        shortcutId: 'make-main-branch',
        run: () => guardNavigation(makeCurrentNodeMainBranch),
        keywords: ['variation', 'main line'],
      },
      {
        id: 'prev-mistake',
        label: 'Previous mistake',
        category: 'Navigation',
        shortcutId: 'prev-mistake',
        run: () => guardNavigation(() => findMistake('undo')),
        keywords: ['review', 'blunder'],
      },
      {
        id: 'next-mistake',
        label: 'Next mistake',
        category: 'Navigation',
        shortcutId: 'next-mistake',
        run: () => guardNavigation(() => findMistake('redo')),
        keywords: ['review', 'blunder'],
      },
      {
        id: 'toggle-library',
        label: libraryOpen ? 'Hide library' : 'Show library',
        category: 'View',
        shortcutId: 'toggle-library',
        run: handleToggleLibrary,
        keywords: ['games', 'collection'],
      },
      {
        id: 'toggle-sidebar',
        label: showSidebar ? 'Hide side panel' : 'Show side panel',
        category: 'View',
        shortcutId: 'toggle-sidebar',
        run: handleToggleSidebar,
        keywords: ['layout', 'panels'],
      },
      {
        id: 'center-move-tree',
        label: 'Center current move in tree',
        category: 'View',
        shortcutId: 'center-move-tree',
        run: () => runMoveTreeCommand('center-current'),
        keywords: ['game tree', 'locate', 'review'],
      },
      {
        id: 'toggle-move-tree-layout',
        label: 'Switch move tree layout',
        category: 'View',
        shortcutId: 'toggle-move-tree-layout',
        run: () => runMoveTreeCommand('toggle-layout'),
        keywords: ['game tree', 'horizontal', 'vertical'],
      },
      {
        id: 'toggle-move-tree-map',
        label: 'Toggle move tree map',
        category: 'View',
        shortcutId: 'toggle-move-tree-map',
        run: () => runMoveTreeCommand('toggle-minimap'),
        keywords: ['game tree', 'minimap', 'overview'],
      },
      {
        id: 'toggle-top-bar',
        label: topBarOpen ? 'Hide top bar' : 'Show top bar',
        category: 'View',
        shortcutId: 'toggle-top-bar',
        run: handleToggleTopBar,
        keywords: ['layout', 'header', 'chrome', 'focus'],
      },
      {
        id: 'toggle-bottom-bar',
        label: bottomBarOpen ? 'Hide bottom controls' : 'Show bottom controls',
        category: 'View',
        shortcutId: 'toggle-bottom-bar',
        run: handleToggleBottomBar,
        keywords: ['layout', 'navigation', 'chrome', 'focus'],
      },
      {
        id: 'toggle-sound',
        label: settings.soundEnabled ? 'Mute sound' : 'Enable sound',
        category: 'View',
        shortcutId: 'toggle-sound',
        run: () => updateSettings({ soundEnabled: !settings.soundEnabled }),
        keywords: ['audio', 'mute', 'volume'],
      },
      {
        id: 'toggle-coordinates',
        label: settings.showCoordinates ? 'Hide coordinates' : 'Show coordinates',
        category: 'View',
        shortcutId: 'toggle-coordinates',
        run: () => updateSettings({ showCoordinates: !settings.showCoordinates }),
        keywords: ['board labels', 'grid'],
      },
      {
        id: 'toggle-move-numbers',
        label: settings.showMoveNumbers ? 'Hide move numbers' : 'Show move numbers',
        category: 'View',
        shortcutId: 'toggle-move-numbers',
        run: () => updateSettings({ showMoveNumbers: !settings.showMoveNumbers }),
        keywords: ['stones', 'sequence'],
      },
      {
        id: 'toggle-next-move-preview',
        label: settings.showNextMovePreview ? 'Hide next move preview' : 'Show next move preview',
        category: 'View',
        shortcutId: 'toggle-next-move-preview',
        run: () => updateSettings({ showNextMovePreview: !settings.showNextMovePreview }),
        keywords: ['ghost stone', 'preview'],
      },
      {
        id: 'toggle-analysis',
        label: isAnalysisMode ? 'Turn analysis off' : 'Turn analysis on',
        category: 'Analysis',
        shortcutId: 'toggle-analysis',
        run: toggleAnalysisMode,
        keywords: ['engine', 'ai'],
      },
      {
        id: 'toggle-children',
        label: settings.analysisShowChildren ? 'Hide children overlay' : 'Show children overlay',
        category: 'Analysis',
        shortcutId: 'toggle-children',
        run: () => updateControls({ analysisShowChildren: !settings.analysisShowChildren }),
        keywords: ['legal moves', 'variations'],
      },
      {
        id: 'toggle-eval',
        label: settings.analysisShowEval ? 'Hide evaluation dots' : 'Show evaluation dots',
        category: 'Analysis',
        shortcutId: 'toggle-eval',
        run: () => updateControls({ analysisShowEval: !settings.analysisShowEval }),
        keywords: ['dots', 'mistakes'],
      },
      {
        id: 'toggle-hints',
        label: settings.analysisShowHints && !settings.analysisShowPolicy ? 'Hide top move hints' : 'Show top move hints',
        category: 'Analysis',
        shortcutId: 'toggle-hints',
        run: toggleTopMoveHints,
        keywords: ['best moves', 'suggestions'],
      },
      {
        id: 'toggle-policy',
        label: settings.analysisShowPolicy ? 'Hide policy heatmap' : 'Show policy heatmap',
        category: 'Analysis',
        shortcutId: 'toggle-policy',
        run: () => updateControls({ analysisShowPolicy: !settings.analysisShowPolicy }),
        keywords: ['heatmap', 'network'],
      },
      {
        id: 'cycle-policy-metric',
        label: 'Cycle policy heatmap metric',
        category: 'Analysis',
        shortcutId: 'cycle-policy-metric',
        run: () => {
          updateSettings({ analysisPolicyMetric: nextPolicyHeatmapMetric(settings.analysisPolicyMetric) });
          if (!settings.analysisShowPolicy) updateControls({ analysisShowPolicy: true });
        },
        keywords: ['policy label', 'heatmap label'],
      },
      {
        id: 'toggle-territory',
        label: settings.analysisShowOwnership ? 'Hide territory ownership' : 'Show territory ownership',
        category: 'Analysis',
        shortcutId: 'toggle-territory',
        run: () => updateControls({ analysisShowOwnership: !settings.analysisShowOwnership }),
        keywords: ['ownership', 'area'],
      },
      ...ANALYSIS_VISIT_PRESETS.map((visits) => {
        const label = visitPresetLabel(visits);
        return {
          id: `set-live-mcts-depth-${visits}`,
          label: `Set live MCTS depth: ${label}`,
          category: 'Analysis',
          run: () => setLiveAnalysisDepth(visits),
          keywords: [
            'visits',
            'mcts',
            'depth',
            'live analysis',
            `${visits}`,
            formatVisitCount(visits),
            visitPresetDescription(visits),
          ],
        };
      }),
      {
        id: 'game-review',
        label: isGameAnalysisRunning ? 'Stop game review' : 'Fast game review',
        category: 'Analysis',
        run: isGameAnalysisRunning ? stopGameAnalysis : () => startFastGameAnalysis(),
        keywords: ['analyze all', 'report'],
      },
      {
        id: 'game-report',
        label: 'Open game report',
        category: 'Analysis',
        shortcutId: 'game-report-modal',
        run: () => openSimpleModal(() => setIsGameReportOpen(true)),
        keywords: ['review', 'mistakes'],
      },
      {
        id: 'game-analysis',
        label: 'Open game re-analysis',
        category: 'Analysis',
        shortcutId: 'game-analysis-modal',
        run: () => openSimpleModal(() => setIsGameAnalysisOpen(true)),
        keywords: ['depth', 'range'],
      },
      {
        id: 'toggle-scoring',
        label: scoringMode ? 'Exit scoring mode' : 'Score position',
        category: 'Game',
        shortcutId: 'toggle-scoring',
        run: toggleScoringMode,
        keywords: ['count', 'territory', 'dead stones', 'manual score'],
      },
      {
        id: 'score-auto-estimate',
        label: 'Auto-estimate dead stones',
        category: 'Game',
        run: () => {
          if (!openScoring()) return;
          autoEstimateDeadStones();
        },
        keywords: ['score', 'territory', 'dead stones', 'ownership'],
      },
      {
        id: 'score-clear-dead-stones',
        label: 'Clear scoring dead stones',
        category: 'Game',
        run: () => {
          if (!openScoring()) return;
          clearManualDeadStones();
        },
        keywords: ['score', 'territory', 'reset marks'],
      },
      {
        id: 'score-use-final',
        label: 'Use final manual score',
        category: 'Game',
        run: () => {
          if (!openScoring()) return;
          setManualScoreMode('manual');
        },
        keywords: ['score', 'manual', 'final'],
      },
      {
        id: 'score-done',
        label: 'Finish scoring',
        category: 'Game',
        run: () => setScoringMode(false),
        keywords: ['score', 'done', 'close'],
      },
      {
        id: 'toggle-edit-mode',
        label: isEditMode ? 'Close edit tools' : 'Open edit tools',
        category: 'Edit',
        shortcutId: 'toggle-edit-mode',
        run: toggleEditMode,
        keywords: ['sgf', 'setup stones', 'markers', 'labels'],
      },
      ...EDIT_TOOL_SHORTCUT_DEFINITIONS.map((shortcut) => ({
        id: shortcut.id,
        label: shortcut.label,
        category: 'Edit',
        shortcutId: shortcut.id,
        run: () => selectEditTool(shortcut.tool),
        keywords: ['tool', 'edit mode', shortcut.tool.replaceAll('-', ' ')],
      })),
      {
        id: 'edit-note',
        label: 'Edit current note',
        category: 'Edit',
        shortcutId: 'edit-note',
        run: openCurrentNoteEditor,
        keywords: ['comment', 'annotation', 'sgf c'],
      },
      {
        id: 'settings',
        label: 'Open settings',
        category: 'Help & Settings',
        shortcutId: 'settings-modal',
        run: () => openSimpleModal(() => setIsSettingsOpen(true)),
        keywords: ['preferences', 'configuration'],
      },
      {
        id: 'settings-general',
        label: 'Open general settings',
        category: 'Help & Settings',
        run: () => openSettingsTab('general'),
        keywords: ['preferences', 'configuration', 'board', 'theme', 'sound', 'gamepad'],
      },
      {
        id: 'settings-analysis',
        label: 'Open analysis settings',
        category: 'Help & Settings',
        run: () => openSettingsTab('analysis'),
        keywords: ['preferences', 'configuration', 'overlays', 'review', 'visits'],
      },
      {
        id: 'settings-ai',
        label: 'Open AI/Engine settings',
        category: 'Help & Settings',
        run: () => openSettingsTab('ai'),
        keywords: ['preferences', 'configuration', 'model', 'backend', 'webgpu', 'upload'],
      },
      {
        id: 'keyboard-help',
        label: 'Open keyboard shortcuts',
        category: 'Help & Settings',
        shortcutId: 'keyboard-help',
        run: () => openSimpleModal(() => setIsKeyboardHelpOpen(true)),
        keywords: ['hotkeys', 'keys'],
      },
      {
        id: 'shortcut-settings',
        label: 'Customize keyboard shortcuts',
        category: 'Help & Settings',
        run: openShortcutSettings,
        keywords: ['hotkeys', 'keys', 'bindings', 'rebind'],
      },
      {
        id: 'about',
        label: 'About web-KaTrain',
        category: 'Help & Settings',
        run: () => openSimpleModal(() => setIsAboutOpen(true)),
        keywords: ['version', 'build'],
      },
    ];
  })();

  const jumpBack = (n: number) => {
    for (let i = 0; i < n; i++) navigateBack();
  };
  const jumpForward = (n: number) => {
    for (let i = 0; i < n; i++) navigateForward();
  };

  const blackName = getRootProp('PB') || 'Black';
  const whiteName = getRootProp('PW') || 'White';
  const blackRank = getRootProp('BR');
  const whiteRank = getRootProp('WR');
  const moveName = currentNode.move
    ? `Move ${moveHistory.length}: ${playerToShort(currentNode.move.player)} ${formatMoveLabel(currentNode.move.x, currentNode.move.y, boardSize)}`
    : 'Root';
  const currentMoveInsight = getMoveInsight(currentNode.move, boardSize);

  const handleUndo = () => {
    const st = useGameStore.getState();
    const lastMover = st.currentNode.move?.player ?? null;
    const shouldUndoTwice = !!st.isAiPlaying && !!st.aiColor && lastMover === st.aiColor && st.currentPlayer !== st.aiColor;
    navigateBack();
    if (shouldUndoTwice) navigateBack();
  };

  const handleResign = () => {
    setPendingResignPlayer(currentPlayer);
  };

  const confirmResign = useCallback(() => {
    const resigningPlayer = pendingResignPlayer ?? currentPlayer;
    const result = getResignResult(resigningPlayer);
    setPendingResignPlayer(null);
    resign(resigningPlayer);
    toast(`Result: ${result}`, 'info');
  }, [currentPlayer, pendingResignPlayer, resign, toast]);

  const cancelResign = useCallback(() => {
    setPendingResignPlayer(null);
  }, []);

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
      !isUnsavedChangesOpen &&
      !pendingResignPlayer,
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
  const desktopBottomControlsHeight =
    !isMobile && settings.showBoardControls && bottomBarOpen ? 'var(--ui-bar-height)' : '0px';
  const mobileBottomControlsHeight =
    isMobile && settings.showBoardControls && bottomBarOpen && mobileTab === 'board' ? 'var(--ui-bar-height)' : '0px';

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--desktop-bottom-controls-height', desktopBottomControlsHeight);
    root.style.setProperty('--mobile-bottom-controls-height', mobileBottomControlsHeight);
    return () => {
      root.style.removeProperty('--desktop-bottom-controls-height');
      root.style.removeProperty('--mobile-bottom-controls-height');
    };
  }, [desktopBottomControlsHeight, mobileBottomControlsHeight]);

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
        {isAboutOpen && <AboutDialog onClose={() => setIsAboutOpen(false)} />}
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
        {isCommandPaletteOpen && (
          <CommandPaletteModal
            commands={commandPaletteCommands}
            onClose={() => setIsCommandPaletteOpen(false)}
          />
        )}
        {isKeyboardHelpOpen && (
          <KeyboardHelpModal
            onClose={() => setIsKeyboardHelpOpen(false)}
            onOpenShortcutSettings={openShortcutSettings}
          />
        )}
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
        {saveToLibraryDialog && (
          <SaveToLibraryDialog
            open
            initialName={saveToLibraryDialog.initialName}
            folderOptions={saveToLibraryDialog.folderOptions}
            initialFolderId={saveToLibraryDialog.initialFolderId}
            onClose={() => setSaveToLibraryDialog(null)}
            onSave={handleSaveCopyToLibrary}
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
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
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
        onQuickNewGame={() => void startQuickNewGame()}
        onNewGame={() => void openNewGameWithGuard()}
        onSave={handleSaveCurrentSgf}
        saveLabel={saveControlLabel}
        onSaveToLibrary={handleOpenSaveToLibraryDialog}
        onLoad={handleLoadClick}
        onScanBoard={() => openPhotoBoard()}
        onCopy={handleCopySgf}
        onPaste={handlePasteSgf}
        onSettings={() => setIsSettingsOpen(true)}
        onCommandPalette={() => setIsCommandPaletteOpen(true)}
        onKeyboardHelp={() => setIsKeyboardHelpOpen(true)}
        onAbout={() => setIsAboutOpen(true)}
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
          gamepadName={gamepadStatus.connected ? gamepadStatus.name : null}
          gamepadCount={gamepadStatus.count}
          recentItems={recentLibraryItems}
          onClose={closeMobileHome}
          onGamepadNavigationDisable={handleDisableGamepadNavigation}
          onQuickNewGame={() => void startQuickNewGame()}
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
          loadedFileDirty={currentGameDirty}
          onLoadedFileChange={setLoadedLibraryFile}
          externalFileUpdate={externalLibraryFileUpdate}
          externalItemRename={externalLibraryItemRename}
          externalItemCreate={externalLibraryItemCreate}
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
          style={isMobile ? { paddingBottom: 'calc(var(--mobile-tabbar-height) + var(--mobile-bottom-controls-height, 0px) + var(--pwa-banner-height, 0px) + env(safe-area-inset-bottom))' } : undefined}
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
              onQuickNewGame={() => void startQuickNewGame()}
              onNewGame={() => void openNewGameWithGuard()}
              onSaveSgf={handleSaveCurrentSgf}
              saveTitle={saveControlLabel}
              onSaveToLibrary={handleOpenSaveToLibraryDialog}
              onLoadSgf={handleLoadClick}
              onOpenSidePanel={handleOpenSidePanel}
              onCopySgf={handleCopySgf}
              onPasteSgf={handlePasteSgf}
              onScanBoard={() => openPhotoBoard()}
              onSettings={() => setIsSettingsOpen(true)}
              onCommandPalette={() => setIsCommandPaletteOpen(true)}
              onKeyboardHelp={() => setIsKeyboardHelpOpen(true)}
              onAbout={() => setIsAboutOpen(true)}
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
              <NotificationToast
                notification={notification}
                onClose={clearNotification}
                commandBarVisible={showAnalysisCommandBar}
              />
            )}
            <EditToolbar isMobile={isMobile} analysisCommandBarVisible={showAnalysisCommandBar} />
            <ManualScorePanel
              active={scoringMode}
              disabled={isEditMode || isInsertMode || isSelectingRegionOfInterest}
              isCompact={isMobile}
              commandBarOffset={isMobile && showAnalysisCommandBar}
              score={manualScoreEstimate}
              blackName={blackName}
              whiteName={whiteName}
              capturedBlack={capturedBlack}
              capturedWhite={capturedWhite}
              komi={komi}
              deadStoneCount={manualDeadStones.size}
              shortcutLabel={layoutShortcutLabels['toggle-scoring']}
              scoreMode={manualScoreMode}
              onToggle={toggleScoringMode}
              onAutoEstimate={autoEstimateDeadStones}
              onUseManualScore={() => setManualScoreMode('manual')}
              canAutoEstimate={scoreEstimateSource !== null}
              estimateSource={scoreEstimateSource}
              onClear={clearManualDeadStones}
              onDone={() => setScoringMode(false)}
            />
            <AnalysisCommandBar
              mode={mode}
              isAnalysisMode={isAnalysisMode}
              statusText={statusText}
              engineDot={engineDot}
              engineStatus={engineStatus}
              engineError={engineError}
              engineBackend={engineBackend}
              engineModelLabel={engineModelLabel}
              requestedBackend={settings.katagoBackend}
              modelUrl={settings.katagoModelUrl}
              winRate={winRate ?? null}
              scoreLead={scoreLead ?? null}
              pointsLost={pointsLost}
              analysisControls={modeControls}
              updateControls={updateControls}
              toggleAnalysisMode={toggleAnalysisMode}
              isGameAnalysisRunning={isGameAnalysisRunning}
              gameAnalysisType={gameAnalysisType}
              gameAnalysisDone={gameAnalysisDone}
              gameAnalysisTotal={gameAnalysisTotal}
              startFastGameAnalysis={startFastGameAnalysis}
              stopGameAnalysis={stopGameAnalysis}
              onOpenGameReport={() => setIsGameReportOpen(true)}
            />
            <div
              className={[
                'flex-1 flex justify-center min-h-0 min-w-0',
                isMobile && showAnalysisCommandBar ? 'items-start pt-2' : 'items-center',
              ].join(' ')}
            >
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
              blackName={blackName}
              whiteName={whiteName}
              blackRank={blackRank}
              whiteRank={whiteRank}
              capturedBlack={capturedBlack}
              capturedWhite={capturedWhite}
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
                title={topBarOpen ? withLayoutShortcut('Hide top bar', 'toggle-top-bar') : withLayoutShortcut('Show top bar', 'toggle-top-bar')}
                onClick={handleToggleTopBar}
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
          currentMoveInsight={currentMoveInsight}
          shapeCoachEnabled={shapeCoachEnabled}
          onToggleShapeCoach={toggleShapeCoach}
          noteFocusRequest={noteFocusRequest}
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
                  title={bottomBarOpen ? withLayoutShortcut('Hide bottom controls', 'toggle-bottom-bar') : withLayoutShortcut('Show bottom controls', 'toggle-bottom-bar')}
                  onClick={handleToggleBottomBar}
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
                    blackName={blackName}
                    whiteName={whiteName}
                    blackRank={blackRank}
                    whiteRank={whiteRank}
                    capturedBlack={capturedBlack}
                    capturedWhite={capturedWhite}
                    isInsertMode={isInsertMode}
                    passPolicyColor={passPolicyColor}
                    passPv={passPv}
                    jumpBack={jumpBack}
                    jumpForward={jumpForward}
                    isMobile={true}
                    onUndo={handleUndo}
                    onAiMove={makeAiMove}
                    onResign={handleResign}
                    unsavedChanges={currentGameDirty}
                    autoSaveStatus={autoSaveStatus}
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
      {pendingResignPlayer && (
        <ResignConfirmModal
          player={pendingResignPlayer}
          onCancel={cancelResign}
          onConfirm={confirmResign}
        />
      )}
      {!isMobile && (
        <StatusBar
          moveName={moveName}
          moveInsight={currentMoveInsight}
          shapeCoachEnabled={shapeCoachEnabled}
          onToggleShapeCoach={toggleShapeCoach}
          blackName={blackName}
          whiteName={whiteName}
          blackRank={blackRank}
          whiteRank={whiteRank}
          komi={komi}
          boardSize={boardSize}
          handicap={handicap}
          moveCount={moveHistory.length}
          capturedBlack={capturedBlack}
          capturedWhite={capturedWhite}
          endResult={endResult}
          gamepadName={gamepadStatus.connected ? gamepadStatus.name : null}
          gamepadCount={gamepadStatus.count}
          onGamepadNavigationDisable={handleDisableGamepadNavigation}
          loadedFileKind={loadedLibraryFileName ? 'library' : loadedExternalFile?.kind}
          loadedFileName={loadedLibraryFileName ?? loadedExternalFile?.name ?? null}
          onLoadedFileRename={loadedLibraryFileName ? renameLoadedLibraryFile : undefined}
          unsavedChanges={currentGameDirty}
          autoSaveStatus={autoSaveStatus}
        />
      )}
    </div>
  );
};

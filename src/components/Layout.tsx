import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { SettingsModal } from './SettingsModal';
import { GameAnalysisModal } from './GameAnalysisModal';
import { GameReportModal } from './GameReportModal';
import { KeyboardHelpModal } from './KeyboardHelpModal';
import { AnalysisPanel } from './AnalysisPanel';
import { NewGameModal, type GameInfoValues, type AiConfigValues, type TimerConfigValues } from './NewGameModal';
import { FaTimes } from 'react-icons/fa';
import { downloadSgfFromTree, generateSgfFromTree, parseSgf, type KaTrainSgfExportOptions } from '../utils/sgf';
import type { LibraryFile } from '../utils/library';
import { loadLibrary } from '../utils/library';
import { loadSgfOrOgs } from '../utils/ogs';
import { BOARD_SIZE, type CandidateMove, type GameNode, type Player } from '../types';
import { parseGtpMove } from '../lib/gtp';
import { computeJapaneseManualScoreFromOwnership, formatResultScoreLead, roundToHalf } from '../utils/manualScore';
import { getKaTrainEvalColors } from '../utils/katrainTheme';
import { getEngineModelLabel } from '../utils/engineLabel';

// Layout components
import { MenuDrawer } from './layout/MenuDrawer';
import { TopControlBar } from './layout/TopControlBar';
import { BottomControlBar } from './layout/BottomControlBar';
import { RightPanel } from './layout/RightPanel';
import { StatusBar } from './layout/StatusBar';
import { MobileTabBar, type MobileTab } from './layout/MobileTabBar';
import { LibraryPanel } from './LibraryPanel';
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
    makeAiMove,
    isAiPlaying,
    aiColor,
    navigateBack,
    navigateForward,
    navigateStart,
    navigateEnd,
    switchBranch,
    undoToBranchPoint,
    undoToMainBranch,
    makeCurrentNodeMainBranch,
    findMistake,
    loadGame,
    analyzeExtra,
    resetCurrentAnalysis,
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
    toggleInsertMode,
    isSelfplayToEnd,
    selfplayToEnd,
    notification,
    clearNotification,
    analysisData,
    board,
    currentNode,
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
      makeAiMove: state.makeAiMove,
      isAiPlaying: state.isAiPlaying,
      aiColor: state.aiColor,
      navigateBack: state.navigateBack,
      navigateForward: state.navigateForward,
      navigateStart: state.navigateStart,
      navigateEnd: state.navigateEnd,
      switchBranch: state.switchBranch,
      undoToBranchPoint: state.undoToBranchPoint,
      undoToMainBranch: state.undoToMainBranch,
      makeCurrentNodeMainBranch: state.makeCurrentNodeMainBranch,
      findMistake: state.findMistake,
      loadGame: state.loadGame,
      analyzeExtra: state.analyzeExtra,
      resetCurrentAnalysis: state.resetCurrentAnalysis,
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
      toggleInsertMode: state.toggleInsertMode,
      isSelfplayToEnd: state.isSelfplayToEnd,
      selfplayToEnd: state.selfplayToEnd,
      notification: state.notification,
      clearNotification: state.clearNotification,
      analysisData: state.analysisData,
      board: state.board,
      currentNode: state.currentNode,
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
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const fileDragCounter = useRef(0);
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

  const rootProps = rootNode.properties ?? {};
  const getRootProp = (key: string) => rootProps[key]?.[0] ?? '';
  const defaultGameInfo: GameInfoValues = {
    blackName: getRootProp('PB'),
    whiteName: getRootProp('PW'),
    blackRank: getRootProp('BR'),
    whiteRank: getRootProp('WR'),
    event: getRootProp('EV'),
    date: getRootProp('DT'),
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
  const toast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    useGameStore.setState({ notification: { message, type } });
    window.setTimeout(() => useGameStore.setState({ notification: null }), 2500);
  };

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
      const m = parseGtpMove(pv[i]!);
      if (m?.kind === 'pass') last = { idx: i + 1, player: i % 2 === 0 ? currentPlayer : opp };
    }
    return last;
  }, [currentPlayer, activeHoverMove, pvOverlayEnabled, pvUpToMove]);

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
    const parts: string[] = [];
    if (engineBackend) parts.push(engineBackend);
    if (engineModelLabel) parts.push(engineModelLabel);
    return parts.length > 0 ? parts.join(' · ') : engineStatus;
  }, [engineBackend, engineModelLabel, engineStatus]);

  const engineMetaTitle = useMemo(() => {
    const parts: string[] = [];
    if (engineBackend) parts.push(engineBackend);
    if (engineModelLabel) parts.push(engineModelLabel);
    if (parts.length === 0) return undefined;
    return `Engine: ${parts.join(' · ')}`;
  }, [engineBackend, engineModelLabel]);

  const statusText = engineError
    ? `Engine error: ${engineError}`
    : isSelfplayToEnd
      ? 'Selfplay to end… (Esc to stop)'
      : isSelectingRegionOfInterest
        ? 'Select region of interest (drag on board, Esc cancels)'
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
  const passPolicyColor = useMemo(() => {
    if (!isAnalysisMode || !settings.analysisShowPolicy) return null;
    const policy = analysisData?.policy;
    if (!policy) return null;
    const passPolicy = policy[BOARD_SIZE * BOARD_SIZE];
    if (!Number.isFinite(passPolicy)) return null;
    const polOrder = 5 - Math.trunc(-Math.log10(Math.max(1e-9, passPolicy - 1e-9)));
    if (polOrder < 0) return null;
    const col = evalColors[Math.min(evalColors.length - 1, Math.max(0, polOrder))]!;
    return rgba(col, GHOST_ALPHA);
  }, [analysisData, evalColors, isAnalysisMode, settings.analysisShowPolicy]);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = parseSgf(text);
      loadGame(parsed);
    } catch {
      toast('Failed to parse SGF file.', 'error');
    }
    e.target.value = '';
  };

  const handleLoadFromLibrary = (sgfText: string) => {
    try {
      const parsed = parseSgf(sgfText);
      loadGame(parsed);
    } catch {
      toast('Failed to load SGF from library.', 'error');
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

  const handlePasteSgf = async () => {
    let text: string | null = null;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = window.prompt('Paste SGF here:') ?? null;
    }
    if (!text) return;
    await handleOpenSgfFromText(text);
  };

  const handleOpenSgfFromText = async (text: string) => {
    try {
      const result = await loadSgfOrOgs(text);
      if (!result.sgf.trim()) return;
      if (result.source === 'ogs') {
        toast(`Downloaded OGS game ${result.gameId ?? ''}.`, 'success');
      }
      const parsed = parseSgf(result.sgf);
      loadGame(parsed);
      navigateEnd();
      toast('Loaded SGF.', 'success');
    } catch {
      toast('Failed to load SGF or OGS URL.', 'error');
    }
  };

  const handleOpenRecent = async (sgfText: string) => {
    await handleOpenSgfFromText(sgfText);
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
    if (!file.name.toLowerCase().endsWith('.sgf')) {
      toast('Only SGF files can be opened here.', 'error');
      return;
    }
    try {
      const text = await file.text();
      await handleOpenSgfFromText(text);
    } catch {
      toast('Failed to read the dropped SGF file.', 'error');
    }
  };

  const recentLibraryItems = useMemo<LibraryFile[]>(() => {
    void libraryOpen;
    void libraryVersion;
    return loadLibrary()
      .filter((item): item is LibraryFile => item.type === 'file')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
  }, [libraryOpen, libraryVersion]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    mode,
    sgfExportOptions,
    fileInputRef,
    setIsSettingsOpen,
    setIsGameAnalysisOpen,
    setIsGameReportOpen,
    setAnalysisMenuOpen,
    setViewMenuOpen,
    setMenuOpen,
    setIsKeyboardHelpOpen,
    openNewGame: () => setIsNewGameOpen(true),
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
    ? `Move ${moveHistory.length}: ${playerToShort(currentNode.move.player)} ${formatMoveLabel(currentNode.move.x, currentNode.move.y)}`
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

  return (
    <div
      className="relative flex flex-col h-screen overflow-hidden app-root ui-root font-sans"
      onDragEnter={handleAppDragEnter}
      onDragLeave={handleAppDragLeave}
      onDragOver={handleAppDragOver}
      onDrop={handleAppDrop}
    >
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
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
      {isNewGameOpen && (
        <NewGameModal
          onClose={() => setIsNewGameOpen(false)}
          onStart={({ komi: nextKomi, rules, info, aiConfig, timerConfig }) => {
            startNewGame({ komi: nextKomi, rules });
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
            setIsNewGameOpen(false);
          }}
          defaultKomi={komi}
          defaultRules={settings.gameRules}
          defaultInfo={defaultGameInfo}
          defaultAiConfig={defaultAiConfig}
          defaultTimerConfig={defaultTimerConfig}
        />
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".sgf" />

      {isFileDragActive && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="rounded-xl border-2 border-dashed border-[var(--ui-accent)] px-6 py-4 text-center ui-panel">
            <div className="text-sm font-semibold text-[var(--ui-accent)]">Drop SGF to open</div>
            <div className="text-xs ui-text-faint">Release to load the game in the board.</div>
          </div>
        </div>
      )}

      <MenuDrawer
        open={menuOpen && isMobile}
        onClose={() => setMenuOpen(false)}
        onNewGame={() => setIsNewGameOpen(true)}
        onSave={() => downloadSgfFromTree(rootNode, sgfExportOptions)}
        onLoad={handleLoadClick}
        onCopy={handleCopySgf}
        onPaste={handlePasteSgf}
        onSettings={() => setIsSettingsOpen(true)}
        onKeyboardHelp={() => setIsKeyboardHelpOpen(true)}
        recentItems={recentLibraryItems}
        onOpenRecent={handleOpenRecent}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
      <LibraryPanel
        open={libraryOpen}
        onClose={handleCloseLibrary}
        docked={isDesktop}
        width={leftPanelWidth}
        getCurrentSgf={() => generateSgfFromTree(rootNode, sgfExportOptions)}
        onLoadSgf={handleLoadFromLibrary}
        onToast={toast}
        isMobile={isMobile}
        onOpenRecent={handleOpenRecent}
        onLibraryUpdated={handleLibraryUpdated}
        isAnalysisRunning={isGameAnalysisRunning}
        onStopAnalysis={stopGameAnalysis}
        analysisContent={
          isDesktop ? (
            <AnalysisPanel
              mode={mode}
              modePanels={modePanels}
              updatePanels={updatePanels}
              statusText={statusText}
              engineDot={engineDot}
              engineMeta={engineMeta}
              engineMetaTitle={engineMetaTitle}
              isGameAnalysisRunning={isGameAnalysisRunning}
              gameAnalysisType={gameAnalysisType}
              gameAnalysisDone={gameAnalysisDone}
              gameAnalysisTotal={gameAnalysisTotal}
              startQuickGameAnalysis={startQuickGameAnalysis}
              startFastGameAnalysis={startFastGameAnalysis}
              stopGameAnalysis={stopGameAnalysis}
              onOpenGameAnalysis={() => setIsGameAnalysisOpen(true)}
              onOpenGameReport={() => setIsGameReportOpen(true)}
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
      <div className={['flex flex-col flex-1 min-w-0 relative', isMobile ? 'pb-[68px]' : ''].join(' ')}>
        {topBarOpen && (
          <TopControlBar
            settings={settings}
            updateControls={updateControls}
            updateSettings={updateSettings}
            regionOfInterest={regionOfInterest}
            setRegionOfInterest={setRegionOfInterest}
            isInsertMode={isInsertMode}
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
            onNewGame={() => setIsNewGameOpen(true)}
            onOpenSidePanel={handleOpenSidePanel}
            onCopySgf={handleCopySgf}
            onPasteSgf={handlePasteSgf}
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
        <div className={['flex-1 flex items-center justify-center ui-bg overflow-auto relative', isMobile ? 'p-3 md:p-4' : 'p-4 xl:p-6'].join(' ')}>
          {notification && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded shadow-lg flex items-center space-x-4 ui-panel border">
              <span>{notification.message}</span>
              <button onClick={clearNotification} className="hover:text-white">
                <FaTimes />
              </button>
            </div>
          )}
          <GoBoard
            hoveredMove={activeHoverMove}
            onHoverMove={setHoveredMove}
            pvUpToMove={pvUpToMove}
            uiMode={boardUiMode}
            forcePvOverlay={!!reportHoverMove}
          />
        </div>

        {settings.showBoardControls && bottomBarOpen && (
          <BottomControlBar
            passTurn={passTurn}
            navigateBack={navigateBack}
            navigateForward={navigateForward}
            navigateStart={navigateStart}
            navigateEnd={navigateEnd}
            findMistake={findMistake}
            rotateBoard={rotateBoard}
            currentPlayer={currentPlayer}
            moveHistory={moveHistory}
            isInsertMode={isInsertMode}
            passPolicyColor={passPolicyColor}
            passPv={passPv}
            jumpBack={jumpBack}
            jumpForward={jumpForward}
            isMobile={isMobile}
            onUndo={handleUndo}
            onAiMove={makeAiMove}
            onResign={handleResign}
          />
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
        updatePanels={updatePanels}
        rootNode={rootNode}
        treeVersion={treeVersion}
        isGameAnalysisRunning={isGameAnalysisRunning}
        gameAnalysisType={gameAnalysisType}
        gameAnalysisDone={gameAnalysisDone}
        gameAnalysisTotal={gameAnalysisTotal}
        startQuickGameAnalysis={startQuickGameAnalysis}
        startFastGameAnalysis={startFastGameAnalysis}
        stopGameAnalysis={stopGameAnalysis}
        onOpenGameAnalysis={() => setIsGameAnalysisOpen(true)}
        onOpenGameReport={() => setIsGameReportOpen(true)}
        currentPlayer={currentPlayer}
        onUndo={handleUndo}
        onResign={handleResign}
        onAiMove={makeAiMove}
        navigateStart={navigateStart}
        navigateEnd={navigateEnd}
        switchBranch={switchBranch}
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
        engineError={engineError}
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
                ? { left: leftPanelWidth, transform: 'translate(-50%, -50%)' }
                : { left: 0, transform: 'translate(0, -50%)' }
            }
          >
            <PanelEdgeToggle
              side="left"
              state={libraryOpen ? 'open' : 'closed'}
              title={libraryOpen ? 'Hide panel (Ctrl+L)' : 'Show library (Ctrl+L)'}
              onClick={handleToggleLibrary}
            />
          </div>
          <div
            className="absolute top-1/2 z-30"
            style={
              showSidebar
                ? { right: rightPanelWidth, transform: 'translate(50%, -50%)' }
                : { right: 0, transform: 'translate(0, -50%)' }
            }
          >
            <PanelEdgeToggle
              side="right"
              state={showSidebar ? 'open' : 'closed'}
              title={showSidebar ? 'Hide panel (Ctrl+B)' : 'Show panel (Ctrl+B)'}
              onClick={handleToggleSidebar}
            />
          </div>
        </>
      )}

      {!isMobile && (
        <>
          <div className="absolute left-1/2 top-0 -translate-x-1/2 z-30">
            <PanelEdgeToggle
              side="top"
              state={topBarOpen ? 'open' : 'closed'}
              title={topBarOpen ? 'Hide top bar' : 'Show top bar'}
              onClick={() => setTopBarOpen((prev) => !prev)}
            />
          </div>
          {settings.showBoardControls && (
            <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ bottom: 28 }}>
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
        <MobileTabBar
          activeTab={mobileTab}
          onTabChange={handleMobileTabChange}
          commentBadge={noteCount}
        />
      )}
      </div>
      <StatusBar
        moveName={moveName}
        blackName={blackName}
        whiteName={whiteName}
        komi={komi}
        moveCount={moveHistory.length}
        capturedBlack={capturedBlack}
        capturedWhite={capturedWhite}
        endResult={endResult}
      />
    </div>
  );
};

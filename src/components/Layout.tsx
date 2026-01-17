import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { SettingsModal } from './SettingsModal';
import { GameAnalysisModal } from './GameAnalysisModal';
import { GameReportModal } from './GameReportModal';
import { KeyboardHelpModal } from './KeyboardHelpModal';
import { AnalysisPanel } from './AnalysisPanel';
import { NewGameModal } from './NewGameModal';
import { FaTimes } from 'react-icons/fa';
import { downloadSgfFromTree, generateSgfFromTree, parseSgf, type KaTrainSgfExportOptions } from '../utils/sgf';
import type { LibraryFile } from '../utils/library';
import { loadLibrary } from '../utils/library';
import { loadSgfOrOgs } from '../utils/ogs';
import { BOARD_SIZE, type CandidateMove, type GameNode, type Player } from '../types';
import { parseGtpMove } from '../lib/gtp';
import { computeJapaneseManualScoreFromOwnership, formatResultScoreLead, roundToHalf } from '../utils/manualScore';
import { getKaTrainEvalColors } from '../utils/katrainTheme';

// Layout components
import { MenuDrawer } from './layout/MenuDrawer';
import { TopControlBar } from './layout/TopControlBar';
import { BottomControlBar } from './layout/BottomControlBar';
import { RightPanel } from './layout/RightPanel';
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
import { PanelEdgeToggle, rgba } from './layout/ui';
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
    resetGame,
    startNewGame,
    passTurn,
    resign,
    makeAiMove,
    toggleAi,
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
      toggleAi: state.toggleAi,
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

  useEffect(() => {
    if (!isResizingLeft && !isResizingRight) return;
    const minLeft = 220;
    const minRight = 280;
    const maxLeftLimit = 520;
    const maxRightLimit = 520;
    const minMain = isDesktop ? 420 : 0;
    const maxLeft = Math.max(
      minLeft,
      Math.min(maxLeftLimit, viewportWidth - minMain - (showSidebar ? rightPanelWidth : 0))
    );
    const maxRight = Math.max(
      minRight,
      Math.min(maxRightLimit, viewportWidth - minMain - (libraryOpen ? leftPanelWidth : 0))
    );
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
    isResizingLeft,
    isResizingRight,
    isDesktop,
    viewportWidth,
    leftPanelWidth,
    rightPanelWidth,
    libraryOpen,
    showSidebar,
  ]);

  useEffect(() => {
    if (!isDesktop) return;
    const minLeft = 220;
    const minRight = 280;
    const maxLeftLimit = 520;
    const maxRightLimit = 520;
    const minMain = 420;
    const maxLeft = Math.max(
      minLeft,
      Math.min(maxLeftLimit, viewportWidth - minMain - (showSidebar ? rightPanelWidth : 0))
    );
    const maxRight = Math.max(
      minRight,
      Math.min(maxRightLimit, viewportWidth - minMain - (libraryOpen ? leftPanelWidth : 0))
    );

    if (libraryOpen) {
      const nextLeft = Math.min(maxLeft, Math.max(minLeft, leftPanelWidth));
      if (nextLeft !== leftPanelWidth) setLeftPanelWidth(nextLeft);
    }
    if (showSidebar) {
      const nextRight = Math.min(maxRight, Math.max(minRight, rightPanelWidth));
      if (nextRight !== rightPanelWidth) setRightPanelWidth(nextRight);
    }
  }, [isDesktop, viewportWidth, libraryOpen, showSidebar, leftPanelWidth, rightPanelWidth]);

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
  const pvKey = useMemo(() => {
    const pv = hoveredMove?.pv;
    if (!isAnalysisMode || !pv || pv.length === 0) return null;
    return `${currentNode.id}|${pv.join(' ')}`;
  }, [currentNode.id, hoveredMove, isAnalysisMode]);

  const evalColors = useMemo(() => getKaTrainEvalColors(settings.trainerTheme), [settings.trainerTheme]);
  const pvAnimTimeS = useMemo(() => {
    const t = settings.animPvTimeSeconds;
    return typeof t === 'number' && Number.isFinite(t) ? t : 0.5;
  }, [settings.animPvTimeSeconds]);

  useEffect(() => {
    if (!pvKey || pvAnimTimeS <= 0) {
      setPvAnim(null);
      return;
    }
    setPvAnim((prev) => (prev?.key === pvKey ? prev : { key: pvKey, startMs: performance.now() }));
    setPvAnimNowMs(performance.now());
  }, [pvKey, pvAnimTimeS]);

  const pvLen = hoveredMove?.pv?.length ?? 0;
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
    const pv = hoveredMove?.pv;
    if (!isAnalysisMode || !pv || pv.length === 0) return null;
    if (pvAnimTimeS <= 0) return pv.length;
    if (!pvAnim || pvAnim.key !== pvKey) return pv.length;
    const delayMs = Math.max(pvAnimTimeS, 0.1) * 1000;
    return Math.min(pv.length, (pvAnimNowMs - pvAnim.startMs) / delayMs);
  }, [hoveredMove, isAnalysisMode, pvAnim, pvAnimNowMs, pvAnimTimeS, pvKey]);

  const passPv = useMemo(() => {
    const pv = hoveredMove?.pv;
    if (!isAnalysisMode || !pv || pv.length === 0) return null;
    const upToMove = typeof pvUpToMove === 'number' ? pvUpToMove : pv.length;
    const opp: Player = currentPlayer === 'black' ? 'white' : 'black';
    let last: { idx: number; player: Player } | null = null;
    for (let i = 0; i < pv.length; i++) {
      if (i > upToMove) break;
      const m = parseGtpMove(pv[i]!);
      if (m?.kind === 'pass') last = { idx: i + 1, player: i % 2 === 0 ? currentPlayer : opp };
    }
    return last;
  }, [currentPlayer, hoveredMove, isAnalysisMode, pvUpToMove]);

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

  const engineMeta = useMemo(() => {
    const parts: string[] = [engineStatus];
    if (engineBackend) parts.push(engineBackend);
    if (engineModelName) {
      parts.push(engineModelName.length > 28 ? `${engineModelName.slice(0, 28)}…` : engineModelName);
    }
    return parts.join(' · ');
  }, [engineBackend, engineModelName, engineStatus]);

  const engineMetaTitle = useMemo(() => {
    const parts: string[] = [];
    if (engineBackend) parts.push(engineBackend);
    if (engineModelName) parts.push(engineModelName);
    if (parts.length === 0) return undefined;
    return `Engine: ${parts.join(' · ')}`;
  }, [engineBackend, engineModelName]);

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
    if (tab === 'info') updatePanels({ infoOpen: true, notesOpen: true });
    if (tab === 'analysis') {
      updatePanels({ analysisOpen: true, graphOpen: true, statsOpen: true });
    }
    if (tab === 'tree' || tab === 'info' || tab === 'analysis') {
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
    return Boolean(target.closest('[data-dropzone=\"library\"]'));
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

  const sidebarOpen = isMobile ? rightPanelOpen : showSidebar;

  return (
    <div
      className="relative flex h-screen bg-slate-900 text-slate-200 font-sans overflow-hidden"
      onDragEnter={handleAppDragEnter}
      onDragLeave={handleAppDragLeave}
      onDragOver={handleAppDragOver}
      onDrop={handleAppDrop}
    >
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      {isGameAnalysisOpen && <GameAnalysisModal onClose={() => setIsGameAnalysisOpen(false)} />}
      {isGameReportOpen && <GameReportModal onClose={() => setIsGameReportOpen(false)} />}
      {isKeyboardHelpOpen && <KeyboardHelpModal onClose={() => setIsKeyboardHelpOpen(false)} />}
      {isNewGameOpen && (
        <NewGameModal
          onClose={() => setIsNewGameOpen(false)}
          onStart={({ komi: nextKomi, rules }) => {
            startNewGame({ komi: nextKomi, rules });
            setIsNewGameOpen(false);
          }}
          defaultKomi={komi}
          defaultRules={settings.gameRules}
        />
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".sgf" />

      {isFileDragActive && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm pointer-events-none">
          <div className="rounded-xl border-2 border-dashed border-emerald-400/60 px-6 py-4 text-center bg-slate-900/70">
            <div className="text-sm font-semibold text-emerald-100">Drop SGF to open</div>
            <div className="text-xs text-slate-300">Release to load the game in the board.</div>
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
          className="hidden lg:block w-1 cursor-col-resize bg-slate-800/60 hover:bg-slate-600/80 transition-colors"
          onMouseDown={() => setIsResizingLeft(true)}
          onDoubleClick={handleToggleLibrary}
        />
      )}

      {/* Main board column */}
      <div className={['flex flex-col flex-1 min-w-0 relative', isMobile ? 'pb-[68px]' : ''].join(' ')}>
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
          onSave={() => downloadSgfFromTree(rootNode, sgfExportOptions)}
          onLoad={handleLoadClick}
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
        />

        {/* Board */}
        <div className={['flex-1 flex items-center justify-center bg-slate-900 overflow-auto relative', isMobile ? 'p-3 md:p-4' : 'p-4 xl:p-6'].join(' ')}>
          {notification && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded shadow-lg flex items-center space-x-4 bg-slate-800 border border-slate-700/50">
              <span>{notification.message}</span>
              <button onClick={clearNotification} className="hover:text-slate-200">
                <FaTimes />
              </button>
            </div>
          )}
          <GoBoard hoveredMove={hoveredMove} onHoverMove={setHoveredMove} pvUpToMove={pvUpToMove} uiMode={mode} />
        </div>

        {settings.showBoardControls && (
          <BottomControlBar
            passTurn={passTurn}
            navigateBack={navigateBack}
            navigateForward={navigateForward}
            navigateStart={navigateStart}
            navigateEnd={navigateEnd}
            findMistake={findMistake}
            rotateBoard={rotateBoard}
            makeAiMove={makeAiMove}
            currentPlayer={currentPlayer}
            moveHistory={moveHistory}
            isInsertMode={isInsertMode}
            passPolicyColor={passPolicyColor}
            passPv={passPv}
            jumpBack={jumpBack}
            jumpForward={jumpForward}
          />
        )}
      </div>

      {isDesktop && showSidebar && (
        <div
          className="hidden lg:block w-1 cursor-col-resize bg-slate-800/60 hover:bg-slate-600/80 transition-colors"
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
        isAiPlaying={isAiPlaying}
        aiColor={aiColor}
        capturedBlack={capturedBlack}
        capturedWhite={capturedWhite}
        komi={komi}
        endResult={endResult}
        navigateBack={navigateBack}
        navigateStart={navigateStart}
        navigateEnd={navigateEnd}
        switchBranch={switchBranch}
        undoToBranchPoint={undoToBranchPoint}
        undoToMainBranch={undoToMainBranch}
        makeCurrentNodeMainBranch={makeCurrentNodeMainBranch}
        isInsertMode={isInsertMode}
        setRootProperty={setRootProperty}
        resign={resign}
        toggleAi={toggleAi}
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

      {isMobile && (
        <MobileTabBar
          activeTab={mobileTab}
          onTabChange={handleMobileTabChange}
          showAnalysis
          commentBadge={noteCount}
        />
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import { SettingsModal } from './SettingsModal';
import { MoveTree } from './MoveTree';
import { NotesPanel } from './NotesPanel';
import { Timer } from './Timer';
import { GameAnalysisModal } from './GameAnalysisModal';
import { GameReportModal } from './GameReportModal';
import {
  FaBars,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCog,
  FaExclamationTriangle,
  FaFastBackward,
  FaFastForward,
  FaFolderOpen,
  FaPlay,
  FaRobot,
  FaSave,
  FaSyncAlt,
  FaStepBackward,
  FaStepForward,
  FaStop,
  FaTimes,
} from 'react-icons/fa';
import { downloadSgfFromTree, generateSgfFromTree, parseSgf, type KaTrainSgfExportOptions } from '../utils/sgf';
import { BOARD_SIZE, type CandidateMove, type GameNode, type Player } from '../types';
import { parseGtpMove } from '../lib/gtp';
import { computeJapaneseManualScoreFromOwnership, formatResultScoreLead, roundToHalf } from '../utils/manualScore';
import { getKaTrainEvalColors } from '../utils/katrainTheme';

type UiMode = 'play' | 'analyze';

type AnalysisControlsState = {
  analysisShowChildren: boolean;
  analysisShowEval: boolean;
  analysisShowHints: boolean;
  analysisShowPolicy: boolean;
  analysisShowOwnership: boolean;
};

type GraphOptions = { score: boolean; winrate: boolean };
type StatsOptions = { score: boolean; winrate: boolean; points: boolean };
type NotesOptions = { info: boolean; infoDetails: boolean; notes: boolean };

type UiState = {
  mode: UiMode;
  analysisControls: Record<UiMode, AnalysisControlsState>;
  panels: Record<
    UiMode,
    {
      graphOpen: boolean;
      graph: GraphOptions;
      statsOpen: boolean;
      stats: StatsOptions;
      notesOpen: boolean;
      notes: NotesOptions;
    }
  >;
};

const UI_STATE_KEY = 'web-katrain:ui_state:v1';
const GHOST_ALPHA = 0.6;
const STONE_SIZE = 0.505;

function rgba(color: readonly [number, number, number, number], alphaOverride?: number): string {
  const a = typeof alphaOverride === 'number' ? alphaOverride : color[3];
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${a})`;
}

function defaultUiState(): UiState {
  // Mirrors KaTrain `config.json` defaults for `ui_state`.
  return {
    mode: 'play',
    analysisControls: {
      play: {
        analysisShowChildren: true,
        analysisShowEval: false,
        analysisShowHints: false,
        analysisShowPolicy: false,
        analysisShowOwnership: false,
      },
      analyze: {
        analysisShowChildren: true,
        analysisShowEval: true,
        analysisShowHints: true,
        analysisShowPolicy: false,
        analysisShowOwnership: true,
      },
    },
    panels: {
      play: {
        graphOpen: true,
        graph: { score: true, winrate: false },
        statsOpen: true,
        stats: { score: true, winrate: true, points: true },
        notesOpen: true,
        notes: { info: true, infoDetails: false, notes: false },
      },
      analyze: {
        graphOpen: true,
        graph: { score: true, winrate: true },
        statsOpen: true,
        stats: { score: true, winrate: true, points: true },
        notesOpen: true,
        notes: { info: true, infoDetails: true, notes: false },
      },
    },
  };
}

function loadUiState(): UiState {
  if (typeof localStorage === 'undefined') return defaultUiState();
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return defaultUiState();
    const parsed = JSON.parse(raw) as Partial<UiState> | null;
    if (!parsed || typeof parsed !== 'object') return defaultUiState();

    const d = defaultUiState();
    const mode: UiMode = parsed.mode === 'analyze' ? 'analyze' : 'play';
    const analysisControls = {
      play: { ...d.analysisControls.play, ...(parsed.analysisControls?.play ?? {}) },
      analyze: { ...d.analysisControls.analyze, ...(parsed.analysisControls?.analyze ?? {}) },
    };

    const mergePanel = (m: UiMode): UiState['panels'][UiMode] => {
      const src = parsed.panels?.[m];
      const fallback = d.panels[m];
      return {
        graphOpen: typeof src?.graphOpen === 'boolean' ? src.graphOpen : fallback.graphOpen,
        graph: { ...fallback.graph, ...(src?.graph ?? {}) },
        statsOpen: typeof src?.statsOpen === 'boolean' ? src.statsOpen : fallback.statsOpen,
        stats: { ...fallback.stats, ...(src?.stats ?? {}) },
        notesOpen: typeof src?.notesOpen === 'boolean' ? src.notesOpen : fallback.notesOpen,
        notes: { ...fallback.notes, ...(src?.notes ?? {}) },
      };
    };

    const panels = {
      play: mergePanel('play'),
      analyze: mergePanel('analyze'),
    };
    return { mode, analysisControls, panels };
  } catch {
    return defaultUiState();
  }
}

function saveUiState(state: UiState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota/permission errors.
  }
}

function formatMoveLabel(x: number, y: number): string {
  if (x < 0 || y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
  const row = 19 - y;
  return `${col}${row}`;
}

function playerToShort(p: Player): string {
  return p === 'black' ? 'B' : 'W';
}

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

const IconButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, className, children }) => {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'h-10 w-10 flex items-center justify-center rounded',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-700 text-gray-300 hover:text-white',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </button>
  );
};

const TogglePill: React.FC<{
  label: string;
  shortcut?: string;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ label, shortcut, active, disabled, onToggle }) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={[
        'px-3 py-1 rounded border text-xs font-semibold flex items-center gap-2',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-700',
        active ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-300',
      ].join(' ')}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <span
        className={[
          'inline-block h-3 w-3 rounded-sm border',
          active ? 'bg-green-500 border-green-400' : 'bg-transparent border-gray-500',
        ].join(' ')}
      />
      <span>{shortcut ? `${shortcut} ${label}` : label}</span>
    </button>
  );
};

const PanelHeaderButton: React.FC<{
  label: string;
  colorClass: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, colorClass, active, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2 py-1 rounded text-xs font-semibold border',
        active ? `${colorClass} border-gray-500 text-white` : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700',
      ].join(' ')}
    >
      {label}
    </button>
  );
};

export const Layout: React.FC = () => {
  const {
    resetGame,
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
    stopAnalysis,
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
    cancelSelectRegionOfInterest,
    setRegionOfInterest,
    isInsertMode,
    toggleInsertMode,
    isSelfplayToEnd,
    selfplayToEnd,
    stopSelfplayToEnd,
    notification,
    clearNotification,
    analysisData,
    board,
    currentNode,
    runAnalysis,
    settings,
    updateSettings,
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
  } = useGameStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hoveredMove, setHoveredMove] = useState<CandidateMove | null>(null);
  const [pvAnim, setPvAnim] = useState<{ key: string; startMs: number } | null>(null);
  const [pvAnimNowMs, setPvAnimNowMs] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGameAnalysisOpen, setIsGameAnalysisOpen] = useState(false);
  const [isGameReportOpen, setIsGameReportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [analysisMenuOpen, setAnalysisMenuOpen] = useState(false);
  const [uiState, setUiState] = useState<UiState>(() => loadUiState());
  const passBtnRef = useRef<HTMLButtonElement>(null);
  const [passBtnHeight, setPassBtnHeight] = useState(0);

  const mode = uiState.mode;
  const modeControls = uiState.analysisControls[mode];
  const modePanels = uiState.panels[mode];
  const lockAiDetails = mode === 'play' && settings.trainerLockAi;

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
        const currentOwnership = currentNode.analysis?.territory;
        const previousOwnership = currentNode.parent?.analysis?.territory;
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

  // Persist UI state.
  useEffect(() => {
    saveUiState(uiState);
  }, [uiState]);

  // Apply per-mode analysis controls to settings on mode changes (KaTrain-like).
  useEffect(() => {
    updateSettings(modeControls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Keep mode controls in sync if settings are changed elsewhere (e.g. Settings modal).
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

  // Auto-run analysis when in analysis mode.
  useEffect(() => {
    if (!isAnalysisMode) return;
    void runAnalysis();
  }, [currentNode.id, isAnalysisMode, runAnalysis]);

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

  useEffect(() => {
    const el = passBtnRef.current;
    if (!el) return;
    const update = () => setPassBtnHeight(el.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Close popovers on outside clicks.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-menu-popover]')) return;
      setAnalysisMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const toast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    useGameStore.setState({ notification: { message, type } });
    window.setTimeout(() => useGameStore.setState({ notification: null }), 2500);
  };

  // Keyboard shortcuts (KaTrain-like).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable);
      if (isTyping) return;

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;
      const keyLower = key.toLowerCase();

      const jumpBack = (n: number) => {
        for (let i = 0; i < n; i++) navigateBack();
      };
      const jumpForward = (n: number) => {
        for (let i = 0; i < n; i++) navigateForward();
      };

      const copySgfToClipboard = async () => {
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

      const pasteSgfFromClipboard = async () => {
        let text: string | null = null;
        try {
          text = await navigator.clipboard.readText();
        } catch {
          text = window.prompt('Paste SGF here:') ?? null;
        }
        if (!text) return;
        try {
          const parsed = parseSgf(text);
          loadGame(parsed);
          navigateEnd(); // KaTrain behavior: clipboard import goes to the end.
          toast('Loaded SGF from clipboard.', 'success');
        } catch {
          toast('Failed to parse SGF from clipboard.', 'error');
        }
      };

      if (ctrl && keyLower === 's') {
        e.preventDefault();
        downloadSgfFromTree(rootNode, sgfExportOptions);
        return;
      }
      if (ctrl && keyLower === 'l') {
        e.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if (ctrl && keyLower === 'c') {
        e.preventDefault();
        void copySgfToClipboard();
        return;
      }
      if (ctrl && keyLower === 'v') {
        e.preventDefault();
        void pasteSgfFromClipboard();
        return;
      }
      if (ctrl && keyLower === 'n') {
        e.preventDefault();
        resetGame();
        return;
      }

      if (key === 'Escape') {
        e.preventDefault();
        if (isSelectingRegionOfInterest) cancelSelectRegionOfInterest();
        analyzeExtra('stop');
        setIsSettingsOpen(false);
        setIsGameAnalysisOpen(false);
        setIsGameReportOpen(false);
        setAnalysisMenuOpen(false);
        setMenuOpen(false);
        return;
      }

      if (key === ' ' || key === 'Spacebar') {
        e.preventDefault();
        toggleContinuousAnalysis(shift);
        return;
      }

      if (keyLower === 'p') {
        e.preventDefault();
        passTurn();
        return;
      }

      if (keyLower === 'o') {
        e.preventDefault();
        rotateBoard();
        return;
      }

      if (keyLower === 'k') {
        e.preventDefault();
        updateSettings({ showCoordinates: !settings.showCoordinates });
        return;
      }
      if (keyLower === 'm') {
        e.preventDefault();
        updateSettings({ showMoveNumbers: !settings.showMoveNumbers });
        return;
      }

      if (keyLower === 'q') {
        e.preventDefault();
        updateSettings({ analysisShowChildren: !settings.analysisShowChildren });
        return;
      }
      if (keyLower === 'w') {
        e.preventDefault();
        updateSettings({ analysisShowEval: !settings.analysisShowEval });
        return;
      }
      if (keyLower === 'e') {
        e.preventDefault();
        if (!settings.analysisShowPolicy) updateSettings({ analysisShowHints: !settings.analysisShowHints });
        return;
      }
      if (keyLower === 'r') {
        e.preventDefault();
        updateSettings({ analysisShowPolicy: !settings.analysisShowPolicy });
        return;
      }
      if (keyLower === 't') {
        e.preventDefault();
        updateSettings({ analysisShowOwnership: !settings.analysisShowOwnership });
        return;
      }

      if (keyLower === 'a') {
        e.preventDefault();
        analyzeExtra('extra');
        return;
      }
      if (keyLower === 's') {
        e.preventDefault();
        analyzeExtra('equalize');
        return;
      }
      if (keyLower === 'd') {
        e.preventDefault();
        analyzeExtra('sweep');
        return;
      }
      if (keyLower === 'f') {
        e.preventDefault();
        analyzeExtra('alternative');
        return;
      }
      if (keyLower === 'g') {
        e.preventDefault();
        startSelectRegionOfInterest();
        return;
      }
      if (keyLower === 'h') {
        e.preventDefault();
        resetCurrentAnalysis();
        return;
      }
      if (keyLower === 'i') {
        e.preventDefault();
        toggleInsertMode();
        return;
      }
      if (keyLower === 'l') {
        e.preventDefault();
        selfplayToEnd();
        return;
      }

      if (keyLower === 'b') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        if (shift) undoToMainBranch();
        else undoToBranchPoint();
        return;
      }

      if (keyLower === 'n') {
        e.preventDefault();
        findMistake(shift ? 'undo' : 'redo');
        return;
      }

      if (key === 'Tab') {
        e.preventDefault();
        toggleAnalysisMode();
        return;
      }

      if (key === 'Home') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        navigateStart();
        return;
      }
      if (key === 'End') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        navigateEnd();
        return;
      }

      if (key === 'ArrowUp') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        switchBranch(-1);
        return;
      }
      if (key === 'ArrowDown') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        switchBranch(1);
        return;
      }

      if (key === 'ArrowLeft' || keyLower === 'z') {
        e.preventDefault();
        if (ctrl) navigateStart();
        else if (shift) jumpBack(10);
        else {
          if (mode === 'play') {
            const st = useGameStore.getState();
            const lastMover = st.currentNode.move?.player ?? null;
            const shouldUndoTwice = !!st.isAiPlaying && !!st.aiColor && lastMover === st.aiColor && st.currentPlayer !== st.aiColor;
            navigateBack();
            if (shouldUndoTwice) navigateBack();
          } else {
            navigateBack();
          }
        }
        return;
      }
      if (key === 'ArrowRight' || keyLower === 'x') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        if (ctrl) navigateEnd();
        else if (shift) jumpForward(10);
        else navigateForward();
        return;
      }

      if (key === 'PageUp') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        makeCurrentNodeMainBranch();
        return;
      }

      if (key === 'Enter') {
        e.preventDefault();
        makeAiMove();
        return;
      }

      if (key === 'F2') {
        e.preventDefault();
        setIsGameAnalysisOpen(true);
        return;
      }
      if (key === 'F3') {
        e.preventDefault();
        setIsGameReportOpen(true);
        return;
      }
      if (key === 'F8') {
        e.preventDefault();
        setIsSettingsOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    navigateBack,
    navigateForward,
    navigateStart,
    navigateEnd,
    toggleContinuousAnalysis,
    stopAnalysis,
    resetGame,
    passTurn,
    rotateBoard,
    mode,
    toggleAnalysisMode,
    updateSettings,
    settings.showCoordinates,
    settings.showMoveNumbers,
    settings.analysisShowChildren,
    settings.analysisShowEval,
    settings.analysisShowHints,
    settings.analysisShowPolicy,
    settings.analysisShowOwnership,
    makeAiMove,
    rootNode,
    loadGame,
    findMistake,
    analyzeExtra,
    resetCurrentAnalysis,
    startSelectRegionOfInterest,
    cancelSelectRegionOfInterest,
    isSelectingRegionOfInterest,
    isInsertMode,
    toggleInsertMode,
    selfplayToEnd,
    stopSelfplayToEnd,
    switchBranch,
    undoToBranchPoint,
    undoToMainBranch,
    makeCurrentNodeMainBranch,
    sgfExportOptions,
  ]);

  const engineDot = useMemo(() => {
    if (engineStatus === 'loading') return 'bg-yellow-400';
    if (engineStatus === 'ready') return 'bg-green-400';
    if (engineStatus === 'error') return 'bg-red-500';
    return 'bg-gray-500';
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

  const renderPlayerInfo = (player: Player) => {
    const isTurn = currentPlayer === player;
    const isAi = isAiPlaying && aiColor === player;
    const caps = player === 'black' ? capturedWhite : capturedBlack;

    return (
      <div
        className={[
          'flex-1 rounded border px-3 py-2 flex items-center gap-3',
          isTurn ? 'bg-gray-700 border-gray-500' : 'bg-gray-900 border-gray-700',
        ].join(' ')}
      >
        <div
          className={[
            'h-10 w-10 rounded-full flex items-center justify-center font-bold',
            player === 'black' ? 'bg-black text-white border border-gray-600' : 'bg-white text-black border border-gray-400',
          ].join(' ')}
          title={player === 'black' ? 'Black' : 'White'}
        >
          {caps}
        </div>
        <div className="flex flex-col leading-tight">
          <div className="text-xs text-gray-400">{player === 'black' ? 'Black' : 'White'}</div>
          <div className="text-sm font-semibold text-gray-100">{isAi ? 'AI' : 'Human'}</div>
        </div>
        {isTurn && <div className="ml-auto text-xs font-mono text-gray-200">to play</div>}
      </div>
    );
  };

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

  const updatePanels = (partial: Partial<UiState['panels'][UiMode]>) => {
    setUiState((prev) => ({
      ...prev,
      panels: { ...prev.panels, [prev.mode]: { ...prev.panels[prev.mode], ...partial } },
    }));
  };

  const openSettings = () => setIsSettingsOpen(true);

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

  const jumpBack = (n: number) => {
    for (let i = 0; i < n; i++) navigateBack();
  };
  const jumpForward = (n: number) => {
    for (let i = 0; i < n; i++) navigateForward();
  };

  const isAiBlack = isAiPlaying && aiColor === 'black';
  const isAiWhite = isAiPlaying && aiColor === 'white';

  return (
    <div className="flex h-screen bg-gray-900 text-gray-200 font-sans overflow-hidden">
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      {isGameAnalysisOpen && <GameAnalysisModal onClose={() => setIsGameAnalysisOpen(false)} />}
      {isGameReportOpen && <GameReportModal onClose={() => setIsGameReportOpen(false)} />}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".sgf" />

      {/* Hamburger drawer (KaTrain-like) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 bg-gray-800 border-r border-gray-700 shadow-xl p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Menu</div>
              <button className="text-gray-400 hover:text-white" onClick={() => setMenuOpen(false)}>
                <FaTimes />
              </button>
            </div>

            <div className="space-y-1">
              <button
                className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700"
                onClick={() => {
                  resetGame();
                  setMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaPlay /> New Game
                </span>
                <span className="text-xs text-gray-400">Ctrl+N</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700"
                onClick={() => {
                  downloadSgfFromTree(rootNode, sgfExportOptions);
                  setMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaSave /> Save SGF
                </span>
                <span className="text-xs text-gray-400">Ctrl+S</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700"
                onClick={() => {
                  handleLoadClick();
                  setMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaFolderOpen /> Load SGF
                </span>
                <span className="text-xs text-gray-400">Ctrl+L</span>
              </button>
              <button
                className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-700"
                onClick={() => {
                  openSettings();
                  setMenuOpen(false);
                }}
              >
                <span className="flex items-center gap-2">
                  <FaCog /> Settings
                </span>
                <span className="text-xs text-gray-400">F8</span>
              </button>
            </div>

            <div className="mt-4 border-t border-gray-700 pt-3 space-y-2">
              <div className="text-xs text-gray-400">Play vs AI</div>
              <div className="flex gap-2">
                <button
                  className={[
                    'flex-1 px-3 py-2 rounded border text-sm font-semibold',
                    isAiWhite ? 'bg-gray-700 border-gray-500 text-green-300' : 'bg-gray-900 border-gray-700 hover:bg-gray-700',
                  ].join(' ')}
                  onClick={() => toggleAi('white')}
                >
                  White AI
                </button>
                <button
                  className={[
                    'flex-1 px-3 py-2 rounded border text-sm font-semibold',
                    isAiBlack ? 'bg-gray-700 border-gray-500 text-green-300' : 'bg-gray-900 border-gray-700 hover:bg-gray-700',
                  ].join(' ')}
                  onClick={() => toggleAi('black')}
                >
                  Black AI
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main board column */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Analysis controls bar (KaTrain-like) */}
        <div className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-3 select-none">
          <IconButton title="Menu" onClick={() => setMenuOpen(true)}>
            <FaBars />
          </IconButton>

          <div className="flex items-center gap-2 overflow-x-auto">
            <TogglePill
              label="Children"
              shortcut="Q"
              active={settings.analysisShowChildren}
              onToggle={() => updateControls({ analysisShowChildren: !settings.analysisShowChildren })}
            />
            <TogglePill
              label="Dots"
              shortcut="W"
              active={settings.analysisShowEval}
              onToggle={() => updateControls({ analysisShowEval: !settings.analysisShowEval })}
            />
            <TogglePill
              label="Top Moves"
              shortcut="E"
              active={settings.analysisShowHints}
              disabled={settings.analysisShowPolicy}
              onToggle={() => updateControls({ analysisShowHints: !settings.analysisShowHints })}
            />
            <TogglePill
              label="Policy"
              shortcut="R"
              active={settings.analysisShowPolicy}
              onToggle={() => updateControls({ analysisShowPolicy: !settings.analysisShowPolicy })}
            />
            <TogglePill
              label="Territory"
              shortcut="T"
              active={settings.analysisShowOwnership}
              onToggle={() => updateControls({ analysisShowOwnership: !settings.analysisShowOwnership })}
            />
          </div>

          <div className="flex-grow" />

          <div className="flex items-center gap-2">
            {regionOfInterest && (
              <button
                type="button"
                className="px-2 py-1 rounded border bg-green-900/30 border-green-600 text-green-200 text-xs font-semibold hover:bg-green-900/50"
                title="Region of interest active (click to clear)"
                onClick={() => setRegionOfInterest(null)}
              >
                ROI
              </button>
            )}
            {isInsertMode && (
              <div className="px-2 py-1 rounded border bg-purple-900/30 border-purple-600 text-purple-200 text-xs font-semibold">
                Insert
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <IconButton
              title="Open side panel"
              onClick={() => setRightPanelOpen(true)}
              className="lg:hidden"
            >
              <FaChevronLeft />
            </IconButton>
            <button
              type="button"
              className={[
                'px-3 py-2 rounded border text-sm font-semibold flex items-center gap-2',
                isAnalysisMode ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-700',
              ].join(' ')}
              title="Toggle analysis mode (Tab)"
              onClick={toggleAnalysisMode}
            >
              <span className={['inline-block h-2.5 w-2.5 rounded-full', engineDot].join(' ')} />
              Analyze
            </button>

            <div className="relative" data-menu-popover>
              <button
                type="button"
                className="px-3 py-2 rounded border bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-700 flex items-center gap-2"
                onClick={() => setAnalysisMenuOpen((v) => !v)}
                title="Analysis actions"
              >
                Actions <FaChevronDown className="opacity-80" />
              </button>
              {analysisMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-gray-800 border border-gray-700 rounded shadow-xl overflow-hidden z-50">
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      analyzeExtra('extra');
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Extra analysis
                    </span>
                    <span className="text-xs text-gray-400">A</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      analyzeExtra('equalize');
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Equalize
                    </span>
                    <span className="text-xs text-gray-400">S</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      analyzeExtra('sweep');
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Sweep
                    </span>
                    <span className="text-xs text-gray-400">D</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      analyzeExtra('alternative');
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Alternative
                    </span>
                    <span className="text-xs text-gray-400">F</span>
                  </button>

                  <div className="h-px bg-gray-700 my-1" />

                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      startSelectRegionOfInterest();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Select region
                    </span>
                    <span className="text-xs text-gray-400">G</span>
                  </button>
                  {regionOfInterest && (
                    <button
                      className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                      onClick={() => {
                        setRegionOfInterest(null);
                        setAnalysisMenuOpen(false);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <FaTimes /> Clear region
                      </span>
                      <span className="text-xs text-gray-400">—</span>
                    </button>
                  )}

                  <div className="h-px bg-gray-700 my-1" />

                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      resetCurrentAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaStop /> Reset analysis
                    </span>
                    <span className="text-xs text-gray-400">H</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      toggleInsertMode();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaPlay /> Insert mode
                    </span>
                    <span className="text-xs text-gray-400">I {isInsertMode ? 'on' : 'off'}</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      selfplayToEnd();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaPlay /> Selfplay to end
                    </span>
                    <span className="text-xs text-gray-400">L</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
                      else startQuickGameAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> {isGameAnalysisRunning && gameAnalysisType === 'quick' ? 'Stop quick analysis' : 'Analyze game (quick graph)'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {isGameAnalysisRunning && gameAnalysisType === 'quick' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}
                    </span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis();
                      else startFastGameAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> {isGameAnalysisRunning && gameAnalysisType === 'fast' ? 'Stop fast analysis' : 'Analyze game (fast MCTS)'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {isGameAnalysisRunning && gameAnalysisType === 'fast' ? `${gameAnalysisDone}/${gameAnalysisTotal}` : '—'}
                    </span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      setIsGameAnalysisOpen(true);
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Re-analyze game…
                    </span>
                    <span className="text-xs text-gray-400">F2</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      setIsGameReportOpen(true);
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Game report…
                    </span>
                    <span className="text-xs text-gray-400">F3</span>
                  </button>

                  <div className="h-px bg-gray-700 my-1" />

                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      toggleContinuousAnalysis();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Continuous analysis
                    </span>
                    <span className="text-xs text-gray-400">Space</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      makeAiMove();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaPlay /> AI move
                    </span>
                    <span className="text-xs text-gray-400">Enter</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      analyzeExtra('stop');
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaStop /> Stop analysis
                    </span>
                    <span className="text-xs text-gray-400">Esc</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      rotateBoard();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaSyncAlt /> Rotate board
                    </span>
                    <span className="text-xs text-gray-400">O</span>
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center justify-between"
                    onClick={() => {
                      toggleTeachMode();
                      setAnalysisMenuOpen(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <FaRobot /> Teach mode
                    </span>
                    <span className="text-xs text-gray-400">{isTeachMode ? 'on' : 'off'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 flex items-center justify-center bg-gray-900 overflow-auto p-4 relative">
          {notification && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded shadow-lg flex items-center space-x-4 bg-gray-800 border border-gray-700">
              <span>{notification.message}</span>
              <button onClick={clearNotification} className="hover:text-gray-200">
                <FaTimes />
              </button>
            </div>
          )}
          <GoBoard hoveredMove={hoveredMove} onHoverMove={setHoveredMove} pvUpToMove={pvUpToMove} uiMode={mode} />
        </div>

        {/* Board controls bar (KaTrain-like) */}
        <div className="h-16 bg-gray-800 border-t border-gray-700 flex items-center px-3 justify-between select-none">
          <div className="relative">
            {passPolicyColor && (
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
                style={{ height: '100%', aspectRatio: '1 / 1', backgroundColor: passPolicyColor }}
              />
            )}
	            <button
	              ref={passBtnRef}
	              className="relative px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-semibold"
	              onClick={passTurn}
	              title="Pass (P)"
	            >
	              Pass
	            </button>
	            {passPv && (
	              <div
	                className="absolute pointer-events-none flex items-center justify-center"
	                style={{
	                  left: '100%',
	                  top: '50%',
	                  width: passBtnHeight > 0 ? passBtnHeight : 32,
	                  height: passBtnHeight > 0 ? passBtnHeight : 32,
	                  transform: 'translate(0, -50%)',
	                  zIndex: 20,
	                }}
	              >
	                <div
	                  className="absolute inset-0"
	                  style={{
	                    backgroundImage: `url('/katrain/${passPv.player === 'black' ? 'B_stone.png' : 'W_stone.png'}')`,
	                    backgroundSize: 'contain',
	                    backgroundPosition: 'center',
	                    backgroundRepeat: 'no-repeat',
	                  }}
	                />
	                <div
	                  className="font-bold"
	                  style={{
	                    color: passPv.player === 'black' ? 'white' : 'black',
	                    fontSize: passBtnHeight > 0 ? passBtnHeight / (2 * STONE_SIZE * 1.45) : 14,
	                    lineHeight: 1,
	                  }}
	                >
	                  {passPv.idx}
	                </div>
	              </div>
	            )}
	          </div>

          <div className="flex items-center gap-1">
            <IconButton
              title="Previous mistake (N)"
              onClick={() => findMistake('undo')}
              disabled={isInsertMode}
              className="text-red-300"
            >
              <FaExclamationTriangle />
            </IconButton>
            <IconButton title="Start (Home)" onClick={navigateStart} disabled={isInsertMode}>
              <FaStepBackward />
            </IconButton>
            <IconButton title="Back 10 (Shift+←)" onClick={() => jumpBack(10)} disabled={isInsertMode}>
              <FaFastBackward />
            </IconButton>
            <IconButton title="Back (←)" onClick={navigateBack}>
              <FaChevronLeft />
            </IconButton>

            <div className="px-3 text-sm text-gray-300 font-mono flex items-center gap-2">
              <span className={currentPlayer === 'black' ? 'text-white' : 'text-gray-500'}>B</span>
              <span className="text-gray-500">·</span>
              <span className={currentPlayer === 'white' ? 'text-white' : 'text-gray-500'}>W</span>
              <span className="text-gray-500 ml-2">Move</span>
              <span className="text-white">{moveHistory.length}</span>
            </div>

            <IconButton title="Forward (→)" onClick={navigateForward} disabled={isInsertMode}>
              <FaChevronRight />
            </IconButton>
            <IconButton title="Forward 10 (Shift+→)" onClick={() => jumpForward(10)} disabled={isInsertMode}>
              <FaFastForward />
            </IconButton>
            <IconButton title="End (End)" onClick={navigateEnd} disabled={isInsertMode}>
              <FaStepForward />
            </IconButton>
            <IconButton
              title="Next mistake (Shift+N)"
              onClick={() => findMistake('redo')}
              disabled={isInsertMode}
              className="text-red-300"
            >
              <FaExclamationTriangle />
            </IconButton>
            <IconButton title="Rotate (O)" onClick={rotateBoard}>
              <FaSyncAlt />
            </IconButton>
          </div>

          <button
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-semibold"
            onClick={() => makeAiMove()}
            title="AI move (Enter)"
          >
            AI Move
          </button>
        </div>
      </div>

      {/* Right side panel (KaTrain-like) */}
      {rightPanelOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setRightPanelOpen(false)}
        />
      )}
      <div
        className={[
          'bg-gray-800 border-l border-gray-700 flex flex-col',
          'fixed inset-y-0 right-0 z-40 w-full max-w-md',
          rightPanelOpen ? 'flex' : 'hidden',
          'lg:static lg:flex lg:w-96 lg:max-w-none lg:z-auto',
        ].join(' ')}
      >
        {/* Play / Analyze tabs */}
        <div className="h-14 border-b border-gray-700 flex items-center p-2 gap-2">
          <button
            type="button"
            className="lg:hidden h-10 w-10 flex items-center justify-center rounded hover:bg-gray-700 text-gray-300 hover:text-white"
            onClick={() => setRightPanelOpen(false)}
            title="Close side panel"
          >
            <FaTimes />
          </button>
          <button
            className={[
              'flex-1 h-10 rounded font-semibold border',
              mode === 'play' ? 'bg-blue-600/30 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white',
            ].join(' ')}
            onClick={() => setMode('play')}
          >
            Play
          </button>
          <button
            className={[
              'flex-1 h-10 rounded font-semibold border',
              mode === 'analyze'
                ? 'bg-blue-600/30 border-blue-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white',
            ].join(' ')}
            onClick={() => setMode('analyze')}
          >
            Analysis
          </button>
        </div>

        {/* Players */}
        <div className="p-3 flex gap-2">{renderPlayerInfo('black')}{renderPlayerInfo('white')}</div>

        {/* Timer / MoveTree area */}
        <div className="px-3 pb-3">
          {mode === 'play' ? (
            <div className="bg-gray-900 border border-gray-700 rounded p-3">
              <Timer />
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-400">Komi</div>
                <div className="font-mono text-sm text-gray-200">{komi}</div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className="text-xs text-gray-400">Captured</div>
                <div className="font-mono text-sm text-gray-200">
                  B:{capturedWhite} · W:{capturedBlack}
                </div>
              </div>
              {endResult && (
                <div className="flex items-center justify-between mt-1">
                  <div className="text-xs text-gray-400">Result</div>
                  <div className="font-mono text-sm text-gray-200">{endResult}</div>
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-semibold"
                  onClick={() => {
                    const st = useGameStore.getState();
                    const lastMover = st.currentNode.move?.player ?? null;
                    const shouldUndoTwice = !!st.isAiPlaying && !!st.aiColor && lastMover === st.aiColor && st.currentPlayer !== st.aiColor;
                    navigateBack();
                    if (shouldUndoTwice) navigateBack();
                  }}
                  title="Undo (←)"
                >
                  Undo
                </button>
                <button
                  className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-semibold"
                  onClick={() => {
                    const result = currentPlayer === 'black' ? 'W+R' : 'B+R';
                    resign();
                    toast(`Result: ${result}`, 'info');
                  }}
                >
                  Resign
                </button>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  className={[
                    'flex-1 px-3 py-2 rounded border text-sm font-semibold',
                    isAiWhite ? 'bg-gray-700 border-gray-500 text-green-300' : 'bg-gray-900 border-gray-700 hover:bg-gray-700',
                  ].join(' ')}
                  onClick={() => toggleAi('white')}
                >
                  White AI
                </button>
                <button
                  className={[
                    'flex-1 px-3 py-2 rounded border text-sm font-semibold',
                    isAiBlack ? 'bg-gray-700 border-gray-500 text-green-300' : 'bg-gray-900 border-gray-700 hover:bg-gray-700',
                  ].join(' ')}
                  onClick={() => toggleAi('black')}
                >
                  Black AI
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-700 rounded overflow-hidden h-44">
              <MoveTree />
            </div>
          )}
        </div>

        {/* Graph panel */}
        <div className="px-3">
          <div className="flex items-center justify-between">
            <button
              className="text-sm font-semibold text-gray-200 hover:text-white"
              onClick={() => updatePanels({ graphOpen: !modePanels.graphOpen })}
            >
              Score / Winrate Graph
            </button>
            <div className="flex gap-1">
              <PanelHeaderButton
                label="Score"
                colorClass="bg-blue-600/30"
                active={modePanels.graph.score}
                onClick={() =>
                  updatePanels({ graph: { ...modePanels.graph, score: !modePanels.graph.score } })
                }
              />
              <PanelHeaderButton
                label="Win%"
                colorClass="bg-green-600/30"
                active={modePanels.graph.winrate}
                onClick={() =>
                  updatePanels({ graph: { ...modePanels.graph, winrate: !modePanels.graph.winrate } })
                }
              />
            </div>
          </div>
          {modePanels.graphOpen && (
            <div className="mt-2 bg-gray-900 border border-gray-700 rounded p-2">
              {modePanels.graph.score || modePanels.graph.winrate ? (
                <div style={{ height: 140 }}>
                  <ScoreWinrateGraph showScore={modePanels.graph.score} showWinrate={modePanels.graph.winrate} />
                </div>
              ) : (
                <div className="h-20 flex items-center justify-center text-gray-500 text-sm">Graph hidden</div>
              )}
            </div>
          )}
        </div>

        {/* Stats panel */}
        <div className="px-3 mt-3">
          <div className="flex items-center justify-between">
            <button
              className="text-sm font-semibold text-gray-200 hover:text-white"
              onClick={() => updatePanels({ statsOpen: !modePanels.statsOpen })}
            >
              Move Stats
            </button>
            <div className="flex gap-1">
              <PanelHeaderButton
                label="Score"
                colorClass="bg-blue-600/30"
                active={modePanels.stats.score}
                onClick={() =>
                  updatePanels({ stats: { ...modePanels.stats, score: !modePanels.stats.score } })
                }
              />
              <PanelHeaderButton
                label="Win%"
                colorClass="bg-green-600/30"
                active={modePanels.stats.winrate}
                onClick={() =>
                  updatePanels({ stats: { ...modePanels.stats, winrate: !modePanels.stats.winrate } })
                }
              />
              <PanelHeaderButton
                label="Pts"
                colorClass="bg-red-600/30"
                active={modePanels.stats.points}
                onClick={() =>
                  updatePanels({ stats: { ...modePanels.stats, points: !modePanels.stats.points } })
                }
              />
            </div>
          </div>
          {modePanels.statsOpen && (
            <div className="mt-2 bg-gray-900 border border-gray-700 rounded overflow-hidden">
              {modePanels.stats.winrate && (
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <div className="text-sm text-gray-300">Winrate</div>
                  <div className="font-mono text-sm text-green-300">
                    {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
                  </div>
                </div>
              )}
              {modePanels.stats.score && (
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                  <div className="text-sm text-gray-300">Score</div>
                  <div className="font-mono text-sm text-blue-300">
                    {typeof scoreLead === 'number' ? `${scoreLead > 0 ? '+' : ''}${scoreLead.toFixed(1)}` : '-'}
                  </div>
                </div>
              )}
              {modePanels.stats.points && (
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="text-sm text-gray-300">{pointsLost != null && pointsLost < 0 ? 'Points gained' : 'Points lost'}</div>
                  <div className="font-mono text-sm text-red-300">{pointsLost != null ? Math.abs(pointsLost).toFixed(1) : '-'}</div>
                </div>
              )}
              {!modePanels.stats.winrate && !modePanels.stats.score && !modePanels.stats.points && (
                <div className="px-3 py-3 text-sm text-gray-500">Stats hidden</div>
              )}
            </div>
          )}
        </div>

        {/* Notes panel */}
        <div className="px-3 mt-3 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between">
            <button
              className="text-sm font-semibold text-gray-200 hover:text-white"
              onClick={() => updatePanels({ notesOpen: !modePanels.notesOpen })}
            >
              Info & Notes
            </button>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <PanelHeaderButton
                  label="Info"
                  colorClass="bg-gray-700"
                  active={modePanels.notes.info}
                  onClick={() => updatePanels({ notes: { ...modePanels.notes, info: !modePanels.notes.info } })}
                />
                <PanelHeaderButton
                  label="Details"
                  colorClass="bg-gray-700"
                  active={modePanels.notes.infoDetails}
                  onClick={() =>
                    updatePanels({ notes: { ...modePanels.notes, infoDetails: !modePanels.notes.infoDetails } })
                  }
                />
                <PanelHeaderButton
                  label="Notes"
                  colorClass="bg-purple-600/30"
                  active={modePanels.notes.notes}
                  onClick={() => updatePanels({ notes: { ...modePanels.notes, notes: !modePanels.notes.notes } })}
                />
              </div>
              <div className="text-[11px] text-gray-400 font-mono flex items-center gap-2">
                <span className={['inline-block h-2.5 w-2.5 rounded-full', engineDot].join(' ')} />
                <span title={engineMetaTitle}>{engineMeta}</span>
              </div>
            </div>
          </div>
          {modePanels.notesOpen && (
            <div className="mt-2 bg-gray-900 border border-gray-700 rounded flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-gray-800 text-xs text-gray-300 flex items-center justify-between">
                <div className="truncate">
                  <span className="font-mono">{playerToShort(currentPlayer)}</span> ·{' '}
                  <span className="font-mono">{moveHistory.length}</span> ·{' '}
                  <span className="font-mono">{currentNode.move ? formatMoveLabel(currentNode.move.x, currentNode.move.y) : 'Root'}</span>
                </div>
                {engineError && <span className="text-red-300">error</span>}
              </div>
              <div className="px-3 py-2 border-b border-gray-800 text-xs text-gray-400">
                {statusText}
              </div>
              <div className="flex-1 min-h-0">
                <NotesPanel
                  showInfo={modePanels.notes.info || modePanels.notes.infoDetails}
                  detailed={modePanels.notes.infoDetails && !lockAiDetails}
                  showNotes={modePanels.notes.notes}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

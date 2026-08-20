import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './dashboard.css';
import { Icon, type IconName } from './icons';
import type { GameNode, GameRules, GameSettings, Player } from '../../types';
import type { BranchInfo } from '../../utils/branchNavigation';
import type { LibraryFile } from '../../utils/library';
import type { AnalysisControlsState } from '../layout/types';
import { formatMoveLabel } from '../layout/ui-utils';
import { MoveTree } from '../MoveTree';
import { ScoreWinrateGraph } from '../ScoreWinrateGraph';
import { NotesPanel } from '../NotesPanel';
import { Timer } from '../Timer';
import { LanguageSwitcher } from '../layout/LanguageSwitcher';
import { getDashboardLayoutMode, type DashboardLayoutMode } from '../../utils/dashboardLayout';
import { LIBRARY_OPEN_STORAGE_KEY } from '../../utils/layoutPreferences';
import { readLocalStorage, writeLocalStorage } from '../../utils/storage';
import { APP_BUILD_LABEL, APP_COMMIT_URL, APP_ISSUE_REPORT_URL } from '../../utils/appInfo';
import { formatEngineBackendLabel } from '../../utils/engineStatusSummary';
import { ANALYSIS_VISIT_PRESETS, clampAnalysisVisits, visitPresetLabel } from '../../utils/visitPresets';
import { formatRulesLabel } from '../../utils/gameInfoDisplay';
import { formatReadableScoreLead, formatWinRateFavorLabel } from '../../utils/analysisSummary';

type EngineState = 'ready' | 'running' | 'loading' | 'error';

export interface DesktopDashboardProps {
  // ---- slots (heavy components, read from the store themselves) ----
  board: React.ReactNode;
  boardControls?: React.ReactNode;

  // ---- game meta ----
  blackName: string;
  whiteName: string;
  blackRank: string;
  whiteRank: string;
  capturedBlack: number;
  capturedWhite: number;
  komi: number;
  boardSize: number;
  handicap: number;
  rules: GameRules;
  result: string | null;
  currentPlayer: Player;
  moveCount: number;
  totalMoves: number;
  loadedFileName: string | null;
  dirty: boolean;
  currentNode: GameNode;
  branchInfo: BranchInfo;

  // ---- analysis ----
  showAnalysis: boolean;
  winRate: number | null;
  scoreLead: number | null;
  pointsLost: number | null;
  pointsLostLabel: string | null;

  // ---- engine ----
  engineState: EngineState;
  enginePillLabel: string;
  engineMeta: string;
  engineMetaTitle: string;
  engineBackend: string;
  engineModelLabel: string;
  analysisCacheSize: number;

  // ---- modes / settings ----
  mode: 'play' | 'analyze';
  setMode: (m: 'play' | 'analyze') => void;
  isContinuousAnalysis: boolean;
  toggleContinuousAnalysis: () => void;
  settings: GameSettings;
  updateControls: (partial: Partial<AnalysisControlsState>) => void;
  updateSettings: (partial: Partial<GameSettings>) => void;
  isInsertMode: boolean;
  toggleInsertMode: () => void;
  isSelectingRegionOfInterest: boolean;
  startSelectRegionOfInterest: () => void;

  // ---- panel open state (owned by Layout for keyboard shortcuts) ----
  libraryOpen: boolean;
  setLibraryOpen: (open: boolean) => void;
  libraryPanel?: React.ReactNode;
  libraryWidth?: number;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  focusMode?: boolean;

  // ---- game analysis ----
  isGameAnalysisRunning: boolean;
  gameAnalysisType: string | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
  startQuickGameAnalysis: () => void;
  startFastGameAnalysis: () => void;
  stopGameAnalysis: () => void;
  onClearAnalysisCache: () => void;
  onOpenGameReport: () => void;

  // ---- navigation / play ----
  navigateBack: () => void;
  navigateForward: () => void;
  navigateStart: () => void;
  navigateEnd: () => void;
  navigateToMove: (n: number) => void;
  jumpBack: () => void;
  jumpForward: () => void;
  findMistake: (dir: 1 | -1) => void;
  rotateBoard: () => void;
  switchBranch: (dir: 1 | -1) => void;
  undoToBranchPoint: () => void;
  makeCurrentNodeMainBranch: () => void;
  passTurn: () => void;
  onUndo: () => void;
  onAiMove: () => void;
  onResign: () => void;
  onPlayBest: () => void;

  // ---- file / header actions ----
  onNewGame: () => void;
  onSaveSgf: () => void;
  onCopySgf: () => void;
  onSaveToLibrary: () => void;
  onLoadSgf: () => void;
  onPasteSgf: () => void;
  onScanBoard: () => void;
  onSettings: () => void;
  onCommandPalette: () => void;
  onKeyboardHelp: () => void;
  onAbout: () => void;

  // ---- library ----
  recentItems: LibraryFile[];
  loadedFileId: string | null;
  onOpenRecent: (item: LibraryFile) => void;

  toast: (message: string, type?: 'info' | 'error' | 'success') => void;
}

function evalColorForPointsLost(pl: number): string {
  if (pl >= 5) return 'var(--eval-blunder)';
  if (pl >= 2) return 'var(--eval-mistake)';
  if (pl >= 1) return 'var(--eval-inaccuracy)';
  if (pl >= 0.5) return 'var(--eval-slight)';
  if (pl >= 0.1) return 'var(--eval-good)';
  return 'var(--eval-best)';
}

function formatVisitCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n / 1_000_000)}M`;
}

type PopoverId = 'engine' | 'view' | 'file' | 'help' | null;
type PopoverInputMode = 'pointer' | 'keyboard';

const HERO_DISMISSED_KEY = 'wk-getting-started-dismissed';
type DashboardOverlayKey = keyof Pick<
  GameSettings,
  'analysisShowChildren' | 'analysisShowEval' | 'analysisShowHints' | 'analysisShowPolicy' | 'analysisShowOwnership'
>;

const DASHBOARD_OVERLAY_NAMES: Record<DashboardOverlayKey, string> = {
  analysisShowChildren: 'child move markers',
  analysisShowEval: 'move evaluation dots',
  analysisShowHints: 'top move hints',
  analysisShowPolicy: 'move heatmap',
  analysisShowOwnership: 'territory ownership',
};

export const DesktopDashboard: React.FC<DesktopDashboardProps> = (props) => {
  const {
    board,
    boardControls,
    blackName, whiteName, blackRank, whiteRank,
    capturedBlack, capturedWhite, komi, boardSize, handicap, rules, result,
    currentPlayer, moveCount, totalMoves, loadedFileName, dirty, currentNode, branchInfo,
    showAnalysis, winRate, scoreLead, pointsLost, pointsLostLabel,
    engineState, enginePillLabel, engineMetaTitle, engineBackend, engineModelLabel, analysisCacheSize,
    mode, setMode, isContinuousAnalysis, toggleContinuousAnalysis,
    settings, updateControls, updateSettings,
    isInsertMode, toggleInsertMode, isSelectingRegionOfInterest, startSelectRegionOfInterest,
    libraryOpen, setLibraryOpen, libraryPanel, libraryWidth, sidebarOpen, setSidebarOpen, focusMode = false,
    isGameAnalysisRunning, gameAnalysisType, gameAnalysisDone, gameAnalysisTotal,
    startQuickGameAnalysis, startFastGameAnalysis, stopGameAnalysis, onClearAnalysisCache, onOpenGameReport,
    navigateBack, navigateForward, navigateStart, navigateEnd, navigateToMove,
    jumpBack, jumpForward, findMistake, rotateBoard, switchBranch, undoToBranchPoint, makeCurrentNodeMainBranch,
    passTurn, onUndo, onAiMove, onResign, onPlayBest,
    onNewGame, onSaveSgf, onCopySgf, onSaveToLibrary, onLoadSgf, onPasteSgf, onScanBoard,
    onSettings, onCommandPalette, onKeyboardHelp, onAbout,
    recentItems, loadedFileId, onOpenRecent,
    toast,
  } = props;
  const rulesLabel = formatRulesLabel(rules);

  const [sections, setSections] = useState({ tree: true, analysis: true, notes: true });
  // Top game-info strip and bottom metrics bar collapse like the side panels so
  // the board can take the full column; reopen handles mirror the edge toggles.
  const [gamestripOpen, setGamestripOpen] = useState(() => {
    return readLocalStorage('web-katrain:dash_gamestrip_open:v1') !== 'false';
  });
  const [commandbarOpen, setCommandbarOpen] = useState(() => {
    return readLocalStorage('web-katrain:dash_commandbar_open:v1') !== 'false';
  });
  useEffect(() => {
    writeLocalStorage('web-katrain:dash_gamestrip_open:v1', String(gamestripOpen));
  }, [gamestripOpen]);
  useEffect(() => {
    writeLocalStorage('web-katrain:dash_commandbar_open:v1', String(commandbarOpen));
  }, [commandbarOpen]);
  // The command bar only holds live analysis metrics, so it stays out of the way
  // entirely while analysis is off — engine state, captures and the "analysis is
  // off" prompt already live in the header pill, the gamestrip and the sidebar.
  const commandbarVisible = commandbarOpen && showAnalysis;
  // Three states, not two, because the stage reads this to decide whether to
  // hold the bar's footprint: "reserved" means the bar is hidden only because
  // analysis is off, so the board keeps its size across a Tab. "closed" means
  // the user collapsed the bar and wants that space for the board.
  const commandbarState = commandbarVisible ? 'open' : commandbarOpen ? 'reserved' : 'closed';
  const [legend, setLegend] = useState({ winrate: true, score: true });
  const [legendOpen, setLegendOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [layoutMode, setLayoutMode] = useState<DashboardLayoutMode>(() => {
    if (typeof window === 'undefined') return 'wide';
    return getDashboardLayoutMode(window.innerWidth);
  });
  const [initialWideLibraryOpen] = useState(() => {
    const stored = readLocalStorage(LIBRARY_OPEN_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return libraryOpen;
  });
  const layoutModeRef = useRef<DashboardLayoutMode>(layoutMode);
  const libraryOpenRef = useRef(libraryOpen);
  const wideLibraryOpenRef = useRef(initialWideLibraryOpen);
  const [pop, setPop] = useState<{ id: PopoverId; rect: DOMRect; inputMode: PopoverInputMode } | null>(null);
  const popTriggerRef = useRef<HTMLElement | null>(null);
  const [moveInputDraft, setMoveInputDraft] = useState<string | null>(null);
  const moveInputValue = moveInputDraft ?? String(moveCount);

  // ---- first-run hero ----
  const [heroDismissed, setHeroDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(HERO_DISMISSED_KEY) === 'true';
    } catch {
      return true;
    }
  });
  const dismissHero = useCallback(() => {
    setHeroDismissed(true);
    try {
      window.localStorage.setItem(HERO_DISMISSED_KEY, 'true');
    } catch {
      // ignore storage failures
    }
  }, []);
  // Only on a fresh, untouched game: the board stays playable underneath, and
  // the card hides itself as soon as a move exists or the game has edits.
  const showHero = !heroDismissed && totalMoves === 0 && !dirty;

  useEffect(() => {
    libraryOpenRef.current = libraryOpen;
    if (layoutMode === 'wide') {
      wideLibraryOpenRef.current = libraryOpen;
    }
  }, [layoutMode, libraryOpen]);

  // ---- responsive mode ----
  useEffect(() => {
    const apply = () => {
      const nextMode = getDashboardLayoutMode(window.innerWidth);
      const previousMode = layoutModeRef.current;
      layoutModeRef.current = nextMode;
      setLayoutMode(nextMode);
      if (nextMode === previousMode) return;
      if (previousMode === 'wide') {
        wideLibraryOpenRef.current = libraryOpenRef.current;
      }
      setLibraryOpen(nextMode === 'wide' ? wideLibraryOpenRef.current : false);
    };
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [setLibraryOpen]);

  const libDrawer = layoutMode !== 'wide';
  const sideDrawer = layoutMode === 'narrow';
  const drawerOpen = (libDrawer && libraryOpen) || (sideDrawer && sidebarOpen);

  const gridTemplateColumns = useMemo(() => {
    const libCol = (!libDrawer && libraryOpen) ? 'var(--library-w)' : '0px';
    const sideCol = (!sideDrawer && sidebarOpen) ? 'var(--sidebar-w)' : '0px';
    return `${libCol} minmax(0,1fr) ${sideCol}`;
  }, [libDrawer, libraryOpen, sideDrawer, sidebarOpen]);
  const dashboardStyle = libraryWidth
    ? ({ '--library-w': `${libraryWidth}px` } as React.CSSProperties)
    : undefined;

  const toggleLibrary = () => {
    const next = !libraryOpen;
    setLibraryOpen(next);
    if (next && layoutMode === 'narrow') setSidebarOpen(false);
  };
  const toggleSidebar = () => {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    if (next && layoutMode === 'narrow') setLibraryOpen(false);
  };

  // ---- popovers ----
  const openPop = (id: Exclude<PopoverId, null>, e: React.MouseEvent) => {
    if (pop?.id === id) {
      setPop(null);
      return;
    }
    popTriggerRef.current = e.currentTarget as HTMLElement;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPop({ id, rect, inputMode: e.detail === 0 ? 'keyboard' : 'pointer' });
  };
  const closePop = useCallback(() => setPop(null), []);
  const closePopWithFocus = useCallback(() => {
    setPop(null);
    window.setTimeout(() => popTriggerRef.current?.focus({ preventScroll: true }), 0);
  }, []);
  useEffect(() => {
    if (!pop) return;
    const focusPopover = pop.inputMode === 'keyboard'
      ? window.requestAnimationFrame(() => {
          const popover = document.querySelector<HTMLElement>('[data-dashboard-popover="true"]');
          const firstControl = popover?.querySelector<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          (firstControl ?? popover)?.focus({ preventScroll: true });
        })
      : 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closePopWithFocus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      if (focusPopover) window.cancelAnimationFrame(focusPopover);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop, closePopWithFocus]);

  // ---- command bar metrics ----
  const bestMove = currentNode.analysis?.moves?.[0] ?? null;
  // "Fast review" matches the command bar's name for the same operation;
  // avoid exposing MCTS jargon in one surface and not the other.
  const dashboardFastMctsTitle = isGameAnalysisRunning
    ? `Stop ${gameAnalysisType ?? 'current'} analysis`
    : 'Run a fast engine review of the current line';
  const dashboardFastMctsLabel = isGameAnalysisRunning ? 'Stop game analysis' : 'Run fast review';

  const sectionHead = (
    key: keyof typeof sections,
    title: string,
    iconName: IconName,
    actions?: React.ReactNode
  ) => (
    <div className="section-head">
      <button
        type="button"
        className="section-head-toggle"
        aria-expanded={sections[key]}
        onClick={() => {
        setSections((s) => ({ ...s, [key]: !s[key] }));
      }}
      >
        <span className="chev"><Icon name="chevR" size={13} /></span>
        <span style={{ color: 'var(--muted)', display: 'inline-flex' }}><Icon name={iconName} size={13} /></span>
        <span className="stitle"><span className="seyebrow">{title}</span></span>
      </button>
      {actions ? <div className="saction">{actions}</div> : null}
    </div>
  );

  // ---- overlay toggle helper ----
  const overlayBtn = (
    keyName: DashboardOverlayKey,
    label: string,
    iconName: IconName,
    disabled?: boolean
  ) => {
    const on = !!settings[keyName];
    const overlayActionLabel = on ? `Hide ${DASHBOARD_OVERLAY_NAMES[keyName]}` : `Show ${DASHBOARD_OVERLAY_NAMES[keyName]}`;
    const topMovesHiddenByPolicy = keyName === 'analysisShowHints' && disabled;
    const overlayLabel = topMovesHiddenByPolicy
      ? 'Top move hints hidden while heatmap is showing'
      : overlayActionLabel;
    const overlayTitle = topMovesHiddenByPolicy
      ? 'Move heatmap is showing; top move hints are hidden'
      : overlayActionLabel;
    return (
      <button
        type="button"
        className={`pbtn${on ? ' on' : ''}`}
        disabled={disabled}
        aria-pressed={on}
        aria-label={overlayLabel}
        title={overlayTitle}
        onClick={() => updateControls({ [keyName]: !on } as Partial<AnalysisControlsState>)}
      >
        <Icon name={iconName} size={12} />{label}
      </button>
    );
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = recentItems.filter((it) => it.type === 'file');
    if (!q) return items;
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [recentItems, search]);
  const showCompactStartStrip = showHero && layoutMode === 'compact' && gamestripOpen;
  const renderStartActions = () => (
    <>
      <button type="button" className="tbtn primary" onClick={() => { dismissHero(); onNewGame(); }}>
        <Icon name="plus" size={14} /> New game
      </button>
      <button type="button" className="tbtn" onClick={() => { dismissHero(); onLoadSgf(); }}>
        <Icon name="folder" size={14} /> Open SGF
      </button>
      <button type="button" className="tbtn" onClick={() => { dismissHero(); onPasteSgf(); }}>
        <Icon name="clipboard" size={14} /> Paste SGF / OGS
      </button>
      <button type="button" className="tbtn" onClick={() => { dismissHero(); onScanBoard(); }}>
        <Icon name="camera" size={14} /> From photo
      </button>
    </>
  );

  return (
    <div
      className="wk-dashboard"
      data-layout={layoutMode}
      data-library={libraryOpen ? 'open' : 'closed'}
      data-sidebar={sidebarOpen ? 'open' : 'closed'}
      data-focus={focusMode ? 'on' : 'off'}
      data-gamestrip={gamestripOpen ? 'open' : 'closed'}
      data-commandbar={commandbarState}
      style={dashboardStyle}
    >
      {/* ============ Header ============ */}
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {/* The app name is the page's only top-level heading; as a span there was
              no h1 at all, so heading-based navigation had nothing to land on.
              .brand-name sets font-size/weight explicitly and Preflight zeroes
              heading margins, so this renders identically. */}
          <h1 className="brand-name">Web <b>KaTrain</b></h1>
        </div>
        <div className="header-divider" />
        <div className="iconcluster" id="wk-file-actions">
          <button type="button" className="iconbtn" title="New game" aria-label="New game" onClick={onNewGame}><Icon name="plus" /></button>
          <button type="button" className="iconbtn" title="Open SGF / photo / weights" aria-label="Load SGF, board photo, or model weights" onClick={onLoadSgf}><Icon name="folder" /></button>
          <button type="button" className="iconbtn" title="Save SGF" aria-label="Save SGF" onClick={onSaveSgf}><Icon name="save" /></button>
          <button
            type="button"
            className={`iconbtn${pop?.id === 'file' ? ' active' : ''}`}
            title="More file actions"
            aria-label="More file actions"
            aria-haspopup="dialog"
            aria-expanded={pop?.id === 'file'}
            onClick={(e) => openPop('file', e)}
          >
            <Icon name="dots" />
          </button>
        </div>
        <div className="iconcluster" id="wk-util-actions">
          <button type="button" className="iconbtn" title="Command palette" aria-label="Command palette" onClick={onCommandPalette}><Icon name="search" /></button>
          <button type="button" className="iconbtn" title="Settings" aria-label="Settings" onClick={onSettings}><Icon name="settings" /></button>
          <button
            type="button"
            className={`iconbtn${pop?.id === 'help' ? ' active' : ''}`}
            title="Help"
            aria-label="Help"
            aria-haspopup="dialog"
            aria-expanded={pop?.id === 'help'}
            onClick={(e) => openPop('help', e)}
          >
            <Icon name="help" />
          </button>
        </div>

        <div className="header-spacer" />

        <LanguageSwitcher
          appLocale={settings.appLocale}
          onLocaleChange={(appLocale) => updateSettings({ appLocale })}
          className="dashboard-language-switcher"
        />

        <button
          type="button"
          className="engine-pill"
          id="wk-engine-pill"
          data-state={engineState}
          aria-haspopup="dialog"
          aria-expanded={pop?.id === 'engine'}
          title={engineMetaTitle}
          onClick={(e) => openPop('engine', e)}
        >
          <span className="dot" />
          <span id="wk-engine-pill-label">{enginePillLabel}</span>
          {/* Model name and hash are developer detail; the pill stays at
              "status · backend" and the popover carries the full identity. */}
          {engineBackend ? (
            <span className="meta" id="wk-engine-pill-meta">
              {formatEngineBackendLabel(engineBackend)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className="analyze-toggle"
          aria-pressed={isContinuousAnalysis}
          onClick={() => {
            if (!isContinuousAnalysis) setMode('analyze');
            toggleContinuousAnalysis();
          }}
        >
          <span className="dot" />
          Analyze
        </button>
        <button
          type="button"
          className="tbtn"
          id="wk-view-menu-btn"
          aria-haspopup="dialog"
          aria-expanded={pop?.id === 'view'}
          onClick={(e) => openPop('view', e)}
        >
          <Icon name="sliders" size={14} /> <span className="vlabel">View</span>
        </button>
      </header>

      {/* ============ Body ============ */}
      <div className="body" style={{ gridTemplateColumns }}>
        {/* Library */}
        {/* Both sidebars are <aside>, so without distinct labels a screen reader
            announces "complementary" twice with no way to tell them apart. */}
        <aside
          aria-label="Game library"
          className={`library${libraryPanel ? ' full-library' : ''}${libDrawer ? ' drawer' : ''}${libraryOpen ? ' open' : ''}`}
        >
          {libraryPanel ?? (
            <>
              <div className="library-head">
                <span className="eyebrow">Library</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button type="button" className="iconbtn" title="New game" aria-label="New game" onClick={onNewGame}><Icon name="plus" size={14} /></button>
                  <button type="button" className="iconbtn drawer-close" title="Close" aria-label="Close library" onClick={() => setLibraryOpen(false)}><Icon name="x" size={14} /></button>
                </div>
              </div>
              <div className="library-search">
                <Icon name="search" />
                <input
                  type="text"
                  placeholder="Search games…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="library-list">
                <div className="library-group">
                  <span className="eyebrow">Recent</span>
                  {filteredItems.length === 0 && (
                    <div className="li-sub" style={{ padding: '6px 8px' }}>No saved games yet.</div>
                  )}
                  {filteredItems.map((it) => {
                    const active = it.id === loadedFileId;
                    const reviewed = !!it.metadata?.result;
                    const grade = reviewed ? 'green' : 'none';
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className={`lib-item${active ? ' active' : ''}`}
                        onClick={() => onOpenRecent(it)}
                      >
                        <div className="li-main">
                          <div className="li-name">{it.name}</div>
                          <div className="li-sub">{it.moveCount} moves{reviewed ? ' · reviewed' : ''}</div>
                        </div>
                        <span className={`grade-chip ${grade}`}>{grade === 'none' ? '—' : grade}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Board column */}
        <main className="board-col">
          {gamestripOpen && (
          <div className={`gamestrip${showCompactStartStrip ? ' start-strip' : ''}`}>
            {showCompactStartStrip ? (
              <div className="compact-start" role="region" aria-label="Get started" data-dashboard-compact-start="true">
                <span className="compact-start-title">Start</span>
                <div className="compact-start-actions">{renderStartActions()}</div>
                <button
                  type="button"
                  className="iconbtn compact-start-close"
                  title="Dismiss"
                  aria-label="Dismiss get started"
                  onClick={dismissHero}
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            ) : (
              <>
                <div className="gs-players">
                  <div className={`gs-player${currentPlayer === 'black' ? ' to-move' : ''}`}>
                    <span className="stone-mini b" />
                    <span className="nm" title={blackName || 'Black'}>{blackName || 'Black'}</span>
                    {blackRank ? <span className="rk">{blackRank}</span> : null}
                    {capturedWhite > 0 ? <span className="cap">{capturedWhite} captured</span> : null}
                  </div>
                  <div className={`gs-player${currentPlayer === 'white' ? ' to-move' : ''}`}>
                    <span className="stone-mini w" />
                    <span className="nm" title={whiteName || 'White'}>{whiteName || 'White'}</span>
                    {whiteRank ? <span className="rk">{whiteRank}</span> : null}
                    {capturedBlack > 0 ? <span className="cap">{capturedBlack} captured</span> : null}
                  </div>
                </div>
                <span className="gs-sep" />
                <span className="gs-fact gs-fact-primary">{boardSize}×{boardSize}</span>
                <span className="gs-fact">komi <b>{komi}</b></span>
                {handicap > 0 ? <span className="gs-fact">H{handicap}</span> : null}
                <span className="gs-fact">{rulesLabel}</span>
                {result ? <span className="gs-result">{result}</span> : null}
                <span className="gs-sep gs-sep-file" />
                <div className="gs-file">
                  <Icon name="book" size={13} />
                  <span className="fn" title={loadedFileName || 'Untitled'}>{loadedFileName || 'Untitled'}</span>
                </div>
                <span className={`gs-save ${dirty ? 'dirty' : 'saved'}`}>
                  <Icon name={dirty ? 'alert' : 'check'} size={11} />{dirty ? 'Unsaved' : 'Saved'}
                </span>
                {/* The clock belongs with the game facts; it renders nothing
                    when no time control is configured. */}
                <Timer variant="status" />
              </>
            )}
          </div>
          )}

          <div className="board-stage">
            <button
              type="button"
              className={`edge-toggle left${libraryOpen ? ' open' : ''}`}
              title={libraryOpen ? 'Hide library' : 'Show library'}
              aria-label={libraryOpen ? 'Hide library' : 'Show library'}
              aria-pressed={libraryOpen}
              onClick={toggleLibrary}
            >
              <Icon name={libraryOpen ? 'chevL' : 'chevR'} size={13} />
              {!libraryOpen && <span className="edge-toggle-label">Library</span>}
            </button>
            <button
              type="button"
              className={`edge-toggle top${gamestripOpen ? ' open' : ''}`}
              title={gamestripOpen ? 'Hide game info' : 'Show game info'}
              aria-label={gamestripOpen ? 'Hide game info' : 'Show game info'}
              aria-pressed={gamestripOpen}
              onClick={() => setGamestripOpen((v) => !v)}
            >
              <Icon name={gamestripOpen ? 'chevU' : 'chevD'} size={13} />
            </button>
            <div className="board-wrap">
              <div className="goban-frame">{board}</div>
            </div>
            {showHero && !showCompactStartStrip && (
              <div className="hero-card" data-dashboard-hero="true" role="region" aria-label="Get started">
                <button
                  type="button"
                  className="iconbtn hero-close"
                  title="Dismiss"
                  aria-label="Dismiss get started"
                  onClick={dismissHero}
                >
                  <Icon name="x" size={13} />
                </button>
                <div className="hero-title">Start here</div>
                <div className="hero-actions">{renderStartActions()}</div>
              </div>
            )}
            <button
              type="button"
              className={`edge-toggle right${sidebarOpen ? ' open' : ''}`}
              title={sidebarOpen ? 'Hide analysis' : 'Show analysis'}
              aria-label={sidebarOpen ? 'Hide analysis' : 'Show analysis'}
              aria-pressed={sidebarOpen}
              onClick={toggleSidebar}
            >
              <Icon name={sidebarOpen ? 'chevR' : 'chevL'} size={13} />
            </button>
            {showAnalysis && (
              <button
                type="button"
                className={`edge-toggle bottom${commandbarOpen ? ' open' : ''}`}
                title={commandbarOpen ? 'Hide metrics' : 'Show metrics'}
                aria-label={commandbarOpen ? 'Hide metrics' : 'Show metrics'}
                aria-pressed={commandbarOpen}
                onClick={() => setCommandbarOpen((v) => !v)}
              >
                <Icon name={commandbarOpen ? 'chevD' : 'chevU'} size={13} />
              </button>
            )}
          </div>

          {/* Command bar */}
          {commandbarVisible && (
          <div className="commandbar">
            <div className="cb-metrics">
              {showAnalysis ? (
                <>
                  <div className="cb-metric">
                    <div className="k">Win rate</div>
                    <div className="v win">{winRate != null ? `${(winRate * 100).toFixed(1)}%` : '—'}</div>
                    <div className="sub">{formatWinRateFavorLabel(winRate)}</div>
                  </div>
                  <div className="cb-metric">
                    <div className="k">Score</div>
                    <div className="v score">{formatReadableScoreLead(scoreLead)}</div>
                  </div>
                  <div className="cb-metric">
                    <div className="k">Best move</div>
                    <div className="v best">{bestMove ? formatMoveLabel(bestMove.x, bestMove.y, boardSize) : '—'}</div>
                    <div className="sub" title={bestMove ? `${(bestMove.winRate * 100).toFixed(1)}% win rate · ${bestMove.visits} visits` : undefined}>
                      {bestMove ? `${(bestMove.winRate * 100).toFixed(0)}% · ${formatVisitCount(bestMove.visits)}` : ''}
                    </div>
                  </div>
                  <div className="cb-metric">
                    <div className="k">Played</div>
                    <div className="v">
                      {pointsLost != null ? (
                        <><span className="cb-quality-dot" style={{ background: evalColorForPointsLost(pointsLost) }} />{pointsLostLabel}</>
                      ) : '—'}
                    </div>
                    <div className={`sub ${pointsLost != null && pointsLost > 1.5 ? 'delta-bad' : 'delta-good'}`}>
                      {pointsLost != null ? (pointsLost > 0.05 ? `−${pointsLost.toFixed(1)} pts` : 'optimal') : ''}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="cb-metric"><div className="k">Analysis</div><div className="v">Off</div><div className="sub">enable to evaluate</div></div>
                  <div className="cb-metric"><div className="k">Engine</div><div className="v">{engineState === 'ready' ? 'Idle' : enginePillLabel}</div><div className="sub">{enginePillLabel}</div></div>
                  <div className="cb-metric"><div className="k">Captures</div><div className="v">{capturedBlack}·{capturedWhite}</div><div className="sub">B · W</div></div>
                </>
              )}
            </div>
          </div>
          )}

          {/* Nav bar */}
          <div className="navbar">
            <button type="button" className="pass-btn" title="Pass (P)" onClick={passTurn}>Pass</button>
            <div className="navgroup">
              <button type="button" className="navbtn navbtn-pair" title="Previous mistake" aria-label="Previous mistake" onClick={() => findMistake(-1)}><Icon name="chevL" size={11} /><span className="mistake-dot" /></button>
            </div>
            <span className="nav-divider" />
            <div className="navgroup">
              <button type="button" className="navbtn" title="To start" onClick={navigateStart}><Icon name="skipBack" size={15} /></button>
              <button type="button" className="navbtn navbtn-skip" title="Back 10" onClick={jumpBack}><Icon name="fastBack" size={15} /></button>
              <button type="button" className="navbtn" title="Back" onClick={navigateBack}><Icon name="chevL" size={15} /></button>
            </div>
            <div className="move-counter">
              <span className="mc-label">Move</span>
              <input
                type="number"
                value={moveInputValue}
                aria-label="Move number"
                title="Enter a move number to jump"
                inputMode="numeric"
                min={0}
                max={totalMoves}
                onChange={(e) => setMoveInputDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmedMove = moveInputValue.trim();
                    const n = Number(trimmedMove);
                    if (trimmedMove && Number.isInteger(n) && n >= 0) navigateToMove(n);
                    setMoveInputDraft(null);
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setMoveInputDraft(null);
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => setMoveInputDraft(null)}
                onFocus={(e) => {
                  setMoveInputDraft(String(moveCount));
                  e.currentTarget.select();
                }}
              />
              <span>/ {totalMoves}</span>
            </div>
            <div className="navgroup">
              <button type="button" className="navbtn" title="Forward" onClick={navigateForward}><Icon name="chevR" size={15} /></button>
              <button type="button" className="navbtn navbtn-skip" title="Forward 10" onClick={jumpForward}><Icon name="fastFwd" size={15} /></button>
              <button type="button" className="navbtn" title="To end" onClick={navigateEnd}><Icon name="skipFwd" size={15} /></button>
            </div>
            <span className="nav-divider" />
            <div className="navgroup">
              <button type="button" className="navbtn navbtn-pair" title="Next mistake" aria-label="Next mistake" onClick={() => findMistake(1)}><span className="mistake-dot" /><Icon name="chevR" size={11} /></button>
              <button type="button" className="navbtn" title="Rotate board" onClick={rotateBoard}><Icon name="rotate" size={15} /></button>
            </div>
            <span className="nav-divider" />
            <div className="board-tools">
              <button
                type="button"
                className={`board-chip${isSelectingRegionOfInterest ? ' on' : ''}`}
                title="Select a board region to analyze"
                onClick={startSelectRegionOfInterest}
              >
                <Icon name="target" size={13} /><span className="bc-label">Region</span>
              </button>
              <button
                type="button"
                className={`board-chip${isInsertMode ? ' on' : ''}`}
                title="Insert moves into the game record"
                onClick={toggleInsertMode}
              >
                <Icon name="layers" size={13} /><span className="bc-label">Insert</span>
              </button>
              {boardControls ? <div className="board-extra-tools">{boardControls}</div> : null}
            </div>
            <span className="navbar-spacer" />
            <div className="playactions">
              {mode === 'play' ? (
                <>
                  <button type="button" className="tbtn" title="Undo" onClick={onUndo}><Icon name="undo" size={14} /><span className="tbtn-label">Undo</span></button>
                  <button type="button" className="tbtn" title="AI move" onClick={onAiMove}><Icon name="bot" size={14} /><span className="tbtn-label">AI move</span></button>
                  <button type="button" className="tbtn" style={{ color: 'var(--red)', borderColor: '#f0c4c4' }} title="Resign" onClick={onResign}><Icon name="flag" size={14} /><span className="tbtn-label">Resign</span></button>
                </>
              ) : (
                <>
                  <button type="button" className="tbtn" title="AI move" onClick={onAiMove}><Icon name="bot" size={14} /><span className="tbtn-label">AI move</span></button>
                  <button type="button" className="tbtn primary" title="Play best" onClick={onPlayBest}><Icon name="play" size={14} /><span className="tbtn-label">Play best</span></button>
                </>
              )}
            </div>
          </div>
        </main>

        {/* Analysis sidebar */}
        <aside
          aria-label="Analysis panel"
          className={`sidebar${sideDrawer ? ' drawer' : ''}${sidebarOpen ? ' open' : ''}`}
        >
          <div className="mode-tabs">
            <button type="button" className={`mode-tab${mode === 'play' ? ' active' : ''}`} onClick={() => setMode('play')}>Play</button>
            <button type="button" className={`mode-tab${mode === 'analyze' ? ' active' : ''}`} onClick={() => setMode('analyze')}>Analysis</button>
            <button type="button" className="iconbtn drawer-close" title="Close" style={{ margin: '6px 6px 6px 0' }} onClick={() => setSidebarOpen(false)}><Icon name="x" size={14} /></button>
          </div>
          <div className="sidebar-scroll">
            {/* No "Game info" section: the gamestrip above the board is a strict
                superset of it (same title, size, rules, players, komi and result,
                plus captures, handicap and save state) and its own edge toggle
                brings it back when hidden. */}

            {/* Game tree */}
            <div className={`section${sections.tree ? ' open' : ''}`}>
              {sectionHead('tree', 'Game tree', 'sitemap')}
              <div className="section-body flush">
                {/* Branch switching only appears once the position actually has
                    sibling branches; permanent disabled chevrons read as broken. */}
                <div className="panel-toolbar">
                  {branchInfo.hasBranches && (
                    <>
                      <button type="button" className="pbtn pico" title="Previous branch" aria-label="Previous branch" onClick={() => switchBranch(-1)}><Icon name="chevD" size={12} /></button>
                      <button type="button" className="pbtn pico" title="Next branch" aria-label="Next branch" onClick={() => switchBranch(1)}><Icon name="chevR" size={12} /></button>
                      <span className="pbtn" style={{ pointerEvents: 'none' }}>
                        <span style={{ color: 'var(--faint)' }}>Branch</span>{' '}
                        <span className="mono" style={{ color: 'var(--ink)' }}>{branchInfo.currentIndex}/{branchInfo.totalBranches}</span>
                      </span>
                    </>
                  )}
                  <button type="button" className="pbtn pico" title="Back to branch point" aria-label="Back to branch point" onClick={undoToBranchPoint}><Icon name="levelUp" size={12} /></button>
                  {currentNode.parent ? (
                    <button type="button" className="pbtn pico" title="Make main branch" aria-label="Make current move the main branch" onClick={() => { makeCurrentNodeMainBranch(); toast('Set as main branch', 'success'); }}><Icon name="star" size={12} /></button>
                  ) : null}
                </div>
                <div className="tree-region">
                  <MoveTree />
                </div>
              </div>
            </div>

            {/* Analysis */}
            <div className={`section${sections.analysis ? ' open' : ''}`}>
              {sectionHead('analysis', 'Analysis', 'chart', (
                <button
                  type="button"
                  className={`pbtn pico${legendOpen ? ' on' : ''}`}
                  title={legendOpen ? 'Hide move-quality legend' : 'Show move-quality legend'}
                  aria-label={legendOpen ? 'Hide move-quality legend' : 'Show move-quality legend'}
                  aria-expanded={legendOpen}
                  aria-controls="dashboard-analysis-quality-legend"
                  onClick={() => setLegendOpen((v) => !v)}
                ><Icon name="info" size={12} /></button>
              ))}
              <div className="section-body flush">
                {isGameAnalysisRunning && (
                  <div className="progress-wrap" style={{ paddingTop: 12 }}>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${gameAnalysisTotal ? Math.round((gameAnalysisDone / gameAnalysisTotal) * 100) : 0}%` }} />
                    </div>
                    <div className="progress-label">{gameAnalysisDone}/{gameAnalysisTotal} positions · {gameAnalysisType ?? 'analysis'}</div>
                  </div>
                )}
                <div className="graph-wrap">
                  <ScoreWinrateGraph showScore={legend.score} showWinrate={legend.winrate} />
                </div>
                <div className="graph-legend">
                  <button
                    type="button"
                    className={`lg${legend.winrate ? ' on' : ''}`}
                    aria-pressed={legend.winrate}
                    aria-label={legend.winrate ? 'Hide win rate graph' : 'Show win rate graph'}
                    title={legend.winrate ? 'Hide win rate graph' : 'Show win rate graph'}
                    onClick={() => setLegend((l) => ({ ...l, winrate: !l.winrate }))}
                  >
                    <span className="lg-check" aria-hidden="true"><Icon name="check" size={10} /></span>
                    <span className="sw" style={{ background: 'var(--green)' }} />Win rate
                  </button>
                  <button
                    type="button"
                    className={`lg${legend.score ? ' on' : ''}`}
                    aria-pressed={legend.score}
                    aria-label={legend.score ? 'Hide score graph' : 'Show score graph'}
                    title={legend.score ? 'Hide score graph' : 'Show score graph'}
                    onClick={() => setLegend((l) => ({ ...l, score: !l.score }))}
                  >
                    <span className="lg-check" aria-hidden="true"><Icon name="check" size={10} /></span>
                    <span className="sw" style={{ background: 'var(--amber)' }} />Score
                  </button>
                </div>
                {/* Overlay toggles and review actions are analyst tooling; the
                    Play tab stays focused on the game itself. */}
                {mode === 'analyze' && (
                <div className="overlay-row">
                  {overlayBtn('analysisShowChildren', 'Children', 'sitemap')}
                  {overlayBtn('analysisShowEval', 'Dots', 'circle')}
                  {overlayBtn('analysisShowHints', 'Top moves', 'layers', settings.analysisShowPolicy)}
                  {overlayBtn('analysisShowPolicy', 'Heatmap', 'grid')}
                  {overlayBtn('analysisShowOwnership', 'Territory', 'map')}
                </div>
                )}
                {legendOpen && (
                  <div id="dashboard-analysis-quality-legend" className="qlegend">
                    <div className="eyebrow">Move quality · points lost</div>
                    <div className="qgrid">
                      {[
                        ['Blunder', 'var(--eval-blunder)', '5+ pt'],
                        ['Mistake', 'var(--eval-mistake)', '2–5 pt'],
                        ['Inaccuracy', 'var(--eval-inaccuracy)', '1–2 pt'],
                        ['Slight', 'var(--eval-slight)', '.5–1 pt'],
                        ['Good', 'var(--eval-good)', '0–.5 pt'],
                        ['Best', 'var(--eval-best)', '0 pt'],
                      ].map(([label, color, range]) => (
                        <div className="qi" key={label}>
                          <span className="qd" style={{ background: color }} />
                          <span className="ql">{label}</span>
                          <span className="qr">{range}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mode === 'analyze' && (
                <div className="overlay-row" style={{ paddingTop: 8 }}>
                  <button
                    type="button"
                    className="pbtn"
                    aria-label="Run quick graph analysis"
                    title="Run quick graph analysis"
                    onClick={startQuickGameAnalysis}
                  >
                    <Icon name="chart" size={12} />Quick graph
                  </button>
                  <button
                    type="button"
                    className={`pbtn${isGameAnalysisRunning ? ' danger' : ''}`}
                    aria-label={dashboardFastMctsLabel}
                    title={dashboardFastMctsTitle}
                    onClick={() => (isGameAnalysisRunning ? stopGameAnalysis() : startFastGameAnalysis())}
                  >
                    <Icon name="gauge" size={12} />{isGameAnalysisRunning ? 'Stop' : 'Fast review'}
                  </button>
                  <button
                    type="button"
                    className="pbtn"
                    aria-label="Open game report"
                    title="Open game report"
                    onClick={onOpenGameReport}
                  >
                    <Icon name="file" size={12} />Report
                  </button>
                </div>
                )}
                {!showAnalysis && (
                  <div className="coach-card">
                    <div className="cc-title">Analysis is off</div>
                    Engine evaluation, board overlays and the win-rate graph are paused.
                    <div style={{ paddingTop: 8 }}>
                      <button
                        type="button"
                        className="pbtn"
                        onClick={() => {
                          setMode('analyze');
                          if (!isContinuousAnalysis) toggleContinuousAnalysis();
                        }}
                      >
                        <Icon name="chart" size={12} />Turn on analysis
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Comment / notes */}
            <div className={`section${sections.notes ? ' open' : ''}`}>
              {sectionHead('notes', 'Comment', 'comment')}
              <div className="section-body flush">
                <NotesPanel showInfo detailed showNotes />
              </div>
            </div>
          </div>
        </aside>

        {/* drawer scrim */}
        {drawerOpen && (
          <div className="drawer-scrim" onClick={() => { setLibraryOpen(false); setSidebarOpen(false); }} />
        )}
      </div>

      {/* ============ Popovers ============ */}
      {pop && <div className="scrim" onClick={closePop} />}
      {pop?.id === 'engine' && (
        <EnginePopover
          rect={pop.rect}
          engineState={engineState}
          backend={engineBackend}
          model={engineModelLabel}
          cacheSize={analysisCacheSize}
          visits={settings.katagoVisits}
          visitsDisabled={isGameAnalysisRunning}
          onVisitsChange={(katagoVisits) => updateSettings({ katagoVisits })}
          onClearCache={() => { closePop(); onClearAnalysisCache(); }}
        />
      )}
      {pop?.id === 'file' && (
        <div
          className="popover menu"
          style={popoverStyle(pop.rect, 230)}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="false"
          aria-label="File actions"
          tabIndex={-1}
          data-dashboard-popover="true"
        >
          <div className="menu-section-label">Export</div>
          <button type="button" className="menu-item" onClick={() => { closePop(); onCopySgf(); }}>
            <Icon name="copy" size={14} /><span className="mi-label">Copy SGF</span>
          </button>
          <button type="button" className="menu-item" onClick={() => { closePop(); onSaveToLibrary(); }}>
            <Icon name="book" size={14} /><span className="mi-label">Save to library</span>
          </button>
          <div className="menu-divider" />
          <div className="menu-section-label">Import</div>
          <button type="button" className="menu-item" onClick={() => { closePop(); onPasteSgf(); }}>
            <Icon name="clipboard" size={14} /><span className="mi-label">Paste SGF / OGS</span>
          </button>
          <button type="button" className="menu-item" aria-label="Photo Board" onClick={() => { closePop(); onScanBoard(); }}>
            <Icon name="camera" size={14} /><span className="mi-label">Board from photo</span>
          </button>
        </div>
      )}
      {pop?.id === 'help' && (
        <div
          className="popover menu"
          style={popoverStyle(pop.rect, 230)}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="false"
          aria-label="Help"
          tabIndex={-1}
          data-dashboard-popover="true"
        >
          <button type="button" className="menu-item" onClick={() => { closePop(); onKeyboardHelp(); }}>
            <Icon name="keyboard" size={14} /><span className="mi-label">Keyboard shortcuts</span>
          </button>
          <button type="button" className="menu-item" onClick={() => { closePop(); onAbout(); }}>
            <Icon name="info" size={14} /><span className="mi-label">About Web KaTrain</span>
          </button>
          <div className="menu-divider" />
          <a
            className="menu-item"
            href={APP_ISSUE_REPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Report an issue on GitHub"
            aria-label="Report an issue on GitHub"
            data-dashboard-report-issue="true"
            onClick={closePop}
          >
            <Icon name="bug" />
            <span className="mi-label">Report an issue</span>
          </a>
        </div>
      )}
      {pop?.id === 'view' && (
        <ViewMenu
          rect={pop.rect}
          showCoords={settings.showCoordinates}
          onToggleCoords={() => updateSettings({ showCoordinates: !settings.showCoordinates })}
          libraryOpen={libraryOpen}
          sidebarOpen={sidebarOpen}
          onToggleLibrary={toggleLibrary}
          onToggleSidebar={toggleSidebar}
        />
      )}
    </div>
  );
};

function popoverStyle(rect: DOMRect, width: number): React.CSSProperties {
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  let top = rect.bottom + 6;
  // best-effort: keep on screen
  if (top + 320 > window.innerHeight - 8) top = Math.max(8, rect.top - 326);
  return { left, top };
}

const EnginePopover: React.FC<{
  rect: DOMRect;
  engineState: EngineState;
  backend: string;
  model: string;
  cacheSize: number;
  visits: number;
  visitsDisabled: boolean;
  onVisitsChange: (visits: number) => void;
  onClearCache: () => void;
}> = ({ rect, engineState, backend, model, cacheSize, visits, visitsDisabled, onVisitsChange, onClearCache }) => {
  const states: Record<EngineState, [string, string]> = {
    ready: ['Ready', 'var(--green)'],
    running: ['Analyzing', 'var(--live)'],
    loading: ['Loading', 'var(--live)'],
    error: ['Error', 'var(--red)'],
  };
  const [label, color] = states[engineState];
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300 - 8));
  return (
    <div
      className="popover"
      style={{ left, top: rect.bottom + 6 }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="false"
      aria-label="Engine details"
      tabIndex={-1}
      data-dashboard-popover="true"
    >
      <div className="pop-head"><div className="pop-eyebrow">Engine</div><div className="pop-title">KataGo · in-browser</div></div>
      <div className="engine-detail">
        <dl className="ed-grid">
          <div><dt>State</dt><dd style={{ color }}>{label}</dd></div>
          <div><dt>Backend</dt><dd>{backend || 'WebGPU'}</dd></div>
          <div><dt>Model</dt><dd>{model || '—'}</dd></div>
          <div><dt>Source</dt><dd>Bundled</dd></div>
        </dl>
        <div className="ed-row ed-row-depth" data-analysis-live-visit-presets="true">
          <div className="ed-depth-heading">
            <span>MCTS depth</span>
            <span>{clampAnalysisVisits(visits)} visits</span>
          </div>
          <div className="depth-presets">
            {ANALYSIS_VISIT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`depth-preset${clampAnalysisVisits(visits) === preset ? ' on' : ''}`}
                onClick={() => onVisitsChange(preset)}
                disabled={visitsDisabled}
                aria-pressed={clampAnalysisVisits(visits) === preset}
                data-analysis-live-depth-option={preset}
                title={visitsDisabled ? 'Stop game analysis before changing live visits' : `Set live analysis to ${preset} visits`}
              >
                <span className="dp-v">{preset}</span>
                <span className="dp-l">{visitPresetLabel(preset)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ed-row">
          <span style={{ color: 'var(--faint)', fontSize: 12 }}>Cached positions</span>
          <button type="button" className="pbtn" onClick={onClearCache}><Icon name="trash" size={12} /> {cacheSize}</button>
        </div>
      </div>
    </div>
  );
};

const ViewMenu: React.FC<{
  rect: DOMRect;
  showCoords: boolean;
  onToggleCoords: () => void;
  libraryOpen: boolean;
  sidebarOpen: boolean;
  onToggleLibrary: () => void;
  onToggleSidebar: () => void;
}> = ({ rect, showCoords, onToggleCoords, libraryOpen, sidebarOpen, onToggleLibrary, onToggleSidebar }) => {
  const item = (label: string, on: boolean | null, kbd: string, onClick: () => void, iconName?: IconName) => (
    <button type="button" className={`menu-item${on ? ' on' : ''}`} onClick={onClick}>
      {iconName ? <Icon name={iconName} size={14} /> : null}
      <span className="mi-label">{label}</span>
      {typeof on === 'boolean' ? <span className="mi-state">{on ? 'on' : 'off'}</span> : null}
      {kbd ? <span className="mi-kbd">{kbd}</span> : null}
    </button>
  );
  return (
    <div
      className="popover menu"
      style={popoverStyle(rect, 230)}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="false"
      aria-label="View options"
      tabIndex={-1}
      data-dashboard-popover="true"
    >
      <div className="menu-section-label">Display</div>
      {item('Coordinates', showCoords, 'C', onToggleCoords)}
      <div className="menu-divider" />
      <div className="menu-section-label">Layout</div>
      {item('Library panel', libraryOpen, '[', onToggleLibrary, 'book')}
      {item('Analysis panel', sidebarOpen, ']', onToggleSidebar, 'chart')}
      <div className="menu-divider" />
      {/* The only place build metadata lives now that the header chip is gone. */}
      {APP_COMMIT_URL ? (
        <a
          href={APP_COMMIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="menu-build"
          title={`Open build commit: ${APP_BUILD_LABEL}`}
          aria-label={`Open build commit ${APP_BUILD_LABEL}`}
          data-dashboard-build-link="true"
        >
          <Icon name="info" size={12} />
          <span className="menu-build-text">{APP_BUILD_LABEL}</span>
        </a>
      ) : (
        <div className="menu-build" title={APP_BUILD_LABEL} data-dashboard-build-link="true">
          <Icon name="info" size={12} />
          <span className="menu-build-text">{APP_BUILD_LABEL}</span>
        </div>
      )}
    </div>
  );
};

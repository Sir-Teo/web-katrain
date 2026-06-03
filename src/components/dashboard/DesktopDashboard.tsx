import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './dashboard.css';
import { Icon, type IconName } from './icons';
import type { GameNode, GameSettings, Player } from '../../types';
import type { BranchInfo } from '../../utils/branchNavigation';
import type { LibraryFile } from '../../utils/library';
import type { AnalysisControlsState } from '../layout/types';
import { formatMoveLabel } from '../layout/ui-utils';
import { MoveTree } from '../MoveTree';
import { ScoreWinrateGraph } from '../ScoreWinrateGraph';
import { NotesPanel } from '../NotesPanel';
import { getDashboardLayoutMode, type DashboardLayoutMode } from '../../utils/dashboardLayout';
import { LIBRARY_OPEN_STORAGE_KEY } from '../../utils/layoutPreferences';
import { readLocalStorage } from '../../utils/storage';
import { APP_BUILD_LABEL, APP_COMMIT_URL } from '../../utils/appInfo';

type EngineState = 'ready' | 'running' | 'loading' | 'error';

export interface DesktopDashboardProps {
  // ---- slots (heavy components, read from the store themselves) ----
  board: React.ReactNode;

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
  rules: string;
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

type PopoverId = 'engine' | 'view' | null;

export const DesktopDashboard: React.FC<DesktopDashboardProps> = (props) => {
  const {
    board,
    blackName, whiteName, blackRank, whiteRank,
    capturedBlack, capturedWhite, komi, boardSize, handicap, rules, result,
    currentPlayer, moveCount, totalMoves, loadedFileName, dirty, currentNode, branchInfo,
    showAnalysis, winRate, scoreLead, pointsLost, pointsLostLabel,
    engineState, enginePillLabel, engineMeta, engineMetaTitle, engineBackend, engineModelLabel, analysisCacheSize,
    mode, setMode, isContinuousAnalysis, toggleContinuousAnalysis,
    settings, updateControls, updateSettings,
    isInsertMode, toggleInsertMode, isSelectingRegionOfInterest, startSelectRegionOfInterest,
    libraryOpen, setLibraryOpen, libraryPanel, libraryWidth, sidebarOpen, setSidebarOpen,
    isGameAnalysisRunning, gameAnalysisType, gameAnalysisDone, gameAnalysisTotal,
    startQuickGameAnalysis, startFastGameAnalysis, stopGameAnalysis, onClearAnalysisCache, onOpenGameReport,
    navigateBack, navigateForward, navigateStart, navigateEnd, navigateToMove,
    jumpBack, jumpForward, findMistake, rotateBoard, switchBranch, undoToBranchPoint, makeCurrentNodeMainBranch,
    passTurn, onUndo, onAiMove, onResign, onPlayBest,
    onNewGame, onSaveSgf, onSaveToLibrary, onLoadSgf, onPasteSgf, onScanBoard,
    onSettings, onCommandPalette, onKeyboardHelp, onAbout,
    recentItems, loadedFileId, onOpenRecent,
    toast,
  } = props;

  const [sections, setSections] = useState({ info: false, tree: true, analysis: true, notes: true });
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
  const [pop, setPop] = useState<{ id: PopoverId; rect: DOMRect } | null>(null);
  const [moveInputDraft, setMoveInputDraft] = useState<string | null>(null);
  const moveInputValue = moveInputDraft ?? String(moveCount);

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
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPop((cur) => (cur?.id === id ? null : { id, rect }));
  };
  const closePop = useCallback(() => setPop(null), []);
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePop(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pop, closePop]);

  // ---- command bar metrics ----
  const moveSub = (() => {
    const m = currentNode.move;
    if (!m) return 'Start';
    const who = m.player === 'black' ? 'Black' : 'White';
    return `${who} ${m.x < 0 || m.y < 0 ? 'pass' : formatMoveLabel(m.x, m.y, boardSize)}`;
  })();
  const bestMove = currentNode.analysis?.moves?.[0] ?? null;

  const sectionHead = (
    key: keyof typeof sections,
    title: string,
    iconName: IconName,
    actions?: React.ReactNode
  ) => (
    <div
      role="button"
      tabIndex={0}
      className="section-head"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('.saction')) return;
        setSections((s) => ({ ...s, [key]: !s[key] }));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSections((s) => ({ ...s, [key]: !s[key] }));
        }
      }}
    >
      <span className="chev"><Icon name="chevR" size={13} /></span>
      <span style={{ color: 'var(--muted)', display: 'inline-flex' }}><Icon name={iconName} size={13} /></span>
      <span className="stitle"><span className="seyebrow">{title}</span></span>
      {actions ? <span className="saction">{actions}</span> : null}
    </div>
  );

  // ---- overlay toggle helper ----
  const overlayBtn = (
    keyName: keyof Pick<GameSettings, 'analysisShowChildren' | 'analysisShowEval' | 'analysisShowHints' | 'analysisShowPolicy' | 'analysisShowOwnership'>,
    label: string,
    iconName: IconName,
    disabled?: boolean
  ) => {
    const on = !!settings[keyName];
    return (
      <button
        type="button"
        className={`pbtn${on ? ' on' : ''}`}
        disabled={disabled}
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

  return (
    <div
      className="wk-dashboard"
      data-layout={layoutMode}
      data-library={libraryOpen ? 'open' : 'closed'}
      data-sidebar={sidebarOpen ? 'open' : 'closed'}
      style={dashboardStyle}
    >
      {/* ============ Header ============ */}
      <header className="header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Web <b>KaTrain</b></span>
        </div>
        <div className="header-divider" />
        <div className="iconcluster" id="wk-file-actions">
          <button type="button" className="iconbtn" title="New game" aria-label="New game" onClick={onNewGame}><Icon name="plus" /></button>
          <button type="button" className="iconbtn" title="Open SGF / photo / weights" aria-label="Load SGF, board photo, or model weights" onClick={onLoadSgf}><Icon name="folder" /></button>
          <button type="button" className="iconbtn" title="Save SGF" aria-label="Save SGF" onClick={onSaveSgf}><Icon name="save" /></button>
          <button type="button" className="iconbtn shed" title="Save to library" aria-label="Save to library" onClick={onSaveToLibrary}><Icon name="book" /></button>
          <button type="button" className="iconbtn shed" title="Paste SGF / OGS" aria-label="Paste SGF / OGS" onClick={onPasteSgf}><Icon name="clipboard" /></button>
        </div>
        <div className="header-divider shed" />
        <div className="iconcluster" id="wk-util-actions">
          <button type="button" className="iconbtn" title="Command palette" aria-label="Command palette" onClick={onCommandPalette}><Icon name="search" /></button>
          <button type="button" className="iconbtn" title="Photo board" aria-label="Photo Board" onClick={onScanBoard}><Icon name="camera" /></button>
          <button type="button" className="iconbtn" title="Settings" aria-label="Settings" onClick={onSettings}><Icon name="settings" /></button>
          <button type="button" className="iconbtn" title="Keyboard shortcuts" aria-label="Keyboard shortcuts" onClick={onKeyboardHelp}><Icon name="keyboard" /></button>
        </div>

        <div className="header-spacer" />

        <button
          type="button"
          className="engine-pill"
          id="wk-engine-pill"
          data-state={engineState}
          aria-haspopup="dialog"
          title={engineMetaTitle}
          onClick={(e) => openPop('engine', e)}
        >
          <span className="dot" />
          <span id="wk-engine-pill-label">{enginePillLabel}</span>
          <span className="meta" id="wk-engine-pill-meta">{engineMeta}</span>
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
        <button type="button" className="tbtn" id="wk-view-menu-btn" onClick={(e) => openPop('view', e)}>
          <Icon name="sliders" size={14} /> <span className="vlabel">View</span>
        </button>
      </header>

      {/* ============ Body ============ */}
      <div className="body" style={{ gridTemplateColumns }}>
        {/* Library */}
        <aside className={`library${libraryPanel ? ' full-library' : ''}${libDrawer ? ' drawer' : ''}${libraryOpen ? ' open' : ''}`}>
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
          <div className="gamestrip">
            <div className="gs-players">
              <div className={`gs-player${currentPlayer === 'black' ? ' to-move' : ''}`}>
                <span className="stone-mini b" />
                <span className="nm">{blackName || 'Black'}</span>
                {blackRank ? <span className="rk">{blackRank}</span> : null}
                <span className="cap">{capturedWhite} cap</span>
              </div>
              <div className={`gs-player${currentPlayer === 'white' ? ' to-move' : ''}`}>
                <span className="stone-mini w" />
                <span className="nm">{whiteName || 'White'}</span>
                {whiteRank ? <span className="rk">{whiteRank}</span> : null}
                <span className="cap">{capturedBlack} cap</span>
              </div>
            </div>
            <span className="gs-sep" />
            <span className="gs-fact">{boardSize}×{boardSize}</span>
            <span className="gs-fact">komi <b>{komi}</b></span>
            {handicap > 0 ? <span className="gs-fact">H{handicap}</span> : null}
            <span className="gs-fact">{rules}</span>
            {result ? <span className="gs-result">{result}</span> : null}
            <span className="gs-sep" />
            <div className="gs-file">
              <Icon name="book" size={13} />
              <span className="fn">{loadedFileName || 'Untitled'}</span>
            </div>
            <span className={`gs-save ${dirty ? 'dirty' : 'saved'}`}>
              <Icon name={dirty ? 'alert' : 'check'} size={11} />{dirty ? 'Unsaved' : 'Saved'}
            </span>
          </div>

          <div className="board-stage">
            {!libraryOpen && (
              <button type="button" className="edge-toggle left" title="Show library" onClick={toggleLibrary}><Icon name="chevR" size={13} /></button>
            )}
            <div className="board-tools">
              <button
                type="button"
                className={`board-chip${isSelectingRegionOfInterest ? ' on' : ''}`}
                onClick={startSelectRegionOfInterest}
              >
                <Icon name="target" size={13} />Region
              </button>
              <button
                type="button"
                className={`board-chip${isInsertMode ? ' on' : ''}`}
                onClick={toggleInsertMode}
              >
                <Icon name="layers" size={13} />Insert
              </button>
            </div>
            <div className="board-wrap">
              <div className="goban-frame">{board}</div>
            </div>
            {!sidebarOpen && (
              <button type="button" className="edge-toggle right" title="Show analysis" onClick={toggleSidebar}><Icon name="chevL" size={13} /></button>
            )}
          </div>

          {/* Command bar */}
          <div className="commandbar">
            <div className="cb-metrics">
              <div className="cb-metric">
                <div className="k">Move</div>
                <div className="v">{moveCount} / {totalMoves}</div>
                <div className="sub">{moveSub}</div>
              </div>
              {showAnalysis ? (
                <>
                  <div className="cb-metric">
                    <div className="k">Win rate</div>
                    <div className="v win">{winRate != null ? `${(winRate * 100).toFixed(1)}%` : '—'}</div>
                    <div className="sub">{winRate != null ? `${winRate >= 0.5 ? 'Black' : 'White'} favored` : ''}</div>
                  </div>
                  <div className="cb-metric">
                    <div className="k">Score</div>
                    <div className="v score">{scoreLead != null ? `${scoreLead >= 0 ? 'B+' : 'W+'}${Math.abs(scoreLead).toFixed(1)}` : '—'}</div>
                    <div className="sub">lead</div>
                  </div>
                  <div className="cb-metric">
                    <div className="k">Best move</div>
                    <div className="v best">{bestMove ? formatMoveLabel(bestMove.x, bestMove.y, boardSize) : '—'}</div>
                    <div className="sub">{bestMove ? `${(bestMove.winRate * 100).toFixed(0)}% · ${bestMove.visits} visits` : ''}</div>
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

          {/* Nav bar */}
          <div className="navbar">
            <button type="button" className="pass-btn" title="Pass (P)" onClick={passTurn}>Pass</button>
            <div className="navgroup">
              <button type="button" className="navbtn danger" title="Previous mistake" onClick={() => findMistake(-1)}><Icon name="alert" size={15} /></button>
            </div>
            <span className="nav-divider" />
            <div className="navgroup">
              <button type="button" className="navbtn" title="To start" onClick={navigateStart}><Icon name="skipBack" size={15} /></button>
              <button type="button" className="navbtn" title="Back 10" onClick={jumpBack}><Icon name="fastBack" size={15} /></button>
              <button type="button" className="navbtn" title="Back" onClick={navigateBack}><Icon name="chevL" size={15} /></button>
            </div>
            <div className="move-counter">
              <span>Move</span>
              <input
                value={moveInputValue}
                onChange={(e) => setMoveInputDraft(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    const n = parseInt(moveInputValue, 10);
                    if (!Number.isNaN(n)) navigateToMove(n);
                    setMoveInputDraft(null);
                    (e.target as HTMLInputElement).blur();
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
              <button type="button" className="navbtn" title="Forward 10" onClick={jumpForward}><Icon name="fastFwd" size={15} /></button>
              <button type="button" className="navbtn" title="To end" onClick={navigateEnd}><Icon name="skipFwd" size={15} /></button>
            </div>
            <span className="nav-divider" />
            <div className="navgroup">
              <button type="button" className="navbtn danger" title="Next mistake" onClick={() => findMistake(1)}><Icon name="alert" size={15} /></button>
              <button type="button" className="navbtn" title="Rotate board" onClick={rotateBoard}><Icon name="rotate" size={15} /></button>
            </div>
            <span className="navbar-spacer" />
            <div className="playactions">
              {mode === 'play' ? (
                <>
                  <button type="button" className="tbtn" onClick={onUndo}><Icon name="undo" size={14} />Undo</button>
                  <button type="button" className="tbtn" onClick={onAiMove}><Icon name="bot" size={14} />AI move</button>
                  <button type="button" className="tbtn" style={{ color: 'var(--red)', borderColor: '#f0c4c4' }} onClick={onResign}><Icon name="flag" size={14} />Resign</button>
                </>
              ) : (
                <>
                  <button type="button" className="tbtn" onClick={onAiMove}><Icon name="bot" size={14} />AI move</button>
                  <button type="button" className="tbtn primary" onClick={onPlayBest}><Icon name="play" size={14} />Play best</button>
                </>
              )}
            </div>
          </div>
        </main>

        {/* Analysis sidebar */}
        <aside className={`sidebar${sideDrawer ? ' drawer' : ''}${sidebarOpen ? ' open' : ''}`}>
          <div className="mode-tabs">
            <button type="button" className={`mode-tab${mode === 'play' ? ' active' : ''}`} onClick={() => setMode('play')}>Play</button>
            <button type="button" className={`mode-tab${mode === 'analyze' ? ' active' : ''}`} onClick={() => setMode('analyze')}>Analysis</button>
            <button type="button" className="iconbtn drawer-close" title="Close" style={{ margin: '6px 6px 6px 0' }} onClick={() => setSidebarOpen(false)}><Icon name="x" size={14} /></button>
          </div>
          <div className="sidebar-scroll">
            {/* Game info */}
            <div className={`section${sections.info ? ' open' : ''}`}>
              {sectionHead('info', 'Game info', 'info')}
              <div className="section-body">
                <div className="info-card">
                  <div className="info-title">{loadedFileName || 'Current game'}</div>
                  <div className="info-sub">{boardSize}×{boardSize} · {rules}</div>
                  <div className="info-row"><span className="stone-mini b" /><div><div className="ir-k">Black</div><div className="ir-v">{blackName || 'Black'} {blackRank}</div></div></div>
                  <div className="info-row"><span className="stone-mini w" /><div><div className="ir-k">White</div><div className="ir-v">{whiteName || 'White'} {whiteRank}</div></div></div>
                  <dl className="info-grid">
                    <div><dt>Komi</dt><dd>{komi}</dd></div>
                    <div><dt>Result</dt><dd>{result || '—'}</dd></div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Game tree */}
            <div className={`section${sections.tree ? ' open' : ''}`}>
              {sectionHead('tree', 'Game tree', 'sitemap')}
              <div className="section-body flush">
                <div className="panel-toolbar">
                  <button type="button" className="pbtn pico" title="Previous branch" disabled={!branchInfo.hasBranches} onClick={() => switchBranch(-1)}><Icon name="chevD" size={12} /></button>
                  <button type="button" className="pbtn pico" title="Next branch" disabled={!branchInfo.hasBranches} onClick={() => switchBranch(1)}><Icon name="chevR" size={12} /></button>
                  {branchInfo.hasBranches && (
                    <span className="pbtn" style={{ pointerEvents: 'none' }}>
                      <span style={{ color: 'var(--faint)' }}>Branch</span>{' '}
                      <span className="mono" style={{ color: 'var(--ink)' }}>{branchInfo.currentIndex + 1}/{branchInfo.totalBranches}</span>
                    </span>
                  )}
                  <button type="button" className="pbtn pico" title="Back to branch point" onClick={undoToBranchPoint}><Icon name="levelUp" size={12} /></button>
                  <button type="button" className="pbtn pico" title="Make main branch" disabled={!currentNode.parent} onClick={() => { makeCurrentNodeMainBranch(); toast('Set as main branch', 'success'); }}><Icon name="star" size={12} /></button>
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
                  title="Move-quality legend"
                  onClick={(e) => { e.stopPropagation(); setLegendOpen((v) => !v); }}
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
                  <button type="button" className="lg" style={{ opacity: legend.winrate ? 1 : 0.4 }} onClick={() => setLegend((l) => ({ ...l, winrate: !l.winrate }))}>
                    <span className="sw" style={{ background: 'var(--green)' }} />Win rate
                  </button>
                  <button type="button" className="lg" style={{ opacity: legend.score ? 1 : 0.4 }} onClick={() => setLegend((l) => ({ ...l, score: !l.score }))}>
                    <span className="sw" style={{ background: 'var(--amber)' }} />Score
                  </button>
                </div>
                <div className="overlay-row">
                  {overlayBtn('analysisShowChildren', 'Children', 'sitemap')}
                  {overlayBtn('analysisShowEval', 'Dots', 'circle')}
                  {overlayBtn('analysisShowHints', 'Top moves', 'layers')}
                  {overlayBtn('analysisShowPolicy', 'Heatmap', 'grid')}
                  {overlayBtn('analysisShowOwnership', 'Territory', 'map')}
                </div>
                {legendOpen && (
                  <div className="qlegend">
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
                <div className="overlay-row" style={{ paddingTop: 8 }}>
                  <button type="button" className="pbtn" onClick={startQuickGameAnalysis}><Icon name="chart" size={12} />Quick graph</button>
                  <button
                    type="button"
                    className={`pbtn${isGameAnalysisRunning ? ' danger' : ''}`}
                    onClick={() => (isGameAnalysisRunning ? stopGameAnalysis() : startFastGameAnalysis())}
                  >
                    <Icon name="gauge" size={12} />{isGameAnalysisRunning ? 'Stop' : 'Fast MCTS'}
                  </button>
                  <button type="button" className="pbtn" onClick={onOpenGameReport}><Icon name="file" size={12} />Report</button>
                </div>
                {!showAnalysis && (
                  <div className="coach-card">
                    <div className="cc-title">Analysis is off</div>
                    Turn on <b>Analyze</b> in the header (or switch to the Analysis tab) to evaluate the live position. Overlays and the win-rate graph populate once the engine runs.
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
          onClearCache={() => { closePop(); onClearAnalysisCache(); }}
        />
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
          onSettings={() => { closePop(); onSettings(); }}
          onAbout={() => { closePop(); onAbout(); }}
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
  onClearCache: () => void;
}> = ({ rect, engineState, backend, model, cacheSize, onClearCache }) => {
  const states: Record<EngineState, [string, string]> = {
    ready: ['Ready', 'var(--green)'],
    running: ['Analyzing', 'var(--live)'],
    loading: ['Loading', 'var(--live)'],
    error: ['Error', 'var(--red)'],
  };
  const [label, color] = states[engineState];
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300 - 8));
  return (
    <div className="popover" style={{ left, top: rect.bottom + 6 }} onClick={(e) => e.stopPropagation()}>
      <div className="pop-head"><div className="pop-eyebrow">Engine</div><div className="pop-title">KataGo · in-browser</div></div>
      <div className="engine-detail">
        <dl className="ed-grid">
          <div><dt>State</dt><dd style={{ color }}>{label}</dd></div>
          <div><dt>Backend</dt><dd>{backend || 'WebGPU'}</dd></div>
          <div><dt>Model</dt><dd>{model || '—'}</dd></div>
          <div><dt>Source</dt><dd>Bundled</dd></div>
        </dl>
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
  onSettings: () => void;
  onAbout: () => void;
}> = ({ rect, showCoords, onToggleCoords, libraryOpen, sidebarOpen, onToggleLibrary, onToggleSidebar, onSettings, onAbout }) => {
  const item = (label: string, on: boolean | null, kbd: string, onClick: () => void, iconName?: IconName) => (
    <button type="button" className={`menu-item${on ? ' on' : ''}`} onClick={onClick}>
      {iconName ? <Icon name={iconName} size={14} /> : null}
      <span className="mi-label">{label}</span>
      {typeof on === 'boolean' ? <span className="mi-state">{on ? 'on' : 'off'}</span> : null}
      {kbd ? <span className="mi-kbd">{kbd}</span> : null}
    </button>
  );
  return (
    <div className="popover menu" style={popoverStyle(rect, 230)} onClick={(e) => e.stopPropagation()}>
      <div className="menu-section-label">Display</div>
      {item('Coordinates', showCoords, 'C', onToggleCoords)}
      <div className="menu-divider" />
      <div className="menu-section-label">Layout</div>
      {item('Library panel', libraryOpen, '[', onToggleLibrary, 'book')}
      {item('Analysis panel', sidebarOpen, ']', onToggleSidebar, 'chart')}
      <div className="menu-divider" />
      <div className="menu-section-label">More</div>
      {item('Settings', null, '', onSettings, 'settings')}
      {item('About', null, '', onAbout, 'info')}
      <div className="menu-divider" />
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
        <div className="menu-build" title={APP_BUILD_LABEL}>
          <Icon name="info" size={12} />
          <span className="menu-build-text">{APP_BUILD_LABEL}</span>
        </div>
      )}
    </div>
  );
};

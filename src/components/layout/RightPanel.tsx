import React from 'react';
import {
  FaTimes,
  FaFastBackward,
  FaFastForward,
  FaArrowUp,
  FaArrowDown,
  FaLevelUpAlt,
  FaSitemap,
  FaChartLine,
  FaCommentDots,
  FaStar,
  FaListUl,
  FaInfoCircle,
  FaAlignLeft,
  FaStickyNote,
} from 'react-icons/fa';
import type { Player, GameNode, Move } from '../../types';
import { useGameStore } from '../../store/gameStore';
import { AnalysisPanel } from '../AnalysisPanel';
import { MoveTree } from '../MoveTree';
import { NotesPanel } from '../NotesPanel';
import { Timer } from '../Timer';
import type { UiMode, UiState } from './types';
import type { MobileTab } from './MobileTabBar';
import { SectionHeader, formatMoveLabel, panelCardBase, panelCardClosed, panelCardOpen, playerToShort } from './ui';

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  showOnDesktop?: boolean;
  isMobile?: boolean;
  activeMobileTab?: MobileTab;
  showAnalysisSection?: boolean;
  mode: UiMode;
  setMode: (m: UiMode) => void;
  modePanels: UiState['panels'][UiMode];
  updatePanels: (
    partial: Partial<UiState['panels'][UiMode]> | ((current: UiState['panels'][UiMode]) => Partial<UiState['panels'][UiMode]>)
  ) => void;
  rootNode: GameNode;
  treeVersion: number;
  // Game analysis actions
  isGameAnalysisRunning: boolean;
  gameAnalysisType: string | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
  startQuickGameAnalysis: () => void;
  startFastGameAnalysis: () => void;
  stopGameAnalysis: () => void;
  onOpenGameAnalysis: () => void;
  onOpenGameReport: () => void;
  // Player info
  currentPlayer: Player;
  capturedBlack: number;
  capturedWhite: number;
  // Timer/game
  komi: number;
  endResult: string | null;
  // Navigation
  navigateBack: () => void;
  navigateStart: () => void;
  navigateEnd: () => void;
  switchBranch: (direction: 1 | -1) => void;
  undoToBranchPoint: () => void;
  undoToMainBranch: () => void;
  makeCurrentNodeMainBranch: () => void;
  isInsertMode: boolean;
  resign: () => void;
  toast: (msg: string, type: 'info' | 'error' | 'success') => void;
  // Analysis
  winRate: number | null;
  scoreLead: number | null;
  pointsLost: number | null;
  // Engine status
  engineDot: string;
  engineMeta: string;
  engineMetaTitle: string | undefined;
  engineError: string | null;
  statusText: string;
  lockAiDetails: boolean;
  // Notes
  currentNode: GameNode;
  moveHistory: Move[];
}

export const RightPanel: React.FC<RightPanelProps> = ({
  open,
  onClose,
  width,
  showOnDesktop = true,
  isMobile = false,
  activeMobileTab,
  showAnalysisSection = true,
  mode,
  setMode,
  modePanels,
  updatePanels,
  rootNode,
  treeVersion,
  isGameAnalysisRunning,
  gameAnalysisType,
  gameAnalysisDone,
  gameAnalysisTotal,
  startQuickGameAnalysis,
  startFastGameAnalysis,
  stopGameAnalysis,
  onOpenGameAnalysis,
  onOpenGameReport,
  currentPlayer,
  capturedBlack,
  capturedWhite,
  komi,
  endResult,
  navigateBack,
  navigateStart,
  navigateEnd,
  switchBranch,
  undoToBranchPoint,
  undoToMainBranch,
  makeCurrentNodeMainBranch,
  isInsertMode,
  resign,
  toast,
  winRate,
  scoreLead,
  pointsLost,
  engineDot,
  engineMeta,
  engineMetaTitle,
  engineError,
  statusText,
  lockAiDetails,
  currentNode,
  moveHistory,
}) => {
  const showTree = !isMobile || activeMobileTab === 'tree';
  const showAnalysis = !isMobile || activeMobileTab === 'analysis';
  const showNotes = !isMobile || activeMobileTab === 'info';

  const modeTabClass = (active: boolean) => ['panel-tab', active ? 'active' : ''].join(' ');
  const treeViewTabClass = (active: boolean) => ['panel-icon-button', active ? 'active' : ''].join(' ');
  const noteToggleClass = (active: boolean) => ['panel-icon-button', active ? 'active' : ''].join(' ');

  const guardInsertMode = (action: () => void) => {
    if (isInsertMode) {
      toast('Finish inserting before navigating.', 'error');
      return;
    }
    action();
  };

  const rootProps = rootNode.properties ?? {};
  const getProp = (key: string) => rootProps[key]?.[0] ?? '';
  const blackName = getProp('PB') || 'Black';
  const whiteName = getProp('PW') || 'White';

  const pathNodes = React.useMemo(() => {
    const nodes: GameNode[] = [];
    let node: GameNode | null = currentNode;
    while (node) {
      nodes.push(node);
      node = node.parent;
    }
    return nodes.reverse();
  }, [currentNode]);

  const notesNodes = React.useMemo(() => {
    void treeVersion;
    const out: Array<{ node: GameNode; label: string; snippet: string }> = [];
    const stack: GameNode[] = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.note && node.note.trim()) {
        const move = node.move;
        const label = move ? formatMoveLabel(move.x, move.y) : 'Root';
        const snippet = node.note.trim().split('\n')[0]!.slice(0, 60);
        out.push({ node, label, snippet });
      }
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
    }
    return out;
  }, [rootNode, treeVersion]);

  const renderSection = (args: {
    show: boolean;
    title: string;
    icon?: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    actions?: React.ReactNode;
    wrapperClassName?: string;
    contentClassName?: string;
    contentStyle?: React.CSSProperties;
    onResize?: (e: React.MouseEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
  }) => {
    if (!args.show) return null;
    const wrapperTone = args.open ? panelCardOpen : panelCardClosed;
    return (
      <div
        className={[
          panelCardBase,
          wrapperTone,
          args.wrapperClassName ?? '',
        ].join(' ')}
      >
        <SectionHeader
          title={args.title}
          icon={args.icon}
          open={args.open}
          onToggle={args.onToggle}
          actions={args.actions}
        />
        {args.open ? (
          <div className={args.contentClassName ?? 'panel-section-content'} style={args.contentStyle}>
            {args.children}
          </div>
        ) : null}
        {args.open && args.onResize ? (
          <div
            className="hidden lg:block h-1 cursor-row-resize bg-[var(--ui-border)] hover:bg-[var(--ui-border-strong)] transition-colors"
            onMouseDown={args.onResize}
          />
        ) : null}
      </div>
    );
  };

  const [treeHeight, setTreeHeight] = React.useState(() => {
    if (typeof localStorage === 'undefined') return 180;
    const raw = localStorage.getItem('web-katrain:tree_height:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 180;
  });
  const [treeView, setTreeView] = React.useState<'tree' | 'list'>(() => {
    if (typeof localStorage === 'undefined') return 'tree';
    const raw = localStorage.getItem('web-katrain:tree_view:v1');
    return raw === 'list' ? 'list' : 'tree';
  });
  const [notesListOpen, setNotesListOpen] = React.useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('web-katrain:notes_list_open:v1') === 'true';
  });
  const analysisResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const notesResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const [analysisHeight, setAnalysisHeight] = React.useState(() => {
    if (typeof localStorage === 'undefined') return 260;
    const raw = localStorage.getItem('web-katrain:analysis_height:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 260;
  });
  const [notesHeight, setNotesHeight] = React.useState(() => {
    if (typeof localStorage === 'undefined') return 320;
    const raw = localStorage.getItem('web-katrain:notes_height:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 320;
  });
  const [isResizingAnalysis, setIsResizingAnalysis] = React.useState(false);
  const [isResizingNotes, setIsResizingNotes] = React.useState(false);
  const treeResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const [isResizingTree, setIsResizingTree] = React.useState(false);

  React.useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:tree_height:v1', String(treeHeight));
  }, [treeHeight]);

  React.useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:tree_view:v1', treeView);
  }, [treeView]);

  React.useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:notes_list_open:v1', String(notesListOpen));
  }, [notesListOpen]);

  React.useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:analysis_height:v1', String(analysisHeight));
  }, [analysisHeight]);

  React.useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:notes_height:v1', String(notesHeight));
  }, [notesHeight]);

  React.useEffect(() => {
    if (!isResizingTree) return;
    const minHeight = 120;
    const maxHeight = 360;
    const onMove = (e: MouseEvent) => {
      if (!treeResizeRef.current) return;
      const delta = e.clientY - treeResizeRef.current.startY;
      const next = Math.min(maxHeight, Math.max(minHeight, treeResizeRef.current.startHeight + delta));
      setTreeHeight(next);
    };
    const onUp = () => {
      setIsResizingTree(false);
      treeResizeRef.current = null;
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingTree]);

  React.useEffect(() => {
    if (!isResizingAnalysis) return;
    const minHeight = 200;
    const maxHeight = 520;
    const onMove = (e: MouseEvent) => {
      if (!analysisResizeRef.current) return;
      const delta = e.clientY - analysisResizeRef.current.startY;
      const next = Math.min(maxHeight, Math.max(minHeight, analysisResizeRef.current.startHeight + delta));
      setAnalysisHeight(next);
    };
    const onUp = () => {
      setIsResizingAnalysis(false);
      analysisResizeRef.current = null;
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingAnalysis]);

  React.useEffect(() => {
    if (!isResizingNotes) return;
    const minHeight = 240;
    const maxHeight = 640;
    const onMove = (e: MouseEvent) => {
      if (!notesResizeRef.current) return;
      const delta = e.clientY - notesResizeRef.current.startY;
      const next = Math.min(maxHeight, Math.max(minHeight, notesResizeRef.current.startHeight + delta));
      setNotesHeight(next);
    };
    const onUp = () => {
      setIsResizingNotes(false);
      notesResizeRef.current = null;
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingNotes]);

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
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={[
          'ui-panel border-l flex flex-col overflow-hidden relative',
          'fixed inset-y-0 right-0 z-40 w-full max-w-md',
          open ? 'flex' : 'hidden',
          'lg:static lg:max-w-none lg:z-auto',
          showOnDesktop ? 'lg:flex' : 'lg:hidden',
          isMobile ? 'pb-[68px]' : '',
        ].join(' ')}
        style={width ? { width } : undefined}
      >
        {/* Play / Analyze tabs */}
        <div className="ui-bar ui-bar-height ui-bar-pad border-b border-[var(--ui-border)] flex items-center gap-2">
          <button
            type="button"
            className="lg:hidden h-10 w-10 flex items-center justify-center rounded-lg hover:bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:text-white transition-colors"
            onClick={onClose}
            title="Close side panel"
          >
            <FaTimes />
          </button>
          <div className="panel-tab-strip flex-1">
            <button
              className={modeTabClass(mode === 'play')}
              onClick={() => setMode('play')}
            >
              Play
            </button>
            <button
              className={modeTabClass(mode === 'analyze')}
              onClick={() => setMode('analyze')}
            >
              Analysis
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col">
            {/* Game Tree */}
            {renderSection({
              show: showTree,
              title: 'Game Tree',
              icon: <FaSitemap size={12} />,
              open: modePanels.treeOpen,
              onToggle: () => updatePanels((current) => ({ treeOpen: !current.treeOpen })),
              actions: (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={treeViewTabClass(treeView === 'tree')}
                    onClick={() => setTreeView('tree')}
                    title="Tree view"
                  >
                    <FaSitemap size={12} />
                  </button>
                  <button
                    type="button"
                    className={treeViewTabClass(treeView === 'list')}
                    onClick={() => setTreeView('list')}
                    title="List view"
                  >
                    <FaListUl size={12} />
                  </button>
                </div>
              ),
              contentClassName: 'panel-section-content',
              children: (
                <>
                  <div className="panel-toolbar">
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="To start (Home)"
                      onClick={() => guardInsertMode(navigateStart)}
                      disabled={isInsertMode}
                    >
                      <FaFastBackward size={12} />
                    </button>
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="To end (End)"
                      onClick={() => guardInsertMode(navigateEnd)}
                      disabled={isInsertMode}
                    >
                      <FaFastForward size={12} />
                    </button>
                    <div className="h-5 w-px bg-[var(--ui-border)] mx-1" />
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="Previous branch (↑)"
                      onClick={() => guardInsertMode(() => switchBranch(-1))}
                      disabled={isInsertMode}
                    >
                      <FaArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="Next branch (↓)"
                      onClick={() => guardInsertMode(() => switchBranch(1))}
                      disabled={isInsertMode}
                    >
                      <FaArrowDown size={12} />
                    </button>
                    <div className="h-5 w-px bg-[var(--ui-border)] mx-1" />
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="Back to branch point (B)"
                      onClick={() => guardInsertMode(undoToBranchPoint)}
                      disabled={isInsertMode}
                    >
                      <FaLevelUpAlt size={12} />
                    </button>
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="Back to main branch (Shift+B)"
                      onClick={() => guardInsertMode(undoToMainBranch)}
                      disabled={isInsertMode}
                    >
                      <FaSitemap size={12} />
                    </button>
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="Make main branch"
                      onClick={() => guardInsertMode(makeCurrentNodeMainBranch)}
                      disabled={isInsertMode || !currentNode.parent}
                    >
                      <FaStar size={12} />
                    </button>
                  </div>
                  <div style={{ height: treeHeight }} className="overflow-y-auto">
                    {treeView === 'tree' ? (
                      <MoveTree />
                    ) : (
                      <div className="divide-y divide-[var(--ui-border)]">
                        {pathNodes.map((node, idx) => {
                          const move = node.move;
                          const isCurrent = node.id === currentNode.id;
                          const label = move ? formatMoveLabel(move.x, move.y) : 'Root';
                          const player = move ? playerToShort(move.player) : '—';
                          const hasNote = !!node.note?.trim();
                          return (
                            <button
                              key={node.id}
                              type="button"
                              className={[
                                'w-full px-2 py-1 flex items-center gap-2 text-left text-xs',
                                isCurrent ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]' : 'hover:bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
                              ].join(' ')}
                              onClick={() => guardInsertMode(() => useGameStore.getState().jumpToNode(node))}
                              disabled={isInsertMode}
                              title={isInsertMode ? 'Finish inserting before navigating.' : 'Jump to move'}
                            >
                              <span className="w-10 text-[10px] font-mono text-slate-500">
                                {idx === 0 ? 'Root' : idx}
                              </span>
                              <span
                                className={[
                                  'text-[10px] font-mono px-1.5 py-0.5 rounded',
                                  move?.player === 'black' ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-900',
                                ].join(' ')}
                              >
                                {player}
                              </span>
                              <span className="text-xs font-medium">{label}</span>
                              {hasNote && (
                                <span className="ml-auto text-[9px] uppercase tracking-wide text-[var(--ui-warning)]">note</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div
                    className="hidden lg:block h-1 cursor-row-resize bg-[var(--ui-border)] hover:bg-[var(--ui-border-strong)] transition-colors"
                    onMouseDown={(e) => {
                      treeResizeRef.current = { startY: e.clientY, startHeight: treeHeight };
                      setIsResizingTree(true);
                    }}
                  />
                </>
              ),
            })}

            {/* Analysis */}
            {renderSection({
              show: showAnalysis && showAnalysisSection,
              title: 'Analysis',
              icon: <FaChartLine size={12} />,
              open: modePanels.analysisOpen,
              onToggle: () => updatePanels((current) => ({ analysisOpen: !current.analysisOpen })),
              contentClassName: 'panel-section-content overflow-y-auto',
              contentStyle: { height: analysisHeight },
              onResize: (e) => {
                analysisResizeRef.current = { startY: e.clientY, startHeight: analysisHeight };
                setIsResizingAnalysis(true);
              },
              children: (
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
                  onOpenGameAnalysis={onOpenGameAnalysis}
                  onOpenGameReport={onOpenGameReport}
                  winRate={winRate}
                  scoreLead={scoreLead}
                  pointsLost={pointsLost}
                />
              ),
            })}

            {/* Comment / Notes */}
            {renderSection({
              show: showNotes,
              title: 'Comment',
              icon: <FaCommentDots size={12} />,
              open: modePanels.notesOpen,
              onToggle: () => updatePanels((current) => ({ notesOpen: !current.notesOpen })),
              wrapperClassName: 'pb-2',
              contentClassName: 'panel-section-content',
              contentStyle: { height: notesHeight },
              onResize: (e) => {
                notesResizeRef.current = { startY: e.clientY, startHeight: notesHeight };
                setIsResizingNotes(true);
              },
              children: (
                <div className="flex flex-col h-full">
                  <div className="panel-toolbar text-[11px] ui-text-faint">
                    <div className="truncate text-xs text-[var(--ui-text)]">
                      <span className="font-mono">{playerToShort(currentPlayer)}</span> ·{' '}
                      <span className="font-mono">{moveHistory.length}</span> ·{' '}
                      <span className="font-mono">{currentNode.move ? formatMoveLabel(currentNode.move.x, currentNode.move.y) : 'Root'}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        className={noteToggleClass(notesListOpen)}
                        onClick={() => setNotesListOpen((prev) => !prev)}
                        title="Notes list"
                        aria-pressed={notesListOpen}
                      >
                        <FaListUl size={12} />
                      </button>
                      <button
                        type="button"
                        className={noteToggleClass(modePanels.notes.info)}
                        onClick={() => updatePanels((current) => ({ notes: { ...current.notes, info: !current.notes.info } }))}
                        title="Info"
                        aria-pressed={modePanels.notes.info}
                      >
                        <FaInfoCircle size={12} />
                      </button>
                      <button
                        type="button"
                        className={noteToggleClass(modePanels.notes.infoDetails)}
                        onClick={() =>
                          updatePanels((current) => ({ notes: { ...current.notes, infoDetails: !current.notes.infoDetails } }))
                        }
                        title="Details"
                        aria-pressed={modePanels.notes.infoDetails}
                      >
                        <FaAlignLeft size={12} />
                      </button>
                      <button
                        type="button"
                        className={noteToggleClass(modePanels.notes.notes)}
                        onClick={() => updatePanels((current) => ({ notes: { ...current.notes, notes: !current.notes.notes } }))}
                        title="Notes"
                        aria-pressed={modePanels.notes.notes}
                      >
                        <FaStickyNote size={12} />
                      </button>
                    </div>
                  </div>
                  {(statusText || engineError) && (
                    <div className="px-3 py-2 border-b border-[var(--ui-border)] text-[11px] ui-text-faint">
                      {engineError ? <span className="text-[var(--ui-danger)]">{statusText}</span> : statusText}
                    </div>
                  )}
                  {notesListOpen && (
                    <div className="border-b border-[var(--ui-border)] max-h-40 overflow-y-auto">
                      {notesNodes.length === 0 ? (
                        <div className="px-3 py-2 text-xs ui-text-faint">No notes yet.</div>
                      ) : (
                        notesNodes.map(({ node, label, snippet }) => {
                          const isCurrent = node.id === currentNode.id;
                          return (
                            <button
                              key={node.id}
                              type="button"
                              className={[
                                'w-full px-2 py-1 text-left text-xs',
                                isCurrent ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]' : 'hover:bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
                              ].join(' ')}
                              onClick={() => guardInsertMode(() => useGameStore.getState().jumpToNode(node))}
                              disabled={isInsertMode}
                              title={isInsertMode ? 'Finish inserting before navigating.' : 'Jump to noted move'}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono ui-text-faint">{label}</span>
                                <span className="truncate">{snippet}</span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <NotesPanel
                      showInfo={modePanels.notes.info || modePanels.notes.infoDetails}
                      detailed={modePanels.notes.infoDetails && !lockAiDetails}
                      showNotes={modePanels.notes.notes}
                    />
                  </div>
                </div>
              ),
            })}
          </div>
        </div>
        <div className="status-bar">
          <div className="status-bar-section status-bar-left">
            <span className="status-bar-text truncate">{blackName} vs {whiteName}</span>
            <span className="status-bar-divider">•</span>
            <span className="status-bar-item">Komi {komi}</span>
            <span className="status-bar-divider">•</span>
            <span className="status-bar-item">Moves {moveHistory.length}</span>
            <span className="status-bar-divider">•</span>
            <span className="status-bar-item">Capt B:{capturedWhite} W:{capturedBlack}</span>
            {endResult && (
              <>
                <span className="status-bar-divider">•</span>
                <span className="status-bar-item">Result {endResult}</span>
              </>
            )}
          </div>
          <div className="status-bar-section status-bar-right">
            <button
              type="button"
              className="status-bar-button"
              onClick={handleUndo}
              title="Undo (left arrow)"
            >
              Undo
            </button>
            <button
              type="button"
              className="status-bar-button danger"
              onClick={handleResign}
            >
              Resign
            </button>
            {mode === 'play' && (
              <>
                <span className="status-bar-divider">•</span>
                <Timer variant="status" />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

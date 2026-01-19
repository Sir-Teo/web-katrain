import React from 'react';
import { FaTimes, FaFastBackward, FaFastForward, FaArrowUp, FaArrowDown, FaLevelUpAlt, FaSitemap } from 'react-icons/fa';
import type { Player, GameNode, Move } from '../../types';
import { useGameStore } from '../../store/gameStore';
import { AnalysisPanel } from '../AnalysisPanel';
import { MoveTree } from '../MoveTree';
import { NotesPanel } from '../NotesPanel';
import { Timer } from '../Timer';
import type { UiMode, UiState } from './types';
import type { MobileTab } from './MobileTabBar';
import { IconButton, PanelHeaderButton, SectionHeader, formatMoveLabel, panelCardBase, panelCardClosed, panelCardOpen, playerToShort } from './ui';

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
  isAiPlaying: boolean;
  aiColor: Player | null;
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
  setRootProperty: (key: string, value: string) => void;
  resign: () => void;
  toggleAi: (color: Player) => void;
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
  isAiPlaying,
  aiColor,
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
  setRootProperty,
  resign,
  toggleAi,
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
  const isAiBlack = isAiPlaying && aiColor === 'black';
  const isAiWhite = isAiPlaying && aiColor === 'white';
  const showTree = !isMobile || activeMobileTab === 'tree';
  const showInfo = !isMobile || activeMobileTab === 'info';
  const showAnalysis = !isMobile || activeMobileTab === 'analysis';
  const showNotes = !isMobile || activeMobileTab === 'info';

  const modeTabClass = (active: boolean) => [
    'flex-1 h-10 rounded-lg font-semibold border transition-all',
    active
      ? 'bg-[var(--ui-accent-soft)] border-[var(--ui-accent)] text-[var(--ui-accent)] shadow-sm'
      : 'bg-[var(--ui-panel)] border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-white',
  ].join(' ');

  const treeViewTabClass = (active: boolean) => [
    'px-2 py-1 rounded text-xs font-semibold border',
    active
      ? 'bg-[var(--ui-surface-2)] text-[var(--ui-text)] border-[var(--ui-border-strong)]'
      : 'bg-[var(--ui-panel)] text-[var(--ui-text-muted)] border-[var(--ui-border)] hover:bg-[var(--ui-surface-2)] hover:text-white',
  ].join(' ');

  const guardInsertMode = (action: () => void) => {
    if (isInsertMode) {
      toast('Finish inserting before navigating.', 'error');
      return;
    }
    action();
  };

  const analysisCounts = React.useMemo(() => {
    void treeVersion;
    let analyzed = 0;
    let total = 0;
    const stack: GameNode[] = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.move) total += 1;
      if (node.analysis) analyzed += 1;
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
    }
    return { analyzed, total };
  }, [rootNode, treeVersion]);

  const rootProps = rootNode.properties ?? {};
  const getProp = (key: string) => rootProps[key]?.[0] ?? '';
  const blackName = getProp('PB') || 'Black';
  const whiteName = getProp('PW') || 'White';
  const blackRank = getProp('BR');
  const whiteRank = getProp('WR');

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
          'mx-3 mt-3',
          panelCardBase,
          wrapperTone,
          args.wrapperClassName ?? '',
        ].join(' ')}
      >
        <SectionHeader title={args.title} open={args.open} onToggle={args.onToggle} actions={args.actions} />
        {args.open ? (
          <div className={args.contentClassName ?? 'mt-1'} style={args.contentStyle}>
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
  const infoResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const analysisResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const notesResizeRef = React.useRef<{ startY: number; startHeight: number } | null>(null);
  const [infoHeight, setInfoHeight] = React.useState(() => {
    if (typeof localStorage === 'undefined') return 260;
    const raw = localStorage.getItem('web-katrain:info_height:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 260;
  });
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
  const [isResizingInfo, setIsResizingInfo] = React.useState(false);
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
    localStorage.setItem('web-katrain:info_height:v1', String(infoHeight));
  }, [infoHeight]);

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
    if (!isResizingInfo) return;
    const minHeight = 200;
    const maxHeight = 520;
    const onMove = (e: MouseEvent) => {
      if (!infoResizeRef.current) return;
      const delta = e.clientY - infoResizeRef.current.startY;
      const next = Math.min(maxHeight, Math.max(minHeight, infoResizeRef.current.startHeight + delta));
      setInfoHeight(next);
    };
    const onUp = () => {
      setIsResizingInfo(false);
      infoResizeRef.current = null;
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingInfo]);

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

  const renderPlayerInfo = (player: Player) => {
    const isTurn = currentPlayer === player;
    const isAi = isAiPlaying && aiColor === player;
    const caps = player === 'black' ? capturedWhite : capturedBlack;
    const name = player === 'black' ? blackName : whiteName;
    const rank = player === 'black' ? blackRank : whiteRank;

    return (
      <div
        className={[
          'flex-1 rounded-lg px-2.5 py-2 flex items-center gap-2.5 shadow-sm transition-all',
          isTurn
            ? 'bg-[var(--ui-surface-2)] border-2 border-[var(--ui-accent)] shadow-sm shadow-black/20'
            : 'bg-[var(--ui-surface)] border border-[var(--ui-border)]',
        ].join(' ')}
      >
        <div
          className={[
            'h-9 w-9 rounded-full flex items-center justify-center font-bold shadow-sm text-sm',
            player === 'black'
              ? 'bg-slate-950 text-white border-2 border-slate-700'
              : 'bg-slate-100 text-slate-900 border-2 border-slate-300',
          ].join(' ')}
          title={player === 'black' ? blackName : whiteName}
        >
          {caps}
        </div>
        <div className="flex flex-col leading-tight min-w-0 flex-1">
          <div className="text-xs font-medium text-[var(--ui-text)] truncate">{name}</div>
          <div className="text-[11px] ui-text-faint">{rank || (player === 'black' ? 'Black' : 'White')}</div>
          <div className="text-[10px] ui-text-faint uppercase tracking-wide">{isAi ? 'AI' : 'Human'}</div>
        </div>
        {isTurn && <div className="ml-auto text-xs font-semibold text-[var(--ui-accent)] whitespace-nowrap">to play</div>}
      </div>
    );
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
          <div className="flex flex-1 gap-2">
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

        <div className="flex-1 min-h-0 overflow-y-auto pb-4">
          <div className="flex flex-col">
            {/* Game Tree */}
            {renderSection({
              show: showTree,
              title: 'Game Tree',
              open: modePanels.treeOpen,
              onToggle: () => updatePanels((current) => ({ treeOpen: !current.treeOpen })),
              actions: (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={treeViewTabClass(treeView === 'tree')}
                    onClick={() => setTreeView('tree')}
                  >
                    Tree
                  </button>
                  <button
                    type="button"
                    className={treeViewTabClass(treeView === 'list')}
                    onClick={() => setTreeView('list')}
                  >
                    List
                  </button>
                </div>
              ),
              contentClassName: 'mt-2 ui-surface border rounded-lg overflow-hidden',
              children: (
                <>
                  <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--ui-border)] bg-[var(--ui-surface)]">
                    <IconButton
                      title="To start (Home)"
                      onClick={() => guardInsertMode(navigateStart)}
                      disabled={isInsertMode}
                      className="h-8 w-8"
                    >
                      <FaFastBackward size={12} />
                    </IconButton>
                    <IconButton
                      title="To end (End)"
                      onClick={() => guardInsertMode(navigateEnd)}
                      disabled={isInsertMode}
                      className="h-8 w-8"
                    >
                      <FaFastForward size={12} />
                    </IconButton>
                    <div className="h-6 w-px bg-[var(--ui-border)] mx-1" />
                    <IconButton
                      title="Previous branch (↑)"
                      onClick={() => guardInsertMode(() => switchBranch(-1))}
                      disabled={isInsertMode}
                      className="h-8 w-8"
                    >
                      <FaArrowUp size={12} />
                    </IconButton>
                    <IconButton
                      title="Next branch (↓)"
                      onClick={() => guardInsertMode(() => switchBranch(1))}
                      disabled={isInsertMode}
                      className="h-8 w-8"
                    >
                      <FaArrowDown size={12} />
                    </IconButton>
                    <div className="h-6 w-px bg-[var(--ui-border)] mx-1" />
                    <IconButton
                      title="Back to branch point (B)"
                      onClick={() => guardInsertMode(undoToBranchPoint)}
                      disabled={isInsertMode}
                      className="h-8 w-8"
                    >
                      <FaLevelUpAlt size={12} />
                    </IconButton>
                    <IconButton
                      title="Back to main branch (Shift+B)"
                      onClick={() => guardInsertMode(undoToMainBranch)}
                      disabled={isInsertMode}
                      className="h-8 w-8"
                    >
                      <FaSitemap size={12} />
                    </IconButton>
                    <div className="flex-1" />
                    <button
                      type="button"
                      className="px-2 py-1 rounded text-xs font-semibold bg-[var(--ui-surface-2)] text-[var(--ui-text)] hover:brightness-110 border border-[var(--ui-border)] disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => guardInsertMode(makeCurrentNodeMainBranch)}
                      disabled={isInsertMode || !currentNode.parent}
                    >
                      Make main
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
                                'w-full px-3 py-2 flex items-center gap-3 text-left',
                                isCurrent ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]' : 'hover:bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
                              ].join(' ')}
                              onClick={() => guardInsertMode(() => useGameStore.getState().jumpToNode(node))}
                              disabled={isInsertMode}
                              title={isInsertMode ? 'Finish inserting before navigating.' : 'Jump to move'}
                            >
                              <span className="w-12 text-xs font-mono text-slate-500">
                                {idx === 0 ? 'Root' : idx}
                              </span>
                              <span
                                className={[
                                  'text-xs font-mono px-1.5 py-0.5 rounded',
                                  move?.player === 'black' ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-900',
                                ].join(' ')}
                              >
                                {player}
                              </span>
                              <span className="text-sm font-medium">{label}</span>
                              {hasNote && (
                                <span className="ml-auto text-[10px] uppercase tracking-wide text-[var(--ui-warning)]">note</span>
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

            {/* Game Info */}
            {renderSection({
              show: showInfo,
              title: 'Game Info',
              open: modePanels.infoOpen,
              onToggle: () => updatePanels((current) => ({ infoOpen: !current.infoOpen })),
              contentClassName: 'mt-1 space-y-3 overflow-y-auto pr-1',
              contentStyle: { height: infoHeight },
              onResize: (e) => {
                infoResizeRef.current = { startY: e.clientY, startHeight: infoHeight };
                setIsResizingInfo(true);
              },
              children: (
                <>
                  <div className="flex gap-2">{renderPlayerInfo('black')}{renderPlayerInfo('white')}</div>
                  <Timer />
                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--ui-text-muted)]">
                    <div className="flex items-center justify-between">
                      <span className="ui-text-faint">Komi</span>
                      <span className="font-mono text-[var(--ui-text)]">{komi}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="ui-text-faint">Moves</span>
                      <span className="font-mono text-[var(--ui-text)]">{moveHistory.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="ui-text-faint">Captured</span>
                      <span className="font-mono text-[var(--ui-text)]">B:{capturedWhite} · W:{capturedBlack}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="ui-text-faint">Analyzed</span>
                      <span className="font-mono text-[var(--ui-text)]">{analysisCounts.analyzed}/{analysisCounts.total}</span>
                    </div>
                  </div>
                  {endResult && (
                    <div className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]">
                      <span className="ui-text-faint">Result</span>
                      <span className="font-mono text-[var(--ui-text)]">{endResult}</span>
                    </div>
                  )}

                  <div className="border-t border-[var(--ui-border)] pt-2">
                    <div className="text-xs ui-text-faint mb-2">Metadata</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">Black</label>
                        <input
                          value={getProp('PB')}
                          onChange={(e) => setRootProperty('PB', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="Name"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">White</label>
                        <input
                          value={getProp('PW')}
                          onChange={(e) => setRootProperty('PW', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="Name"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">B Rank</label>
                        <input
                          value={getProp('BR')}
                          onChange={(e) => setRootProperty('BR', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="Rank"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">W Rank</label>
                        <input
                          value={getProp('WR')}
                          onChange={(e) => setRootProperty('WR', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="Rank"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">Event</label>
                        <input
                          value={getProp('EV')}
                          onChange={(e) => setRootProperty('EV', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="Event"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">Date</label>
                        <input
                          value={getProp('DT')}
                          onChange={(e) => setRootProperty('DT', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">Result</label>
                        <input
                          value={getProp('RE')}
                          onChange={(e) => setRootProperty('RE', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="B+R / W+0.5"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">Place</label>
                        <input
                          value={getProp('PC')}
                          onChange={(e) => setRootProperty('PC', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="Location"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="ui-text-faint">Game</label>
                        <input
                          value={getProp('GN')}
                          onChange={(e) => setRootProperty('GN', e.target.value)}
                          className="ui-input border rounded px-2 py-1 text-[var(--ui-text)]"
                          placeholder="Game name"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="flex-1 px-3 py-2.5 rounded-lg bg-[var(--ui-surface-2)] hover:brightness-110 text-sm font-medium text-[var(--ui-text)] transition-colors border border-[var(--ui-border)]"
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
                      className="flex-1 px-3 py-2.5 rounded-lg ui-danger-soft text-sm font-medium transition-colors border hover:brightness-110"
                      onClick={() => {
                        const result = currentPlayer === 'black' ? 'W+R' : 'B+R';
                        resign();
                        toast(`Result: ${result}`, 'info');
                      }}
                    >
                      Resign
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className={[
                        'flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                        isAiWhite ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border-2 border-[var(--ui-accent)] shadow-sm shadow-black/20' : 'bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] border border-[var(--ui-border)] hover:text-white',
                      ].join(' ')}
                      onClick={() => toggleAi('white')}
                    >
                      White AI
                    </button>
                    <button
                      className={[
                        'flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                        isAiBlack ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] border-2 border-[var(--ui-accent)] shadow-sm shadow-black/20' : 'bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] border border-[var(--ui-border)] hover:text-white',
                      ].join(' ')}
                      onClick={() => toggleAi('black')}
                    >
                      Black AI
                    </button>
                  </div>
                </>
              ),
            })}

            {/* Analysis */}
            {renderSection({
              show: showAnalysis && showAnalysisSection,
              title: 'Analysis',
              open: modePanels.analysisOpen,
              onToggle: () => updatePanels((current) => ({ analysisOpen: !current.analysisOpen })),
              contentClassName: 'mt-1 overflow-y-auto pr-1',
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
              open: modePanels.notesOpen,
              onToggle: () => updatePanels((current) => ({ notesOpen: !current.notesOpen })),
              actions: (
                <div className="flex gap-1">
                  <PanelHeaderButton
                    label="List"
                    colorClass="bg-amber-600/30"
                    active={notesListOpen}
                    onClick={() => setNotesListOpen((prev) => !prev)}
                  />
                  <PanelHeaderButton
                    label="Info"
                    colorClass="bg-[var(--ui-surface-2)]"
                    active={modePanels.notes.info}
                    onClick={() => updatePanels((current) => ({ notes: { ...current.notes, info: !current.notes.info } }))}
                  />
                  <PanelHeaderButton
                    label="Details"
                    colorClass="bg-[var(--ui-surface-2)]"
                    active={modePanels.notes.infoDetails}
                    onClick={() =>
                      updatePanels((current) => ({ notes: { ...current.notes, infoDetails: !current.notes.infoDetails } }))
                    }
                  />
                  <PanelHeaderButton
                    label="Notes"
                    colorClass="bg-purple-600/30"
                    active={modePanels.notes.notes}
                    onClick={() => updatePanels((current) => ({ notes: { ...current.notes, notes: !current.notes.notes } }))}
                  />
                </div>
              ),
              wrapperClassName: 'pb-2',
              contentClassName: 'mt-1 ui-surface rounded-lg min-h-0 overflow-hidden flex flex-col',
              contentStyle: { height: notesHeight },
              onResize: (e) => {
                notesResizeRef.current = { startY: e.clientY, startHeight: notesHeight };
                setIsResizingNotes(true);
              },
              children: (
                <>
                  <div className="px-3 py-2 border-b border-[var(--ui-border)] text-xs text-[var(--ui-text)] flex items-center justify-between">
                    <div className="truncate">
                      <span className="font-mono">{playerToShort(currentPlayer)}</span> ·{' '}
                      <span className="font-mono">{moveHistory.length}</span> ·{' '}
                      <span className="font-mono">{currentNode.move ? formatMoveLabel(currentNode.move.x, currentNode.move.y) : 'Root'}</span>
                    </div>
                    {engineError && <span className="text-[var(--ui-danger)]">error</span>}
                  </div>
                  <div className="px-3 py-2 border-b border-[var(--ui-border)] text-xs ui-text-faint">
                    {statusText}
                  </div>
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
                                'w-full px-3 py-2 text-left text-xs',
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
                </>
              ),
            })}
          </div>
        </div>
      </div>
    </>
  );
};

import React from 'react';
import { FaChevronDown, FaChevronRight, FaTimes, FaFastBackward, FaFastForward, FaArrowUp, FaArrowDown, FaLevelUpAlt, FaSitemap } from 'react-icons/fa';
import type { Player, GameNode, Move } from '../../types';
import { useGameStore } from '../../store/gameStore';
import { ScoreWinrateGraph } from '../ScoreWinrateGraph';
import { MoveTree } from '../MoveTree';
import { NotesPanel } from '../NotesPanel';
import { Timer } from '../Timer';
import type { UiMode, UiState } from './types';
import type { MobileTab } from './MobileTabBar';
import { IconButton, PanelHeaderButton, formatMoveLabel, playerToShort } from './ui';

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  showOnDesktop?: boolean;
  isMobile?: boolean;
  activeMobileTab?: MobileTab;
  mode: UiMode;
  setMode: (m: UiMode) => void;
  modePanels: UiState['panels'][UiMode];
  updatePanels: (partial: Partial<UiState['panels'][UiMode]>) => void;
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

  const SectionHeader: React.FC<{
    title: string;
    open: boolean;
    onToggle: () => void;
    actions?: React.ReactNode;
  }> = ({ title, open, onToggle, actions }) => (
    <div className="flex items-center justify-between">
      <button
        type="button"
        className="text-sm font-semibold text-slate-200 hover:text-white flex items-center gap-2"
        onClick={onToggle}
      >
        {open ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
        {title}
      </button>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );

  const renderPlayerInfo = (player: Player) => {
    const isTurn = currentPlayer === player;
    const isAi = isAiPlaying && aiColor === player;
    const caps = player === 'black' ? capturedWhite : capturedBlack;

    return (
      <div
        className={[
          'flex-1 rounded-lg px-3 py-2 flex items-center gap-3 shadow-lg shadow-black/20',
          isTurn ? 'bg-slate-700/90 border border-slate-500/50' : 'bg-slate-800/50 border border-slate-700/30',
        ].join(' ')}
      >
        <div
          className={[
            'h-10 w-10 rounded-full flex items-center justify-center font-bold shadow-md',
            player === 'black' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900',
          ].join(' ')}
          title={player === 'black' ? 'Black' : 'White'}
        >
          {caps}
        </div>
        <div className="flex flex-col leading-tight">
          <div className="text-xs text-slate-400">{player === 'black' ? 'Black' : 'White'}</div>
          <div className="text-sm font-semibold text-slate-100">{isAi ? 'AI' : 'Human'}</div>
        </div>
        {isTurn && <div className="ml-auto text-xs font-mono text-emerald-400">to play</div>}
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
          'bg-slate-800 border-l border-slate-700/50 flex flex-col',
          'fixed inset-y-0 right-0 z-40 w-full max-w-md',
          open ? 'flex' : 'hidden',
          'lg:static lg:max-w-none lg:z-auto',
          showOnDesktop ? 'lg:flex' : 'lg:hidden',
          isMobile ? 'pb-16' : '',
        ].join(' ')}
        style={width ? { width } : undefined}
      >
        {/* Play / Analyze tabs */}
        <div className="h-14 border-b border-slate-700/50 flex items-center p-2 gap-2">
          <button
            type="button"
            className="lg:hidden h-10 w-10 flex items-center justify-center rounded hover:bg-slate-700 text-slate-300 hover:text-white"
            onClick={onClose}
            title="Close side panel"
          >
            <FaTimes />
          </button>
          <button
            className={[
              'flex-1 h-10 rounded font-semibold border',
              mode === 'play' ? 'bg-blue-600/30 border-blue-500 text-white' : 'bg-slate-900 border-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white',
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
                : 'bg-slate-900 border-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white',
            ].join(' ')}
            onClick={() => setMode('analyze')}
          >
            Analysis
          </button>
        </div>

        {/* Game Tree */}
        {showTree && (
          <div className="px-3 pb-3">
            <SectionHeader
              title="Game Tree"
              open={modePanels.treeOpen}
              onToggle={() => updatePanels({ treeOpen: !modePanels.treeOpen })}
              actions={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={[
                      'px-2 py-1 rounded text-xs font-semibold border',
                      treeView === 'tree'
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-slate-900 text-slate-400 border-slate-700/50 hover:bg-slate-700 hover:text-white',
                    ].join(' ')}
                    onClick={() => setTreeView('tree')}
                  >
                    Tree
                  </button>
                  <button
                    type="button"
                    className={[
                      'px-2 py-1 rounded text-xs font-semibold border',
                      treeView === 'list'
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-slate-900 text-slate-400 border-slate-700/50 hover:bg-slate-700 hover:text-white',
                    ].join(' ')}
                    onClick={() => setTreeView('list')}
                  >
                    List
                  </button>
                </div>
              }
            />
            {modePanels.treeOpen && (
              <div className="mt-2 bg-slate-900 border border-slate-700/50 rounded overflow-hidden">
                <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-800 bg-slate-900/80">
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
                  <div className="h-6 w-px bg-slate-700/60 mx-1" />
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
                  <div className="h-6 w-px bg-slate-700/60 mx-1" />
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
                    className="px-2 py-1 rounded text-xs font-semibold bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 border border-slate-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <div className="divide-y divide-slate-800">
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
                              isCurrent ? 'bg-emerald-500/10 text-emerald-100' : 'hover:bg-slate-800/60 text-slate-200',
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
                              <span className="ml-auto text-[10px] uppercase tracking-wide text-amber-300">note</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div
                  className="hidden lg:block h-1 cursor-row-resize bg-slate-800/70 hover:bg-slate-600/80 transition-colors"
                  onMouseDown={(e) => {
                    treeResizeRef.current = { startY: e.clientY, startHeight: treeHeight };
                    setIsResizingTree(true);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Game Info */}
        {showInfo && (
          <div className="px-3 pb-3">
            <SectionHeader
              title="Game Info"
              open={modePanels.infoOpen}
              onToggle={() => updatePanels({ infoOpen: !modePanels.infoOpen })}
            />
            {modePanels.infoOpen && (
              <div className="mt-2 bg-slate-900 border border-slate-700/50 rounded p-3 space-y-3">
                <div className="flex gap-2">{renderPlayerInfo('black')}{renderPlayerInfo('white')}</div>
                <Timer />
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Komi</span>
                    <span className="font-mono text-slate-100">{komi}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Moves</span>
                    <span className="font-mono text-slate-100">{moveHistory.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Captured</span>
                    <span className="font-mono text-slate-100">B:{capturedWhite} · W:{capturedBlack}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Analyzed</span>
                    <span className="font-mono text-slate-100">{analysisCounts.analyzed}/{analysisCounts.total}</span>
                  </div>
                </div>
              {endResult && (
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="text-slate-400">Result</span>
                  <span className="font-mono text-slate-100">{endResult}</span>
                </div>
              )}

              <div className="rounded border border-slate-700/50 bg-slate-900/70 p-2">
                <div className="text-xs text-slate-400 mb-2">Metadata</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-500">Black</label>
                    <input
                      value={getProp('PB')}
                      onChange={(e) => setRootProperty('PB', e.target.value)}
                      className="bg-slate-800/70 border border-slate-700/50 rounded px-2 py-1 text-slate-200"
                      placeholder="Name"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-500">White</label>
                    <input
                      value={getProp('PW')}
                      onChange={(e) => setRootProperty('PW', e.target.value)}
                      className="bg-slate-800/70 border border-slate-700/50 rounded px-2 py-1 text-slate-200"
                      placeholder="Name"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-500">B Rank</label>
                    <input
                      value={getProp('BR')}
                      onChange={(e) => setRootProperty('BR', e.target.value)}
                      className="bg-slate-800/70 border border-slate-700/50 rounded px-2 py-1 text-slate-200"
                      placeholder="Rank"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-500">W Rank</label>
                    <input
                      value={getProp('WR')}
                      onChange={(e) => setRootProperty('WR', e.target.value)}
                      className="bg-slate-800/70 border border-slate-700/50 rounded px-2 py-1 text-slate-200"
                      placeholder="Rank"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-500">Event</label>
                    <input
                      value={getProp('EV')}
                      onChange={(e) => setRootProperty('EV', e.target.value)}
                      className="bg-slate-800/70 border border-slate-700/50 rounded px-2 py-1 text-slate-200"
                      placeholder="Event"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-slate-500">Date</label>
                    <input
                      value={getProp('DT')}
                      onChange={(e) => setRootProperty('DT', e.target.value)}
                      className="bg-slate-800/70 border border-slate-700/50 rounded px-2 py-1 text-slate-200"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                  <button
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-600/80 text-sm font-medium text-slate-200"
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
                    className="flex-1 px-3 py-2 rounded-lg bg-rose-900/40 hover:bg-rose-800/50 text-sm font-medium text-rose-200"
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
                      'flex-1 px-3 py-2 rounded-lg text-sm font-medium',
                      isAiWhite ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/30',
                    ].join(' ')}
                    onClick={() => toggleAi('white')}
                  >
                    White AI
                  </button>
                  <button
                    className={[
                      'flex-1 px-3 py-2 rounded-lg text-sm font-medium',
                      isAiBlack ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border border-slate-700/30',
                    ].join(' ')}
                    onClick={() => toggleAi('black')}
                  >
                    Black AI
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Analysis */}
        {showAnalysis && (
          <div className="px-3 pb-3">
          <SectionHeader
            title="Analysis"
            open={modePanels.analysisOpen}
            onToggle={() => updatePanels({ analysisOpen: !modePanels.analysisOpen })}
            actions={
              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                <span className={['inline-block h-2.5 w-2.5 rounded-full', engineDot].join(' ')} />
                <span title={engineMetaTitle}>{engineMeta}</span>
              </div>
            }
          />
          {modePanels.analysisOpen && (
            <div className="mt-2 bg-slate-900 border border-slate-700/50 rounded p-3 space-y-3">
              <div className="text-xs text-slate-400">{statusText}</div>
              {isGameAnalysisRunning && gameAnalysisTotal > 0 && (
                <div>
                  <div className="h-2 rounded bg-slate-800/80 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500/70"
                      style={{ width: `${Math.min(100, Math.round((gameAnalysisDone / gameAnalysisTotal) * 100))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {gameAnalysisDone}/{gameAnalysisTotal} analyzed
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  className={[
                    'px-2 py-1 rounded text-xs font-medium',
                    isGameAnalysisRunning && gameAnalysisType === 'quick'
                      ? 'bg-rose-600/30 text-rose-200 border border-rose-500/50'
                      : 'bg-slate-800/60 text-slate-300 border border-slate-700/50 hover:bg-slate-700/60',
                  ].join(' ')}
                  onClick={() => {
                    if (isGameAnalysisRunning && gameAnalysisType === 'quick') stopGameAnalysis();
                    else startQuickGameAnalysis();
                  }}
                >
                  {isGameAnalysisRunning && gameAnalysisType === 'quick'
                    ? `Stop quick (${gameAnalysisDone}/${gameAnalysisTotal})`
                    : 'Run quick graph'}
                </button>
                <button
                  className={[
                    'px-2 py-1 rounded text-xs font-medium',
                    isGameAnalysisRunning && gameAnalysisType === 'fast'
                      ? 'bg-rose-600/30 text-rose-200 border border-rose-500/50'
                      : 'bg-slate-800/60 text-slate-300 border border-slate-700/50 hover:bg-slate-700/60',
                  ].join(' ')}
                  onClick={() => {
                    if (isGameAnalysisRunning && gameAnalysisType === 'fast') stopGameAnalysis();
                    else startFastGameAnalysis();
                  }}
                >
                  {isGameAnalysisRunning && gameAnalysisType === 'fast'
                    ? `Stop fast (${gameAnalysisDone}/${gameAnalysisTotal})`
                    : 'Run fast MCTS'}
                </button>
                <button
                  className="px-2 py-1 rounded text-xs font-medium bg-slate-800/60 text-slate-300 border border-slate-700/50 hover:bg-slate-700/60"
                  onClick={onOpenGameAnalysis}
                >
                  Re-analyze…
                </button>
                <button
                  className="px-2 py-1 rounded text-xs font-medium bg-slate-800/60 text-slate-300 border border-slate-700/50 hover:bg-slate-700/60"
                  onClick={onOpenGameReport}
                >
                  Game report…
                </button>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <button
                    className="text-sm font-semibold text-slate-200 hover:text-white"
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
                  <div className="mt-2 bg-slate-900 border border-slate-700/50 rounded p-2">
                    {modePanels.graph.score || modePanels.graph.winrate ? (
                      <div style={{ height: 140 }}>
                        <ScoreWinrateGraph showScore={modePanels.graph.score} showWinrate={modePanels.graph.winrate} />
                      </div>
                    ) : (
                      <div className="h-20 flex items-center justify-center text-slate-500 text-sm">Graph hidden</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <button
                    className="text-sm font-semibold text-slate-200 hover:text-white"
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
                  <div className="mt-2 bg-slate-900 border border-slate-700/50 rounded overflow-hidden">
                    {modePanels.stats.winrate && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                        <div className="text-sm text-slate-300">Winrate</div>
                        <div className="font-mono text-sm text-green-300">
                          {typeof winRate === 'number' ? `${(winRate * 100).toFixed(1)}%` : '-'}
                        </div>
                      </div>
                    )}
                    {modePanels.stats.score && (
                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                        <div className="text-sm text-slate-300">Score</div>
                        <div className="font-mono text-sm text-blue-300">
                          {typeof scoreLead === 'number' ? `${scoreLead > 0 ? '+' : ''}${scoreLead.toFixed(1)}` : '-'}
                        </div>
                      </div>
                    )}
                    {modePanels.stats.points && (
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="text-sm text-slate-300">{pointsLost != null && pointsLost < 0 ? 'Points gained' : 'Points lost'}</div>
                        <div className="font-mono text-sm text-red-300">{pointsLost != null ? Math.abs(pointsLost).toFixed(1) : '-'}</div>
                      </div>
                    )}
                    {!modePanels.stats.winrate && !modePanels.stats.score && !modePanels.stats.points && (
                      <div className="px-3 py-3 text-sm text-slate-500">Stats hidden</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        )}

        {/* Comment / Notes */}
        {showNotes && (
          <div className="px-3 pb-3 flex-1 flex flex-col min-h-0">
            <SectionHeader
              title="Comment"
              open={modePanels.notesOpen}
              onToggle={() => updatePanels({ notesOpen: !modePanels.notesOpen })}
              actions={
              <div className="flex gap-1">
                <PanelHeaderButton
                  label="List"
                  colorClass="bg-amber-600/30"
                  active={notesListOpen}
                  onClick={() => setNotesListOpen((prev) => !prev)}
                />
                <PanelHeaderButton
                  label="Info"
                  colorClass="bg-slate-700"
                  active={modePanels.notes.info}
                  onClick={() => updatePanels({ notes: { ...modePanels.notes, info: !modePanels.notes.info } })}
                />
                <PanelHeaderButton
                  label="Details"
                  colorClass="bg-slate-700"
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
              }
            />
            {modePanels.notesOpen && (
              <div className="mt-2 bg-slate-900 border border-slate-700/50 rounded flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <div className="truncate">
                  <span className="font-mono">{playerToShort(currentPlayer)}</span> ·{' '}
                  <span className="font-mono">{moveHistory.length}</span> ·{' '}
                  <span className="font-mono">{currentNode.move ? formatMoveLabel(currentNode.move.x, currentNode.move.y) : 'Root'}</span>
                </div>
                {engineError && <span className="text-red-300">error</span>}
              </div>
                <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-400">
                  {statusText}
                </div>
                {notesListOpen && (
                  <div className="border-b border-slate-800 max-h-40 overflow-y-auto">
                    {notesNodes.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">No notes yet.</div>
                    ) : (
                      notesNodes.map(({ node, label, snippet }) => {
                        const isCurrent = node.id === currentNode.id;
                        return (
                          <button
                            key={node.id}
                            type="button"
                            className={[
                              'w-full px-3 py-2 text-left text-xs',
                              isCurrent ? 'bg-emerald-500/10 text-emerald-100' : 'hover:bg-slate-800/60 text-slate-200',
                            ].join(' ')}
                            onClick={() => guardInsertMode(() => useGameStore.getState().jumpToNode(node))}
                            disabled={isInsertMode}
                            title={isInsertMode ? 'Finish inserting before navigating.' : 'Jump to noted move'}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-400">{label}</span>
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
          )}
          </div>
        )}
      </div>
    </>
  );
};

import React from 'react';
import {
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
  FaChevronLeft,
} from 'react-icons/fa';
import type { Player, GameNode } from '../../types';
import { useGameStore } from '../../store/gameStore';
import { AnalysisPanel } from '../AnalysisPanel';
import { GameInfoPanel } from '../GameInfoPanel';
import { MoveTree } from '../MoveTree';
import { NotesPanel } from '../NotesPanel';
import { Timer } from '../Timer';
import type { AnalysisControlsState, UiMode, UiState } from './types';
import type { MobileTab } from './MobileTabBar';
import type { MoveInsight } from '../../utils/moveInsight';
import { SectionHeader } from './ui';
import { formatMoveLabel, formatPositionSummary, panelCardBase, panelCardClosed, panelCardOpen, playerToShort } from './ui-utils';
import {
  getBranchInfo,
  getCurrentLineMoveNumber,
  getCurrentLineNodes,
  isGameNodeStep,
} from '../../utils/branchNavigation';
import { useShortcutLabels } from '../../hooks/useShortcutLabels';
import { parseIntegerDraft } from '../../utils/numberDraft';
import { readLocalStorage, writeLocalStorage } from '../../utils/storage';

const RIGHT_PANEL_SHORTCUT_IDS = [
  'nav-back',
  'ai-move',
  'nav-start',
  'nav-end',
  'branch-prev',
  'branch-next',
  'undo-branch-point',
  'undo-main-branch',
  'make-main-branch',
] as const;

type RightPanelShortcutId = (typeof RIGHT_PANEL_SHORTCUT_IDS)[number];

function getNoMoveNodeLabel(node: GameNode): string {
  if (!node.parent) return 'Root';
  if (isGameNodeStep(node)) return `Setup ${getCurrentLineMoveNumber(node)}`;
  return 'Node';
}

function getNodeMoveNumberLabel(node: GameNode): string {
  if (!node.parent) return 'Root';
  if (isGameNodeStep(node)) return String(getCurrentLineMoveNumber(node));
  return '-';
}

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
  analysisControls: AnalysisControlsState;
  updatePanels: (
    partial: Partial<UiState['panels'][UiMode]> | ((current: UiState['panels'][UiMode]) => Partial<UiState['panels'][UiMode]>)
  ) => void;
  updateControls: (partial: Partial<AnalysisControlsState>) => void;
  rootNode: GameNode;
  treeVersion: number;
  // Game analysis actions
  isGameAnalysisRunning: boolean;
  gameAnalysisType: string | null;
  gameAnalysisDone: number;
  gameAnalysisTotal: number;
  startQuickGameAnalysis: () => void;
  startFastGameAnalysis: (opts?: { moveRange?: [number, number] | null }) => void;
  stopGameAnalysis: () => void;
  clearAnalysisCache: () => void;
  analysisCacheSize: number;
  onOpenGameAnalysis: () => void;
  onOpenGameReport: () => void;
  // Player info
  currentPlayer: Player;
  // Navigation
  navigateStart: () => void;
  navigateEnd: () => void;
  switchBranch: (direction: 1 | -1) => void;
  switchToBranchIndex: (index: number) => void;
  undoToBranchPoint: () => void;
  undoToMainBranch: () => void;
  makeCurrentNodeMainBranch: () => void;
  isInsertMode: boolean;
  toast: (msg: string, type: 'info' | 'error' | 'success') => void;
  // Analysis
  winRate: number | null;
  scoreLead: number | null;
  pointsLost: number | null;
  // Engine status
  engineDot: string;
  engineMeta: string;
  engineMetaTitle: string | undefined;
  engineStatus: 'idle' | 'loading' | 'ready' | 'error';
  engineError: string | null;
  engineBackend: string | null;
  engineModelLabel: string | null;
  requestedBackend: string;
  modelUrl: string;
  statusText: string;
  lockAiDetails: boolean;
  // Notes
  currentNode: GameNode;
  currentMoveInsight?: MoveInsight | null;
  shapeCoachEnabled?: boolean;
  onToggleShapeCoach?: () => void;
  noteFocusRequest?: number;
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
  analysisControls,
  updatePanels,
  updateControls,
  rootNode,
  treeVersion,
  isGameAnalysisRunning,
  gameAnalysisType,
  gameAnalysisDone,
  gameAnalysisTotal,
  startQuickGameAnalysis,
  startFastGameAnalysis,
  stopGameAnalysis,
  clearAnalysisCache,
  analysisCacheSize,
  onOpenGameAnalysis,
  onOpenGameReport,
  currentPlayer,
  navigateStart,
  navigateEnd,
  switchBranch,
  switchToBranchIndex,
  undoToBranchPoint,
  undoToMainBranch,
  makeCurrentNodeMainBranch,
  isInsertMode,
  toast,
  winRate,
  scoreLead,
  pointsLost,
  engineDot,
  engineMeta,
  engineMetaTitle,
  engineStatus,
  engineError,
  engineBackend,
  engineModelLabel,
  requestedBackend,
  modelUrl,
  statusText,
  lockAiDetails,
  currentNode,
  currentMoveInsight = null,
  shapeCoachEnabled = true,
  onToggleShapeCoach,
  noteFocusRequest = 0,
}) => {
  const showTree = !isMobile || activeMobileTab === 'tree';
  const showAnalysis = !isMobile || activeMobileTab === 'info';
  const showNotes = !isMobile || activeMobileTab === 'info';
  const showGameInfo = !isMobile || activeMobileTab === 'info';

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

  const activeBranchChildIds = useGameStore((state) => state.activeBranchChildIds);
  const treeListNodes = React.useMemo(() => {
    void treeVersion;
    return getCurrentLineNodes(currentNode, activeBranchChildIds);
  }, [activeBranchChildIds, currentNode, treeVersion]);
  const currentMoveNumber = React.useMemo(() => {
    void treeVersion;
    return getCurrentLineMoveNumber(currentNode);
  }, [currentNode, treeVersion]);

  const branchInfo = React.useMemo(() => {
    void treeVersion;
    return getBranchInfo(currentNode);
  }, [currentNode, treeVersion]);
  const branchToolbarActionClass = branchInfo.hasBranches ? 'panel-icon-button' : 'hidden';
  const promoteBranchActionClass = branchInfo.hasBranches && branchInfo.currentIndex > 1 ? 'panel-icon-button' : 'hidden';
  const [isBranchIndexEditing, setIsBranchIndexEditing] = React.useState(false);
  const [branchIndexDraft, setBranchIndexDraft] = React.useState('');
  const skipBranchIndexBlurCommit = React.useRef(false);
  const shortcutLabels = useShortcutLabels(RIGHT_PANEL_SHORTCUT_IDS);
  const withShortcut = (label: string, id: RightPanelShortcutId) => `${label} (${shortcutLabels[id]})`;

  React.useEffect(() => {
    if (!isBranchIndexEditing) {
      setBranchIndexDraft(branchInfo.currentIndex > 0 ? String(branchInfo.currentIndex) : '');
    }
  }, [branchInfo.currentIndex, isBranchIndexEditing]);

  React.useEffect(() => {
    if (!branchInfo.hasBranches && isBranchIndexEditing) setIsBranchIndexEditing(false);
  }, [branchInfo.hasBranches, isBranchIndexEditing]);

  const commitBranchIndexEdit = () => {
    const parsed = parseIntegerDraft(branchIndexDraft);
    if (parsed != null && parsed >= 1) {
      guardInsertMode(() => switchToBranchIndex(parsed));
    } else {
      setBranchIndexDraft(branchInfo.currentIndex > 0 ? String(branchInfo.currentIndex) : '');
    }
    setIsBranchIndexEditing(false);
  };

  const cancelBranchIndexEdit = () => {
    skipBranchIndexBlurCommit.current = true;
    setBranchIndexDraft(branchInfo.currentIndex > 0 ? String(branchInfo.currentIndex) : '');
    setIsBranchIndexEditing(false);
  };

  const handleBranchIndexKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      cancelBranchIndexEdit();
      event.currentTarget.blur();
    }
  };

  const handleBranchIndexBlur = () => {
    if (skipBranchIndexBlurCommit.current) {
      skipBranchIndexBlurCommit.current = false;
      return;
    }
    commitBranchIndexEdit();
  };

  const notesNodes = React.useMemo(() => {
    void treeVersion;
    const out: Array<{ node: GameNode; label: string; snippet: string }> = [];
    const stack: GameNode[] = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.note && node.note.trim()) {
        const move = node.move;
        const label = move ? formatMoveLabel(move.x, move.y, node.gameState.board.length) : getNoMoveNodeLabel(node);
        const snippet = node.note.trim().split('\n')[0]!.slice(0, 60);
        out.push({ node, label, snippet });
      }
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
    }
    return out;
  }, [rootNode, treeVersion]);

  const currentPositionSummary = formatPositionSummary({
    move: currentNode.move,
    currentPlayer,
    moveNumber: currentMoveNumber,
    boardSize: currentNode.gameState.board.length,
    positionLabel: getNoMoveNodeLabel(currentNode),
  });

  const renderSection = (args: {
    show: boolean;
    title: string;
    icon?: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    actions?: React.ReactNode;
    hideHeader?: boolean;
    wrapperClassName?: string;
    contentClassName?: string;
    contentStyle?: React.CSSProperties;
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
        {!args.hideHeader && (
          <SectionHeader
            title={args.title}
            icon={args.icon}
            open={args.open}
            onToggle={args.onToggle}
            actions={args.actions}
          />
        )}
        {args.open ? (
          <div className={args.contentClassName ?? 'panel-section-content'} style={args.contentStyle}>
            {args.children}
          </div>
        ) : null}
      </div>
    );
  };

  const storedTreeView = readLocalStorage('web-katrain:tree_view:v1');
  const [treeView, setTreeView] = React.useState<'tree' | 'list'>(() => {
    if (storedTreeView === 'list' || storedTreeView === 'tree') return storedTreeView;
    return isMobile ? 'list' : 'tree';
  });
  const [notesListOpen, setNotesListOpen] = React.useState(() => {
    return readLocalStorage('web-katrain:notes_list_open:v1') === 'true';
  });
  const currentTreeListItemRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!isMobile || activeMobileTab !== 'tree' || treeView !== 'list') return;
    const frame = window.requestAnimationFrame(() => {
      currentTreeListItemRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeMobileTab, currentNode.id, isMobile, treeVersion, treeView]);

  React.useEffect(() => {
    writeLocalStorage('web-katrain:tree_view:v1', treeView);
  }, [treeView]);

  React.useEffect(() => {
    writeLocalStorage('web-katrain:notes_list_open:v1', String(notesListOpen));
  }, [notesListOpen]);

  const treeViewControls = (
    <div className="mobile-tree-view-controls flex items-center gap-2" role="group" aria-label="Game tree view">
      <button
        type="button"
        className={treeViewTabClass(treeView === 'tree')}
        onClick={() => setTreeView('tree')}
        title="Tree view"
        aria-label="Tree view"
        aria-pressed={treeView === 'tree'}
      >
        <FaSitemap size={12} />
      </button>
      <button
        type="button"
        className={treeViewTabClass(treeView === 'list')}
        onClick={() => setTreeView('list')}
        title="List view"
        aria-label="List view"
        aria-pressed={treeView === 'list'}
      >
        <FaListUl size={12} />
      </button>
    </div>
  );
  /* Two 44px buttons had a 57px band of their own under a header that runs out
     of content at phone width (the title is hidden below 381px). They ride in
     that empty header space instead, and the band only appears when branch
     controls — which have no other home — are actually there. */
  const treeNavButtons = (
    <>
      <button
        type="button"
        className="panel-icon-button"
        title={withShortcut('To start', 'nav-start')}
        aria-label={withShortcut('To start', 'nav-start')}
        onClick={() => guardInsertMode(navigateStart)}
        disabled={isInsertMode || !currentNode.parent}
      >
        <FaFastBackward size={12} />
      </button>
      <button
        type="button"
        className="panel-icon-button"
        title={withShortcut('To end', 'nav-end')}
        aria-label={withShortcut('To end', 'nav-end')}
        onClick={() => guardInsertMode(navigateEnd)}
        disabled={isInsertMode || currentNode.children.length === 0}
      >
        <FaFastForward size={12} />
      </button>
    </>
  );
  const treeToolbarSeparatorClass = [
    'h-5 w-px bg-[var(--ui-border)] mx-1',
    isMobile ? 'hidden' : '',
  ].join(' ');

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-30 desktop-shell:hidden"
          onClick={onClose}
        />
      )}
      <div
        data-layout-panel="side"
        className={[
          'ui-panel border-l flex flex-col overflow-hidden relative',
          'fixed inset-y-0 right-0 z-40 w-full max-w-none sm:max-w-md',
          open ? 'flex' : 'hidden',
          'desktop-shell:static desktop-shell:max-w-none desktop-shell:z-auto',
          showOnDesktop ? 'desktop-shell:flex' : 'desktop-shell:hidden',
          isMobile ? 'mobile-safe-bottom mobile-safe-inset' : '',
        ].join(' ')}
        style={width ? { width } : undefined}
      >
        {/* Play / Analyze tabs */}
        <div
          className="mobile-panel-header ui-bar ui-bar-height ui-bar-pad border-b border-[var(--ui-border)] flex items-center gap-2"
          data-mobile-panel-tab={isMobile ? activeMobileTab : undefined}
        >
          {isMobile && (
            <button
              type="button"
              className="mobile-panel-back desktop-shell:hidden h-11 min-h-11 px-3 flex items-center gap-2 rounded-md hover:bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors"
              onClick={onClose}
              title="Back to board"
            >
              <FaChevronLeft size={12} />
              <span className="mobile-panel-back-label text-sm font-medium">Board</span>
            </button>
          )}
          {isMobile ? (
            <div className="mobile-panel-title flex-1 text-sm font-semibold text-[var(--ui-text)]">
              {activeMobileTab === 'tree' ? 'Game Tree' : 'Review'}
            </div>
          ) : (
            <div className="panel-tab-strip flex-1">
              <button type="button"
                className={modeTabClass(mode === 'play')}
                onClick={() => setMode('play')}
              >
                Play
              </button>
              <button type="button"
                className={modeTabClass(mode === 'analyze')}
                onClick={() => setMode('analyze')}
              >
                Analysis
              </button>
            </div>
          )}
          {isMobile && activeMobileTab === 'tree' ? (
            <div className="mobile-tree-header-controls flex items-center gap-3">
              {treeListNodes.length > 1 ? (
                <div className="flex items-center gap-1">{treeNavButtons}</div>
              ) : null}
              {treeViewControls}
            </div>
          ) : null}
          {/* Undo / Resign / AI move live in the board control bar on this
              layout; the clock has no other home, so it rides in the header. */}
          {mode === 'play' && (
            <div className="mobile-panel-timer ml-auto shrink-0">
              <Timer variant="status" />
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3">
          <div className={['flex flex-col min-h-0', isMobile && activeMobileTab === 'tree' ? 'h-full' : ''].join(' ')}>
            {/* Game Info */}
            {renderSection({
              show: showGameInfo,
              title: 'Game Info',
              icon: <FaInfoCircle size={12} />,
              open: modePanels.infoOpen,
              onToggle: () => updatePanels((current) => ({ infoOpen: !current.infoOpen })),
              children: <GameInfoPanel />,
            })}

            {/* Game Tree */}
            {renderSection({
              show: showTree,
              title: 'Game Tree',
              icon: <FaSitemap size={12} />,
              open: isMobile || modePanels.treeOpen,
              onToggle: () => updatePanels((current) => ({ treeOpen: !current.treeOpen })),
              hideHeader: isMobile,
              wrapperClassName: ['flex flex-col min-h-0', isMobile ? 'flex-1' : ''].join(' '),
              actions: isMobile ? undefined : treeViewControls,
              contentClassName: ['panel-section-content flex flex-col min-h-0 p-0', isMobile ? 'flex-1' : ''].join(' '),
              children: (
                <>
                  {(isMobile ? branchInfo.hasBranches : treeListNodes.length > 1) && (
                  <div className="panel-toolbar">
                    {!isMobile && treeNavButtons}
                    <div className={branchInfo.hasBranches ? treeToolbarSeparatorClass : 'hidden'} />
                    <button
                      type="button"
                      className={branchToolbarActionClass}
                      title={withShortcut('Previous branch', 'branch-prev')}
                      onClick={() => guardInsertMode(() => switchBranch(-1))}
                      disabled={isInsertMode || !branchInfo.hasBranches}
                    >
                      <FaArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      className={branchToolbarActionClass}
                      title={withShortcut('Next branch', 'branch-next')}
                      onClick={() => guardInsertMode(() => switchBranch(1))}
                      disabled={isInsertMode || !branchInfo.hasBranches}
                    >
                      <FaArrowDown size={12} />
                    </button>
                    {branchInfo.hasBranches && (
                      isBranchIndexEditing ? (
                        <div
                          className="flex min-w-[4.75rem] items-center rounded border border-[var(--ui-accent)] bg-[var(--ui-surface)] px-2 py-1 text-[0.625rem] leading-none text-[var(--ui-text-muted)]"
                        >
                          <input
                            type="number"
                            value={branchIndexDraft}
                            onChange={(event) => setBranchIndexDraft(event.target.value)}
                            onKeyDown={handleBranchIndexKeyDown}
                            onBlur={handleBranchIndexBlur}
                            onFocus={(event) => event.currentTarget.select()}
                            aria-label="Branch number"
                            inputMode="numeric"
                            min={1}
                            max={branchInfo.totalBranches}
                            className="w-5 bg-transparent p-0 text-right font-mono text-[var(--ui-text)] outline-none"
                            autoFocus
                          />
                          <span className="font-mono">/{branchInfo.totalBranches}</span>
                          {!branchInfo.isAtFork && (
                            <>
                              {' '}
                              <span className="font-mono text-[var(--ui-accent)]">+{branchInfo.depthFromBranchRoot}</span>
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="min-w-[4.75rem] rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1 text-left text-[0.625rem] leading-none text-[var(--ui-text-muted)] hover:border-[var(--ui-border-strong)] hover:text-[var(--ui-text)] disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            branchInfo.isAtFork
                              ? 'Set branch number'
                              : `Set branch number, ${branchInfo.depthFromBranchRoot} move${branchInfo.depthFromBranchRoot === 1 ? '' : 's'} into this variation`
                          }
                          onClick={() => {
                            if (isInsertMode) {
                              toast('Finish inserting before navigating.', 'error');
                              return;
                            }
                            setBranchIndexDraft(String(branchInfo.currentIndex));
                            setIsBranchIndexEditing(true);
                          }}
                          disabled={isInsertMode}
                        >
                          <span className="uppercase tracking-wide">Branch</span>{' '}
                          <span className="font-mono text-[var(--ui-text)]">
                            {branchInfo.currentIndex}/{branchInfo.totalBranches}
                          </span>
                          {!branchInfo.isAtFork && (
                            <>
                              {' '}
                              <span className="font-mono text-[var(--ui-accent)]">+{branchInfo.depthFromBranchRoot}</span>
                            </>
                          )}
                        </button>
                      )
                    )}
                    <div className={branchInfo.hasBranches ? treeToolbarSeparatorClass : 'hidden'} />
                    <button
                      type="button"
                      className={branchToolbarActionClass}
                      title={withShortcut('Back to branch point', 'undo-branch-point')}
                      onClick={() => guardInsertMode(undoToBranchPoint)}
                      disabled={isInsertMode || !branchInfo.hasBranches}
                    >
                      <FaLevelUpAlt size={12} />
                    </button>
                    <button
                      type="button"
                      className={branchToolbarActionClass}
                      title={withShortcut('Back to main branch', 'undo-main-branch')}
                      onClick={() => guardInsertMode(undoToMainBranch)}
                      disabled={isInsertMode || !branchInfo.hasBranches}
                    >
                      <FaSitemap size={12} />
                    </button>
                    <div className={isMobile ? 'hidden' : 'flex-1'} />
                    <button
                      type="button"
                      className={promoteBranchActionClass}
                      title={withShortcut('Make main branch', 'make-main-branch')}
                      onClick={() => guardInsertMode(makeCurrentNodeMainBranch)}
                      disabled={isInsertMode || !branchInfo.hasBranches || branchInfo.currentIndex <= 1}
                    >
                      <FaStar size={12} />
                    </button>
                  </div>
                  )}
                  <div
                    className={[
                      'panel-scroll-region',
                      isMobile ? 'flex-1 max-h-[calc(100dvh-180px)]' : 'panel-compact-tree',
                    ].join(' ')}
                  >
                    {treeView === 'tree' ? (
                      <MoveTree onSelectNode={() => {
                        if (isMobile) onClose();
                      }} />
                    ) : (
                      <div
                        className={[
                          'relative min-h-full',
                          isMobile ? 'move-tree-list-split' : 'divide-y divide-[var(--ui-border)]',
                        ].join(' ')}
                      >
                        {treeListNodes.map((node) => {
                          const move = node.move;
                          const isCurrent = node.id === currentNode.id;
                          const label = move ? formatMoveLabel(move.x, move.y, node.gameState.board.length) : getNoMoveNodeLabel(node);
                          const player = move ? playerToShort(move.player) : '—';
                          const moveNumberLabel = getNodeMoveNumberLabel(node);
                          const hasNote = !!node.note?.trim();
                          const playerChipClass = !move
                            ? 'border border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)]'
                            : move.player === 'black'
                              ? 'border border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-panel)]'
                              : 'border border-[var(--ui-border-strong)] bg-[var(--ui-panel)] text-[var(--ui-text)]';
                          return (
                            <button
                              key={node.id}
                              ref={isCurrent ? currentTreeListItemRef : undefined}
                              type="button"
                              // The highlight is colour only, so without this the
                              // current move is invisible to assistive tech in a list
                              // of identical-sounding buttons. MoveTree marks its own
                              // current node the same way.
                              aria-current={isCurrent ? 'true' : undefined}
                              className={[
                                'w-full flex items-center gap-2 text-left text-xs',
                                isMobile ? 'min-h-11 px-3 py-2' : 'px-2 py-1',
                                // Nodes that carry no move (the root, setup-only nodes) break the
                                // black-left/white-right rhythm of the split list, so let them span it.
                                isMobile && !move ? 'move-tree-list-split-full' : '',
                                isCurrent ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]' : 'hover:bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
                              ].join(' ')}
                              onClick={() =>
                                guardInsertMode(() => {
                                  useGameStore.getState().jumpToNode(node);
                                  if (isMobile) onClose();
                                })
                              }
                              disabled={isInsertMode}
                              title={isInsertMode ? 'Finish inserting before navigating.' : 'Jump to move'}
                            >
                              <span className="w-10 text-[0.625rem] font-mono text-[var(--ui-text-faint)]">
                                {moveNumberLabel}
                              </span>
                              <span
                                className={[
                                  'text-[0.625rem] font-mono px-1.5 py-0.5 rounded',
                                  playerChipClass,
                                ].join(' ')}
                              >
                                {player}
                              </span>
                              <span className="text-xs font-medium">{label}</span>
                              {hasNote && (
                                <span className="ml-auto text-[0.5625rem] uppercase tracking-wide text-[var(--ui-warning)]">note</span>
                              )}
                            </button>
                          );
                        })}
                        {treeListNodes.length === 1 && (
                          <div className="move-tree-empty-state move-tree-list-split-full" data-move-tree-empty-state="true">
                            <div className="move-tree-empty-state-content">
                              <FaSitemap size={22} aria-hidden="true" />
                              <div className="move-tree-empty-state-title">No moves yet</div>
                              <p>Play on the board to start the game tree.</p>
                              {isMobile && (
                                <button
                                  type="button"
                                  className="move-tree-empty-state-action"
                                  onClick={onClose}
                                >
                                  Back to board
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
              wrapperClassName: 'flex flex-col min-h-0',
              contentClassName: 'panel-section-content p-0',
              children: (
                <AnalysisPanel
                  analysisControls={analysisControls}
                  updateControls={updateControls}
                  statusText={statusText}
                  engineDot={engineDot}
                  engineMeta={engineMeta}
                  engineMetaTitle={engineMetaTitle}
                  engineStatus={engineStatus}
                  engineError={engineError}
                  engineBackend={engineBackend}
                  engineModelLabel={engineModelLabel}
                  requestedBackend={requestedBackend}
                  modelUrl={modelUrl}
                  isGameAnalysisRunning={isGameAnalysisRunning}
                  gameAnalysisType={gameAnalysisType}
                  gameAnalysisDone={gameAnalysisDone}
                  gameAnalysisTotal={gameAnalysisTotal}
                  startQuickGameAnalysis={startQuickGameAnalysis}
                  startFastGameAnalysis={startFastGameAnalysis}
                  stopGameAnalysis={stopGameAnalysis}
                  clearAnalysisCache={clearAnalysisCache}
                  analysisCacheSize={analysisCacheSize}
                  onOpenGameAnalysis={onOpenGameAnalysis}
                  onOpenGameReport={onOpenGameReport}
                  currentMoveNumber={currentMoveNumber}
                  winRate={winRate}
                  scoreLead={scoreLead}
                  pointsLost={pointsLost}
                  compact={isMobile}
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
              wrapperClassName: 'flex flex-col min-h-0',
              contentClassName: 'panel-section-content p-0',
              children: (
                <div className="flex flex-col min-h-0">
                  <div className="panel-toolbar text-[0.6875rem] ui-text-faint">
                    <div className="truncate text-xs text-[var(--ui-text)]" title={currentPositionSummary.title}>
                      <span className="font-mono">{currentPositionSummary.playerLabel}</span> ·{' '}
                      <span className="font-mono">{currentPositionSummary.moveNumberLabel}</span> ·{' '}
                      <span className="font-mono">{currentPositionSummary.pointLabel}</span>
                    </div>
                    {shapeCoachEnabled && currentMoveInsight && (
                      <div
                        className="hidden sm:flex min-w-0 max-w-[14rem] items-center gap-1.5 rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-2 py-1 text-[0.625rem] text-[var(--ui-accent)]"
                        title={currentMoveInsight.detail}
                        data-panel-move-insight={currentMoveInsight.tone}
                      >
                        <span className="text-[var(--ui-text-faint)]">Shape</span>
                        <span className="truncate font-semibold">{currentMoveInsight.label}</span>
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {onToggleShapeCoach && (
                        <button
                          type="button"
                          className={noteToggleClass(shapeCoachEnabled)}
                          onClick={onToggleShapeCoach}
                          title={shapeCoachEnabled ? 'Hide shape coach' : 'Show shape coach'}
                          aria-pressed={shapeCoachEnabled}
                          aria-label={shapeCoachEnabled ? 'Hide shape coach' : 'Show shape coach'}
                          data-panel-shape-coach-toggle="true"
                        >
                          <FaStar size={12} />
                        </button>
                      )}
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
                    <div className="px-3 py-2 border-b border-[var(--ui-border)] text-[0.6875rem] ui-text-faint">
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
                              aria-current={isCurrent ? 'true' : undefined}
                              className={[
                                'w-full px-2 py-1 text-left text-xs',
                                isCurrent ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]' : 'hover:bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
                              ].join(' ')}
                              onClick={() =>
                                guardInsertMode(() => {
                                  useGameStore.getState().jumpToNode(node);
                                  if (isMobile) onClose();
                                })
                              }
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
                  <div className="min-h-0">
                    <NotesPanel
                      showInfo={modePanels.notes.info || modePanels.notes.infoDetails}
                      detailed={modePanels.notes.infoDetails && !lockAiDetails}
                      showNotes={modePanels.notes.notes}
                      showShapeCoach={shapeCoachEnabled}
                      focusRequest={noteFocusRequest}
                    />
                  </div>
                </div>
              ),
            })}
          </div>
        </div>
      </div>
    </>
  );
};

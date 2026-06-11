import React from 'react';
import {
  FaArrowLeft,
  FaArrowRight,
  FaCaretUp,
  FaCircle,
  FaCopy,
  FaCut,
  FaEdit,
  FaEraser,
  FaExchangeAlt,
  FaFont,
  FaHashtag,
  FaRegHandPaper,
  FaPaste,
  FaRegCircle,
  FaRegSquare,
  FaRedo,
  FaStar,
  FaTimes,
  FaTrash,
  FaUndo,
} from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { useShortcutLabels } from '../hooks/useShortcutLabels';
import { EDIT_TOOL_SHORTCUT_ID_BY_TOOL, EDIT_TOOL_SHORTCUT_IDS } from '../utils/shortcuts';
import type { EditTool } from '../types';

type EditToolItem = {
  tool: EditTool;
  label: string;
  title: string;
  icon: React.ReactNode;
};

const TOOL_GROUPS: Array<{ title: string; items: EditToolItem[] }> = [
  {
    title: 'Setup',
    items: [
      { tool: 'setup-black', label: 'Black', title: 'Setup black stone', icon: <FaCircle /> },
      {
        tool: 'setup-white',
        label: 'White',
        title: 'Setup white stone',
        icon: <FaRegCircle className="drop-shadow-sm" />,
      },
      { tool: 'setup-alternate', label: 'Alt', title: 'Alternate setup stones', icon: <FaExchangeAlt /> },
      { tool: 'setup-erase', label: 'Erase', title: 'Erase setup stone', icon: <FaEraser /> },
    ],
  },
  {
    title: 'Marks',
    items: [
      { tool: 'marker-triangle', label: 'TR', title: 'Triangle marker', icon: <FaCaretUp /> },
      { tool: 'marker-square', label: 'SQ', title: 'Square marker', icon: <FaRegSquare /> },
      { tool: 'marker-circle', label: 'CR', title: 'Circle marker', icon: <FaRegCircle /> },
      { tool: 'marker-cross', label: 'MA', title: 'Cross marker', icon: <FaTimes /> },
    ],
  },
  {
    title: 'Labels',
    items: [
      { tool: 'label-alpha', label: 'A-Z', title: 'Auto letter label', icon: <FaFont /> },
      { tool: 'label-number', label: '1-9', title: 'Auto number label', icon: <FaHashtag /> },
      { tool: 'marker-erase', label: 'Clear', title: 'Erase marker or label', icon: <FaEraser /> },
    ],
  },
];

const TOOL_LABELS: Record<EditTool, string> = Object.fromEntries(
  TOOL_GROUPS.flatMap((group) => group.items.map((item) => [item.tool, item.label]))
) as Record<EditTool, string>;

const EDIT_TOOLBAR_SHORTCUT_IDS = ['toggle-edit-mode', ...EDIT_TOOL_SHORTCUT_IDS] as const;
type EditToolbarShortcutId = (typeof EDIT_TOOLBAR_SHORTCUT_IDS)[number];

type CountableBranchNode = { children: CountableBranchNode[] };

const countBranchNodes = (node: CountableBranchNode | null): number => {
  if (!node) return 0;
  let count = 0;
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    count += 1;
    stack.push(...current.children);
  }
  return count;
};

const formatBranchNodeCount = (count: number): string => `${count} node${count === 1 ? '' : 's'}`;

const toolButtonClass = (active: boolean) =>
  [
    'min-h-11 min-w-11 px-2 rounded-md border inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors touch-manipulation',
    active
      ? 'bg-[var(--ui-accent-soft)] border-[var(--ui-accent)] text-[var(--ui-accent)] shadow-sm shadow-black/20'
      : 'bg-[var(--ui-surface)] border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
  ].join(' ');

export const EditToolbar: React.FC<{ isMobile?: boolean; analysisCommandBarVisible?: boolean; docked?: boolean }> = ({
  isMobile = false,
  analysisCommandBarVisible = false,
  docked = false,
}) => {
  const {
    isEditMode,
    editTool,
    currentNode,
    copiedBranch,
    editUndoCount,
    editRedoCount,
    treeVersion,
    toggleEditMode,
    setEditTool,
    clearCurrentNodeAnnotations,
    clearCurrentNodeSetupStones,
    passTurn,
    makeCurrentNodeMainBranch,
    shiftCurrentVariation,
    deleteCurrentNode,
    pruneCurrentBranch,
    undoEdit,
    redoEdit,
    copyCurrentBranch,
    pasteCopiedBranch,
  } = useGameStore(
    (state) => ({
      isEditMode: state.isEditMode,
      editTool: state.editTool,
      currentNode: state.currentNode,
      copiedBranch: state.copiedBranch,
      editUndoCount: state.editUndoCount,
      editRedoCount: state.editRedoCount,
      treeVersion: state.treeVersion,
      toggleEditMode: state.toggleEditMode,
      setEditTool: state.setEditTool,
      clearCurrentNodeAnnotations: state.clearCurrentNodeAnnotations,
      clearCurrentNodeSetupStones: state.clearCurrentNodeSetupStones,
      passTurn: state.passTurn,
      makeCurrentNodeMainBranch: state.makeCurrentNodeMainBranch,
      shiftCurrentVariation: state.shiftCurrentVariation,
      deleteCurrentNode: state.deleteCurrentNode,
      pruneCurrentBranch: state.pruneCurrentBranch,
      undoEdit: state.undoEdit,
      redoEdit: state.redoEdit,
      copyCurrentBranch: state.copyCurrentBranch,
      pasteCopiedBranch: state.pasteCopiedBranch,
    }),
    shallow
  );

  const nodeProps = currentNode.properties ?? {};
  const shortcutLabels = useShortcutLabels(EDIT_TOOLBAR_SHORTCUT_IDS);
  const withShortcut = (label: string, id: EditToolbarShortcutId) => `${label} (${shortcutLabels[id]})`;
  const setupCount = (nodeProps.AB?.length ?? 0) + (nodeProps.AW?.length ?? 0) + (nodeProps.AE?.length ?? 0);
  const markerCount =
    (nodeProps.TR?.length ?? 0) + (nodeProps.SQ?.length ?? 0) + (nodeProps.CR?.length ?? 0) + (nodeProps.MA?.length ?? 0);
  const labelCount = nodeProps.LB?.length ?? 0;
  const canEditBranch = Boolean(currentNode.parent);
  const siblingIndex = currentNode.parent?.children.findIndex((child) => child.id === currentNode.id) ?? -1;
  const siblingCount = currentNode.parent?.children.length ?? 0;
  const canShiftEarlier = siblingIndex > 0;
  const canShiftLater = siblingIndex >= 0 && siblingIndex < siblingCount - 1;
  const currentBranchNodeCount = React.useMemo(
    () => (canEditBranch ? countBranchNodes(currentNode) : 0),
    [canEditBranch, currentNode]
  );
  const copiedBranchNodeCount = React.useMemo(() => countBranchNodes(copiedBranch), [copiedBranch]);
  const currentBranchNodeLabel = formatBranchNodeCount(currentBranchNodeCount);
  const copiedBranchNodeLabel = formatBranchNodeCount(copiedBranchNodeCount);
  let branchSiblingCount = 0;
  let branchCursor = currentNode;
  while (branchCursor.parent) {
    branchSiblingCount += Math.max(0, branchCursor.parent.children.length - 1);
    branchCursor = branchCursor.parent;
  }
  const canPruneOtherBranches = branchSiblingCount > 0;
  const openEditToolsLabel = withShortcut('Open SGF edit tools', 'toggle-edit-mode');
  const closeEditToolsLabel = withShortcut('Close edit mode', 'toggle-edit-mode');
  const clearSetupStonesLabel = 'Clear setup stones on this node';
  const passEditModeLabel = 'Pass turn from edit mode';
  const moveVariationEarlierLabel = 'Move variation earlier';
  const moveVariationLaterLabel = 'Move variation later';
  const makeMainBranchLabel = 'Make current variation the main branch';
  const copyBranchLabel = canEditBranch
    ? `Copy current branch (${currentBranchNodeLabel})`
    : 'Select a move branch to copy';
  const pasteBranchLabel = copiedBranch
    ? `Paste copied branch (${copiedBranchNodeLabel})`
    : 'No copied branch to paste';
  const deleteCurrentNodeLabel = canEditBranch
    ? `Delete current branch (${currentBranchNodeLabel})`
    : 'Select a move branch to delete';
  const pruneOtherBranchesLabel = canPruneOtherBranches
    ? `Delete ${branchSiblingCount} other branch${branchSiblingCount === 1 ? '' : 'es'} and keep the current line`
    : 'No other branches on the current line';
  const undoEditLabel = editUndoCount > 0 ? `Undo last edit (${editUndoCount} available)` : 'No edit to undo';
  const redoEditLabel = editRedoCount > 0 ? `Redo edit (${editRedoCount} available)` : 'No edit to redo';
  const clearNodeAnnotationsLabel = 'Clear all markers and labels on this node';
  void treeVersion;

  // On mobile the panel floats over the board, so a tall stacked layout would hide
  // most of the board. Use a short horizontal-scrolling strip instead; desktop keeps
  // the wrapping multi-row layout.
  const toolAreaClass = isMobile
    ? 'flex items-stretch gap-2 p-2 overflow-x-auto'
    : 'flex flex-wrap items-stretch gap-2 p-2 max-h-[40vh] overflow-y-auto';
  const groupClass = isMobile
    ? 'flex items-center gap-1.5 pr-2 border-r border-[var(--ui-border)] shrink-0'
    : 'flex items-center gap-1.5 pr-2 border-r border-[var(--ui-border)] max-sm:w-full max-sm:border-r-0 max-sm:border-b max-sm:pb-2 max-sm:last:border-b-0 max-sm:last:pb-0';

  return (
    <div
      data-edit-toolbar
      className={
        docked
          ? 'relative z-40 max-w-full'
          : [
            'absolute z-40 pointer-events-none max-w-[calc(100%-1rem)]',
            isMobile
              ? 'left-2 right-2 bottom-3'
              : analysisCommandBarVisible
                ? 'left-3 edit-toolbar--analysis-offset'
                : 'left-1/2 top-3 -translate-x-1/2',
          ].join(' ')
      }
    >
      {!isEditMode ? (
        docked ? (
          // Match the Region/Insert board chips so the action strip reads as one
          // row of equal-weight mode toggles.
          <button
            type="button"
            onClick={toggleEditMode}
            className="board-chip"
            title={openEditToolsLabel}
            aria-label={openEditToolsLabel}
          >
            <FaEdit />
            Edit
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleEditMode}
            className="pointer-events-auto min-h-11 px-3 rounded-lg ui-panel border shadow-lg text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] flex items-center gap-2"
            title={openEditToolsLabel}
            aria-label={openEditToolsLabel}
          >
            <FaEdit className="text-[var(--ui-accent)]" />
            Edit
            {!isMobile && (
              <span className="ml-1 rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--ui-text-muted)]">
                {shortcutLabels['toggle-edit-mode']}
              </span>
            )}
          </button>
        )
      ) : (
        <div className="pointer-events-auto ui-panel border rounded-lg shadow-xl overflow-hidden backdrop-blur max-w-full">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[var(--ui-accent)] shadow-sm shadow-black/30" />
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)] whitespace-nowrap">
                Edit mode
              </div>
              <div className="hidden sm:block text-xs ui-text-faint truncate">
                Active: {TOOL_LABELS[editTool]} · {shortcutLabels['toggle-edit-mode']} closes
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
              <span className="px-1.5 py-0.5 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)]">
                Setup {setupCount}
              </span>
              <span className="px-1.5 py-0.5 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)]">
                Marks {markerCount}
              </span>
              <span className="px-1.5 py-0.5 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)]">
                Labels {labelCount}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleEditMode}
              className="h-11 w-11 rounded-md inline-flex items-center justify-center text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface)]"
              title={closeEditToolsLabel}
              aria-label={closeEditToolsLabel}
            >
              <FaTimes size={12} />
            </button>
          </div>

          <div className={toolAreaClass}>
            {TOOL_GROUPS.map((group) => (
              <div
                key={group.title}
                className={groupClass}
              >
                <div className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-text-faint)] px-1">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const shortcutId = EDIT_TOOL_SHORTCUT_ID_BY_TOOL[item.tool] as EditToolbarShortcutId;
                  const shortcutLabel = shortcutLabels[shortcutId];
                  const title = shortcutLabel === 'Disabled' ? item.title : `${item.title} (${shortcutLabel})`;
                  return (
                    <button
                      key={item.tool}
                      type="button"
                      className={toolButtonClass(editTool === item.tool)}
                      onClick={() => setEditTool(item.tool)}
                      title={title}
                      aria-label={title}
                      aria-pressed={editTool === item.tool}
                    >
                      <span className={item.tool === 'setup-black' ? 'text-black' : item.tool === 'setup-white' ? 'text-white' : ''}>
                        {item.icon}
                      </span>
                      <span className="hidden sm:inline">{item.label}</span>
                      {shortcutLabel !== 'Disabled' && (
                        <kbd className="hidden md:inline font-mono text-[10px] ui-text-faint">{shortcutLabel}</kbd>
                      )}
                    </button>
                  );
                })}
                {group.title === 'Setup' && (
                  <button
                    type="button"
                    className={[toolButtonClass(false), setupCount === 0 ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                    onClick={clearCurrentNodeSetupStones}
                    disabled={setupCount === 0}
                    title={clearSetupStonesLabel}
                    aria-label={clearSetupStonesLabel}
                  >
                    <FaTrash />
                    <span className="hidden sm:inline">All</span>
                  </button>
                )}
                {group.title === 'Setup' && (
                  <button
                    type="button"
                    className={toolButtonClass(false)}
                    onClick={passTurn}
                    title={passEditModeLabel}
                    aria-label={passEditModeLabel}
                  >
                    <FaRegHandPaper />
                    <span className="hidden sm:inline">Pass</span>
                  </button>
                )}
              </div>
            ))}
            <div className={groupClass}>
              <div className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-text-faint)] px-1">
                Branch
              </div>
              <button
                type="button"
                onClick={() => shiftCurrentVariation('left')}
                disabled={!canShiftEarlier}
                className={[toolButtonClass(false), !canShiftEarlier ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={moveVariationEarlierLabel}
                aria-label={moveVariationEarlierLabel}
              >
                <FaArrowLeft />
                <span className="hidden sm:inline">Earlier</span>
              </button>
              <button
                type="button"
                onClick={() => shiftCurrentVariation('right')}
                disabled={!canShiftLater}
                className={[toolButtonClass(false), !canShiftLater ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={moveVariationLaterLabel}
                aria-label={moveVariationLaterLabel}
              >
                <FaArrowRight />
                <span className="hidden sm:inline">Later</span>
              </button>
              <button
                type="button"
                onClick={makeCurrentNodeMainBranch}
                disabled={!canEditBranch}
                className={[toolButtonClass(false), !canEditBranch ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={makeMainBranchLabel}
                aria-label={makeMainBranchLabel}
              >
                <FaStar />
                <span className="hidden sm:inline">Main</span>
              </button>
              <button
                type="button"
                onClick={copyCurrentBranch}
                disabled={!canEditBranch}
                className={[toolButtonClass(false), !canEditBranch ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={copyBranchLabel}
                aria-label={copyBranchLabel}
              >
                <FaCopy />
                <span className="hidden sm:inline">Copy</span>
              </button>
              <button
                type="button"
                onClick={pasteCopiedBranch}
                disabled={!copiedBranch}
                className={[toolButtonClass(false), !copiedBranch ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={pasteBranchLabel}
                aria-label={pasteBranchLabel}
              >
                <FaPaste />
                <span className="hidden sm:inline">Paste</span>
              </button>
              <button
                type="button"
                onClick={deleteCurrentNode}
                disabled={!canEditBranch}
                className={[toolButtonClass(false), !canEditBranch ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={deleteCurrentNodeLabel}
                aria-label={deleteCurrentNodeLabel}
              >
                <FaTrash />
                <span className="hidden sm:inline">Delete</span>
              </button>
              <button
                type="button"
                onClick={pruneCurrentBranch}
                disabled={!canPruneOtherBranches}
                className={[toolButtonClass(false), !canPruneOtherBranches ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={pruneOtherBranchesLabel}
                aria-label={pruneOtherBranchesLabel}
              >
                <FaCut />
                <span className="hidden sm:inline">Others</span>
              </button>
            </div>
            <div className={groupClass}>
              <div className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-text-faint)] px-1">
                History
              </div>
              <button
                type="button"
                onClick={undoEdit}
                disabled={editUndoCount === 0}
                className={[toolButtonClass(false), editUndoCount === 0 ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={undoEditLabel}
                aria-label={undoEditLabel}
              >
                <FaUndo />
                <span className="hidden sm:inline">Undo</span>
              </button>
              <button
                type="button"
                onClick={redoEdit}
                disabled={editRedoCount === 0}
                className={[toolButtonClass(false), editRedoCount === 0 ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title={redoEditLabel}
                aria-label={redoEditLabel}
              >
                <FaRedo />
                <span className="hidden sm:inline">Redo</span>
              </button>
            </div>
            <button
              type="button"
              onClick={clearCurrentNodeAnnotations}
              className="shrink-0 min-h-11 px-2.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] inline-flex items-center gap-1.5 text-xs font-semibold"
              title={clearNodeAnnotationsLabel}
              aria-label={clearNodeAnnotationsLabel}
            >
              <FaEraser />
              <span>Clear node</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

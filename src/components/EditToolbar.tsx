import React from 'react';
import {
  FaCaretUp,
  FaCircle,
  FaEdit,
  FaEraser,
  FaFont,
  FaHashtag,
  FaRegCircle,
  FaRegSquare,
  FaSitemap,
  FaStar,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
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

const toolButtonClass = (active: boolean) =>
  [
    'h-9 min-w-9 px-2 rounded-md border inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors touch-manipulation',
    active
      ? 'bg-[var(--ui-accent-soft)] border-[var(--ui-accent)] text-[var(--ui-accent)] shadow-sm shadow-black/20'
      : 'bg-[var(--ui-surface)] border-[var(--ui-border)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
  ].join(' ');

export const EditToolbar: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const {
    isEditMode,
    editTool,
    currentNode,
    treeVersion,
    toggleEditMode,
    setEditTool,
    clearCurrentNodeAnnotations,
    makeCurrentNodeMainBranch,
    deleteCurrentNode,
    pruneCurrentBranch,
  } = useGameStore(
    (state) => ({
      isEditMode: state.isEditMode,
      editTool: state.editTool,
      currentNode: state.currentNode,
      treeVersion: state.treeVersion,
      toggleEditMode: state.toggleEditMode,
      setEditTool: state.setEditTool,
      clearCurrentNodeAnnotations: state.clearCurrentNodeAnnotations,
      makeCurrentNodeMainBranch: state.makeCurrentNodeMainBranch,
      deleteCurrentNode: state.deleteCurrentNode,
      pruneCurrentBranch: state.pruneCurrentBranch,
    }),
    shallow
  );

  const nodeProps = currentNode.properties ?? {};
  const setupCount = (nodeProps.AB?.length ?? 0) + (nodeProps.AW?.length ?? 0) + (nodeProps.AE?.length ?? 0);
  const markerCount =
    (nodeProps.TR?.length ?? 0) + (nodeProps.SQ?.length ?? 0) + (nodeProps.CR?.length ?? 0) + (nodeProps.MA?.length ?? 0);
  const labelCount = nodeProps.LB?.length ?? 0;
  const canEditBranch = Boolean(currentNode.parent);
  void treeVersion;

  return (
    <div
      data-edit-toolbar
      className={[
        'absolute z-40 pointer-events-none max-w-[calc(100%-1rem)]',
        isMobile ? 'left-2 right-2 bottom-3' : 'left-1/2 top-3 -translate-x-1/2',
      ].join(' ')}
    >
      {!isEditMode ? (
        <button
          type="button"
          onClick={toggleEditMode}
          className="pointer-events-auto h-10 px-3 rounded-lg ui-panel border shadow-xl text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] flex items-center gap-2"
          title="Open SGF edit tools"
        >
          <FaEdit className="text-[var(--ui-accent)]" />
          Edit
        </button>
      ) : (
        <div className="pointer-events-auto ui-panel border rounded-lg shadow-xl overflow-hidden backdrop-blur max-w-full">
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[var(--ui-accent)] shadow-sm shadow-black/30" />
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ui-text-muted)] whitespace-nowrap">
                Edit mode
              </div>
              <div className="hidden sm:block text-xs ui-text-faint truncate">Active: {TOOL_LABELS[editTool]}</div>
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
              className="h-7 w-7 rounded-md inline-flex items-center justify-center text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] hover:bg-[var(--ui-surface)]"
              title="Close edit mode"
              aria-label="Close edit mode"
            >
              <FaTimes size={12} />
            </button>
          </div>

          <div className="flex flex-wrap items-stretch gap-2 p-2 max-h-[40vh] overflow-y-auto">
            {TOOL_GROUPS.map((group) => (
              <div
                key={group.title}
                className="flex items-center gap-1.5 pr-2 border-r border-[var(--ui-border)] max-sm:w-full max-sm:border-r-0 max-sm:border-b max-sm:pb-2 max-sm:last:border-b-0 max-sm:last:pb-0"
              >
                <div className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-text-faint)] px-1">
                  {group.title}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.tool}
                    type="button"
                    className={toolButtonClass(editTool === item.tool)}
                    onClick={() => setEditTool(item.tool)}
                    title={item.title}
                    aria-pressed={editTool === item.tool}
                  >
                    <span className={item.tool === 'setup-black' ? 'text-black' : item.tool === 'setup-white' ? 'text-white' : ''}>
                      {item.icon}
                    </span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
            <div className="flex items-center gap-1.5 pr-2 border-r border-[var(--ui-border)] max-sm:w-full max-sm:border-r-0 max-sm:border-b max-sm:pb-2">
              <div className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[var(--ui-text-faint)] px-1">
                Branch
              </div>
              <button
                type="button"
                onClick={makeCurrentNodeMainBranch}
                disabled={!canEditBranch}
                className={[toolButtonClass(false), !canEditBranch ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title="Make current variation the main branch"
              >
                <FaStar />
                <span className="hidden sm:inline">Main</span>
              </button>
              <button
                type="button"
                onClick={deleteCurrentNode}
                disabled={!canEditBranch}
                className={[toolButtonClass(false), !canEditBranch ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title="Delete current node"
              >
                <FaTrash />
                <span className="hidden sm:inline">Delete</span>
              </button>
              <button
                type="button"
                onClick={pruneCurrentBranch}
                disabled={!canEditBranch}
                className={[toolButtonClass(false), !canEditBranch ? 'opacity-40 cursor-not-allowed' : ''].join(' ')}
                title="Prune sibling branches"
              >
                <FaSitemap />
                <span className="hidden sm:inline">Prune</span>
              </button>
            </div>
            <button
              type="button"
              onClick={clearCurrentNodeAnnotations}
              className="h-9 px-2.5 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] inline-flex items-center gap-1.5 text-xs font-semibold"
              title="Clear all markers and labels on this node"
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

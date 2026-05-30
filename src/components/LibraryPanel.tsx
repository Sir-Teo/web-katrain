import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaTimes,
  FaFolderOpen,
  FaSave,
  FaTrash,
  FaPen,
  FaSearch,
  FaChevronRight,
  FaDownload,
  FaUpload,
  FaCheckSquare,
  FaSquare,
  FaPlus,
  FaArrowUp,
  FaStop,
  FaFileAlt,
  FaFileArchive,
  FaCopy,
} from 'react-icons/fa';
import {
  createLibraryBackup,
  createLibraryFolder,
  createLibraryItem,
  deleteLibraryItem,
  duplicateLibraryItem,
  duplicateLibraryItems,
  loadLibrary,
  restoreLibrary,
  saveLibrary,
  updateLibraryItem,
  type LibraryItem,
  type LibraryFile,
  type LibraryFolder,
} from '../utils/library';
import { createLibraryZipBlob, importLibraryItemsFromZip } from '../utils/libraryZip';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import { SectionHeader } from './layout/ui';
import { panelCardBase, panelCardClosed, panelCardOpen } from './layout/ui-utils';

const isFolder = (item: LibraryItem): item is LibraryFolder => item.type === 'folder';
const isFile = (item: LibraryItem): item is LibraryFile => item.type === 'file';

type LibraryTextDialogState = {
  title: string;
  label: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
};

type LibraryConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

const LibraryTextDialog: React.FC<{
  dialog: LibraryTextDialogState;
  onClose: () => void;
}> = ({ dialog, onClose }) => {
  const [value, setValue] = useState(dialog.initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    if (!trimmed) return;
    dialog.onSubmit(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-text-dialog-title"
        className="ui-panel border rounded-lg shadow-xl w-full max-w-sm overflow-hidden"
      >
        <div className="ui-bar border-b border-[var(--ui-border)] px-4 py-3 flex items-center justify-between">
          <h2 id="library-text-dialog-title" className="text-base font-semibold text-[var(--ui-text)]">
            {dialog.title}
          </h2>
          <button type="button" onClick={onClose} className="ui-text-faint hover:text-white" aria-label="Close">
            <FaTimes />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--ui-text-muted)]">{dialog.label}</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder={dialog.placeholder}
              className="w-full ui-input border rounded px-3 py-2 text-sm text-[var(--ui-text)] focus:border-[var(--ui-accent)] outline-none"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="panel-action-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="panel-action-button active"
              onClick={submit}
              disabled={!trimmed}
            >
              {dialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const LibraryConfirmDialog: React.FC<{
  dialog: LibraryConfirmDialogState;
  onClose: () => void;
}> = ({ dialog, onClose }) => {
  const confirm = () => {
    dialog.onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-confirm-dialog-title"
        className="ui-panel border rounded-lg shadow-xl w-full max-w-sm overflow-hidden"
      >
        <div className="ui-bar border-b border-[var(--ui-border)] px-4 py-3 flex items-center justify-between">
          <h2 id="library-confirm-dialog-title" className="text-base font-semibold text-[var(--ui-text)]">
            {dialog.title}
          </h2>
          <button type="button" onClick={onClose} className="ui-text-faint hover:text-white" aria-label="Close">
            <FaTimes />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-[var(--ui-text-muted)]">{dialog.message}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="panel-action-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={['panel-action-button', dialog.danger ? 'danger' : 'active'].join(' ')}
              onClick={confirm}
            >
              {dialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface LibraryPanelProps {
  open: boolean;
  docked?: boolean;
  width?: number;
  onClose: () => void;
  isMobile?: boolean;
  analysisContent?: React.ReactNode;
  isAnalysisRunning?: boolean;
  onStopAnalysis?: () => void;
  getCurrentSgf: () => string;
  onLoadSgf: (sgf: string) => boolean | Promise<boolean>;
  onToast: (msg: string, type: 'info' | 'error' | 'success') => void;
  onOpenRecent?: (sgf: string) => void;
  onLibraryUpdated?: () => void;
  onCurrentSaved?: () => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  open,
  docked = false,
  width,
  onClose,
  isMobile = false,
  analysisContent,
  isAnalysisRunning = false,
  onStopAnalysis,
  getCurrentSgf,
  onLoadSgf,
  onToast,
  onLibraryUpdated,
  onCurrentSaved,
}) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('web-katrain:library_current_folder:v1');
    return raw || null;
  });
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem('web-katrain:library_folders_expanded:v1');
    if (!raw) return new Set();
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((id) => typeof id === 'string'));
    } catch {
      return new Set();
    }
  });
  const [bulkMoveTarget, setBulkMoveTarget] = useState<string>('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [textDialog, setTextDialog] = useState<LibraryTextDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<LibraryConfirmDialogState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const didLoadLibraryRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerActionClass = 'panel-icon-button';
  const headerDangerActionClass = 'panel-icon-button ui-danger-soft';
  const bulkActionClass = 'panel-icon-button';
  const bulkDangerActionClass = 'panel-icon-button ui-danger-soft';
  const analysisActionClass =
    'panel-icon-button disabled:opacity-50 disabled:cursor-not-allowed';
  const [sortKey, setSortKey] = useState(() => {
    if (typeof localStorage === 'undefined') return 'recent';
    return localStorage.getItem('web-katrain:library_sort:v1') ?? 'recent';
  });
  const [graphOptions] = useState(() => {
    if (typeof localStorage === 'undefined') return { score: true, winrate: true };
    try {
      const raw = localStorage.getItem('web-katrain:library_graph_opts:v1');
      if (!raw) return { score: true, winrate: true };
      const parsed = JSON.parse(raw) as { score?: boolean; winrate?: boolean };
      return { score: parsed.score !== false, winrate: parsed.winrate !== false };
    } catch {
      return { score: true, winrate: true };
    }
  });
  const [listOpen, setListOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_list_open:v1') !== 'false';
  });
  const [analysisOpen, setAnalysisOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_analysis_open:v1') !== 'false';
  });

  useEffect(() => {
    let cancelled = false;
    setLibraryStatus('loading');
    setLibraryError(null);
    void loadLibrary()
      .then((loaded) => {
        if (cancelled) return;
        didLoadLibraryRef.current = true;
        setItems(loaded);
        setLibraryStatus('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setLibraryStatus('error');
        setLibraryError(error instanceof Error ? error.message : 'Failed to load library.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!didLoadLibraryRef.current) return;
    let cancelled = false;
    setLibraryStatus('saving');
    setLibraryError(null);
    void saveLibrary(items)
      .then(() => {
        if (cancelled) return;
        setLibraryStatus('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setLibraryStatus('error');
        setLibraryError(error instanceof Error ? error.message : 'Failed to save library.');
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const activeFolderId = useMemo(() => {
    if (!currentFolderId) return null;
    const exists = items.some((item) => isFolder(item) && item.id === currentFolderId);
    return exists ? currentFolderId : null;
  }, [currentFolderId, items]);

  const visibleSelectedIds = useMemo(() => {
    if (selectedIds.size === 0) return selectedIds;
    const next = new Set<string>();
    for (const item of items) {
      if (selectedIds.has(item.id)) next.add(item.id);
    }
    return next;
  }, [items, selectedIds]);

  const visibleExpandedFolderIds = useMemo(() => {
    if (expandedFolderIds.size === 0) return expandedFolderIds;
    const next = new Set<string>();
    for (const item of items) {
      if (isFolder(item) && expandedFolderIds.has(item.id)) next.add(item.id);
    }
    return next;
  }, [expandedFolderIds, items]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_current_folder:v1', activeFolderId ?? '');
  }, [activeFolderId]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const arr = Array.from(visibleExpandedFolderIds.values());
    localStorage.setItem('web-katrain:library_folders_expanded:v1', JSON.stringify(arr));
  }, [visibleExpandedFolderIds]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_sort:v1', String(sortKey));
  }, [sortKey]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_graph_opts:v1', JSON.stringify(graphOptions));
  }, [graphOptions]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_list_open:v1', String(listOpen));
  }, [listOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_analysis_open:v1', String(analysisOpen));
  }, [analysisOpen]);

  useEffect(() => {
    onLibraryUpdated?.();
  }, [items, onLibraryUpdated]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  const isSearching = query.trim().length > 0;

  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    switch (sortKey) {
      case 'name':
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'moves':
        arr.sort((a, b) => (isFile(b) ? b.moveCount : 0) - (isFile(a) ? a.moveCount : 0));
        break;
      case 'size':
        arr.sort((a, b) => (isFile(b) ? b.size : 0) - (isFile(a) ? a.size : 0));
        break;
      case 'recent':
      default:
        arr.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
    }
    return arr;
  }, [filteredItems, sortKey]);

  const folderItems = useMemo(() => items.filter(isFolder), [items]);
  const currentFolder = folderItems.find((folder) => folder.id === activeFolderId) ?? null;
  const currentFolderName = currentFolder?.name ?? 'Root';
  const parentById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of items) map.set(item.id, item.parentId ?? null);
    return map;
  }, [items]);

  const breadcrumbs = useMemo(() => {
    if (!activeFolderId) return [];
    const trail: LibraryFolder[] = [];
    let current: LibraryItem | undefined = items.find((item) => item.id === activeFolderId);
    while (current && isFolder(current)) {
      trail.push(current);
      const parentId = current.parentId ?? null;
      current = parentId ? items.find((item) => item.id === parentId) : undefined;
    }
    return trail.reverse();
  }, [activeFolderId, items]);

  const activeAncestorIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const ancestors = new Set<string>();
    let current = items.find((item) => item.id === activeId);
    while (current?.parentId) {
      ancestors.add(current.parentId);
      current = items.find((item) => item.id === current?.parentId);
    }
    return ancestors;
  }, [activeId, items]);

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, LibraryItem[]>();
    for (const item of items) {
      const parent = item.parentId ?? null;
      const list = map.get(parent);
      if (list) list.push(item);
      else map.set(parent, [item]);
    }
    for (const [parent, list] of map.entries()) {
      list.sort((a, b) => {
        const aFolder = isFolder(a);
        const bFolder = isFolder(b);
        if (aFolder && !bFolder) return -1;
        if (!aFolder && bFolder) return 1;
        if (aFolder && bFolder) return a.name.localeCompare(b.name);
        switch (sortKey) {
          case 'name':
            return a.name.localeCompare(b.name);
          case 'moves':
            return (isFile(b) ? b.moveCount : 0) - (isFile(a) ? a.moveCount : 0);
          case 'size':
            return (isFile(b) ? b.size : 0) - (isFile(a) ? a.size : 0);
          case 'recent':
          default:
            return b.updatedAt - a.updatedAt;
        }
      });
      map.set(parent, list);
    }
    return map;
  }, [items, sortKey]);

  const isDescendantOf = (candidateId: string | null, ancestorId: string): boolean => {
    if (!candidateId) return false;
    let current = parentById.get(candidateId) ?? null;
    while (current) {
      if (current === ancestorId) return true;
      current = parentById.get(current) ?? null;
    }
    return false;
  };

  const handleSaveCurrent = () => {
    const sgf = getCurrentSgf();
    if (!sgf.trim()) {
      onToast('Nothing to save yet.', 'info');
      return;
    }
    setTextDialog({
      title: 'Save to Library',
      label: 'Name',
      initialValue: `Game ${items.length + 1}`,
      placeholder: 'Game name',
      confirmLabel: 'Save',
      onSubmit: (name) => {
        const newItem = createLibraryItem(name, sgf, activeFolderId);
        setItems((prev) => [newItem, ...prev]);
        setActiveId(newItem.id);
        onCurrentSaved?.();
        onToast(`Saved "${newItem.name}" to Library.`, 'success');
      },
    });
  };

  const handleRename = (item: LibraryItem) => {
    setTextDialog({
      title: `Rename ${isFolder(item) ? 'Folder' : 'File'}`,
      label: 'Name',
      initialValue: item.name,
      placeholder: isFolder(item) ? 'Folder name' : 'Game name',
      confirmLabel: 'Rename',
      onSubmit: (next) => {
        setItems((prev) => updateLibraryItem(prev, item.id, { name: next }));
      },
    });
  };

  const handleCreateFolder = () => {
    setTextDialog({
      title: 'New Folder',
      label: 'Name',
      initialValue: 'New Folder',
      placeholder: 'Folder name',
      confirmLabel: 'Create',
      onSubmit: (name) => {
        const folder = createLibraryFolder(name, activeFolderId);
        setItems((prev) => [folder, ...prev]);
        setExpandedFolderIds((prev) => new Set(prev).add(folder.id));
        setCurrentFolderId(folder.id);
        onToast(`Created folder "${folder.name}".`, 'success');
      },
    });
  };

  const handleClearLibrary = () => {
    setConfirmDialog({
      title: 'Clear Library',
      message: 'Clear the entire library?',
      confirmLabel: 'Clear',
      danger: true,
      onConfirm: () => {
        setItems([]);
        setSelectedIds(new Set());
        setActiveId(null);
        setCurrentFolderId(null);
        onToast('Library cleared.', 'info');
      },
    });
  };

  const handleGoUp = () => {
    if (!activeFolderId) return;
    const parentId = parentById.get(activeFolderId) ?? null;
    setCurrentFolderId(parentId);
  };

  const handleDelete = (item: LibraryItem) => {
    const isFolderItem = isFolder(item);
    const message = isFolderItem
      ? `Delete folder "${item.name}" and its contents?`
      : `Delete "${item.name}" from Library?`;
    setConfirmDialog({
      title: isFolderItem ? 'Delete Folder' : 'Delete Game',
      message,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        setItems((prev) => deleteLibraryItem(prev, item.id));
        if (activeId === item.id || (isFolderItem && activeId && isDescendantOf(activeId, item.id))) {
          setActiveId(null);
        }
      },
    });
  };

  const handleDuplicate = (item: LibraryItem) => {
    const result = duplicateLibraryItem(items, item.id);
    if (!result.duplicated) {
      onToast('Failed to duplicate library item.', 'error');
      return;
    }
    const duplicated = result.duplicated;
    setItems(result.items);
    setSelectedIds(new Set([duplicated.id]));
    if (isFolder(duplicated)) {
      setExpandedFolderIds((prev) => new Set(prev).add(duplicated.id));
    }
    onToast(`Duplicated "${item.name}".`, 'success');
  };

  const handleDownload = (item: LibraryFile) => {
    const blob = new Blob([item.sgf], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.name || 'game'}.sgf`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`Exported "${item.name}".`, 'success');
  };

  const handleBackupLibrary = () => {
    try {
      const blob = new Blob([createLibraryBackup(items)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `webkatrain-library-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      onToast('Library backup downloaded.', 'success');
    } catch {
      onToast('Failed to create library backup.', 'error');
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportLibraryZip = async () => {
    try {
      const { blob, fileCount } = await createLibraryZipBlob(items);
      if (fileCount === 0) {
        onToast('No SGF files to export.', 'info');
        return;
      }
      downloadBlob(blob, `webkatrain-library-${new Date().toISOString().slice(0, 10)}.zip`);
      onToast(`Exported ${fileCount} SGF file${fileCount === 1 ? '' : 's'} as ZIP.`, 'success');
    } catch {
      onToast('Failed to create library ZIP.', 'error');
    }
  };

  const handleRestoreBackup = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const restored = await restoreLibrary(text);
      didLoadLibraryRef.current = true;
      setItems(restored);
      setSelectedIds(new Set());
      setActiveId(null);
      setCurrentFolderId(null);
      onToast(`Restored ${restored.length} library item${restored.length === 1 ? '' : 's'}.`, 'success');
    } catch {
      onToast('Failed to restore library backup.', 'error');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(sortedItems.map((item) => item.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setBulkMoveTarget('');
  };

  const handleBulkDelete = () => {
    if (visibleSelectedIds.size === 0) return;
    setConfirmDialog({
      title: 'Delete Selected',
      message: `Delete ${visibleSelectedIds.size} item(s) from Library?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        setItems((prev) => {
          let next = prev;
          for (const id of visibleSelectedIds) {
            next = deleteLibraryItem(next, id);
          }
          return next;
        });
        if (
          activeId &&
          Array.from(visibleSelectedIds).some((id) => activeId === id || isDescendantOf(activeId, id))
        ) {
          setActiveId(null);
        }
        setSelectedIds(new Set());
      },
    });
  };

  const handleBulkDuplicate = () => {
    if (visibleSelectedIds.size === 0) return;
    const selected = Array.from(visibleSelectedIds);
    const result = duplicateLibraryItems(items, selected);
    if (result.duplicatedIds.length === 0) {
      onToast('No selected items were duplicated.', 'info');
      return;
    }
    setItems(result.items);
    setSelectedIds(result.duplicated ? new Set([result.duplicated.id]) : new Set());
    onToast(`Duplicated ${selected.length} selected item${selected.length === 1 ? '' : 's'}.`, 'success');
  };

  const handleBulkExport = async () => {
    if (visibleSelectedIds.size === 0) return;
    try {
      const { blob, fileCount } = await createLibraryZipBlob(items, visibleSelectedIds);
      if (fileCount === 0) {
        onToast('No files selected to export.', 'info');
        return;
      }
      downloadBlob(blob, `webkatrain-selection-${new Date().toISOString().slice(0, 10)}.zip`);
      onToast(`Exported ${fileCount} selected SGF file${fileCount === 1 ? '' : 's'} as ZIP.`, 'success');
    } catch {
      onToast('Failed to export selected items.', 'error');
      return;
    }
  };

  const handleBulkMove = () => {
    if (visibleSelectedIds.size === 0) return;
    if (!bulkMoveTarget) return;
    const targetId = bulkMoveTarget === 'root' ? null : bulkMoveTarget;
    setItems((prev) =>
      prev.map((item) => {
        if (!visibleSelectedIds.has(item.id)) return item;
        if (targetId && (item.id === targetId || isDescendantOf(targetId, item.id))) return item;
        return { ...item, parentId: targetId, updatedAt: Date.now() };
      })
    );
    setBulkMoveTarget('');
    onToast('Moved selected items.', 'success');
  };

  const handleLoad = async (item: LibraryItem) => {
    if (!isFile(item)) return;
    try {
      const loaded = await onLoadSgf(item.sgf);
      if (!loaded) return;
      setActiveId(item.id);
      setCurrentFolderId(item.parentId ?? null);
      onToast(`Loaded "${item.name}".`, 'success');
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
        onClose();
      }
    } catch {
      onToast('Failed to load SGF from Library.', 'error');
    }
  };

  const handleImportFilesToFolder = async (files: FileList | null, folderId: string | null) => {
    if (!files || files.length === 0) return;
    const imported: LibraryItem[] = [];
    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      try {
        if (name.endsWith('.zip')) {
          imported.push(...(await importLibraryItemsFromZip(file, folderId)));
          continue;
        }
        if (!name.endsWith('.sgf')) continue;
        const text = await file.text();
        imported.push(createLibraryItem(file.name.replace(/\.sgf$/i, ''), text, folderId));
      } catch {
        // ignore per-file failures
      }
    }
    if (imported.length === 0) {
      onToast('No SGF files were imported.', 'info');
      return;
    }
    setItems((prev) => [...imported, ...prev]);
    const importedFiles = imported.filter(isFile).length;
    onToast(`Imported ${importedFiles} file${importedFiles === 1 ? '' : 's'}.`, 'success');
  };

  const handleImportFiles = async (files: FileList | null) =>
    handleImportFilesToFolder(files, activeFolderId);

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      await handleImportFiles(event.dataTransfer.files);
      return;
    }
    if (draggingId) {
      setItems((prev) =>
        prev.map((item) => (item.id === draggingId ? { ...item, parentId: null, updatedAt: Date.now() } : item))
      );
      setDraggingId(null);
      setDragOverRoot(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    } else {
      setIsDragging(false);
    }
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleItemDragStart = (id: string) => (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };

  const handleItemDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
    setDragOverRoot(false);
  };

  const handleDropOnFolder = (folderId: string) => async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      await handleImportFilesToFolder(event.dataTransfer.files, folderId);
      setDragOverId(null);
      return;
    }
    const id = draggingId || event.dataTransfer.getData('text/plain');
    if (!id || id === folderId) return;
    if (isDescendantOf(folderId, id)) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, parentId: folderId, updatedAt: Date.now() } : item))
    );
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleRootDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    setDragOverRoot(true);
  };

  const handleRootDragLeave = () => setDragOverRoot(false);

  const handleRootDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (!draggingId) return;
    setItems((prev) =>
      prev.map((item) => (item.id === draggingId ? { ...item, parentId: null, updatedAt: Date.now() } : item))
    );
    setDraggingId(null);
    setDragOverRoot(false);
  };

  const renderFileRow = (item: LibraryFile, depth: number) => {
    const isSelected = visibleSelectedIds.has(item.id);
    const isLoaded = activeId === item.id;
    return (
      <div
        key={item.id}
        className={[
          'library-tree-node',
          isSelected ? 'selected' : '',
          isLoaded ? 'loaded' : '',
        ].join(' ')}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => void handleLoad(item)}
        draggable
        onDragStart={handleItemDragStart(item.id)}
        onDragEnd={handleItemDragEnd}
      >
        <button
          type="button"
          className={[
            'library-tree-node-select',
            isSelected ? 'is-visible' : '',
          ].join(' ')}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleSelect(item.id);
          }}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? <FaCheckSquare size={12} /> : <FaSquare size={12} />}
        </button>
        <span className="library-tree-node-icon">
          <FaFileAlt size={12} />
        </span>
        <div className="library-tree-node-name">{item.name}</div>
        <div className="library-tree-node-meta">
          {item.metadata.black || item.metadata.white
            ? `${item.metadata.black ?? 'Black'} vs ${item.metadata.white ?? 'White'} · `
            : ''}
          {item.metadata.date ? `${item.metadata.date} · ` : ''}
          {item.moveCount} · {(item.size / 1024).toFixed(1)} KB
        </div>
        <div className="library-tree-node-actions">
          <button
            type="button"
            className="library-tree-node-action"
            onClick={(e) => {
              e.stopPropagation();
              handleDuplicate(item);
            }}
            title="Duplicate"
            aria-label="Duplicate"
          >
            <FaCopy size={12} />
          </button>
          <button
            type="button"
            className="library-tree-node-action"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(item);
            }}
            title="Download SGF"
          >
            <FaDownload size={12} />
          </button>
          <button
            type="button"
            className="library-tree-node-action"
            onClick={(e) => {
              e.stopPropagation();
              handleRename(item);
            }}
            title="Rename"
          >
            <FaPen size={12} />
          </button>
          <button
            type="button"
            className="library-tree-node-action danger"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item);
            }}
            title="Delete"
          >
            <FaTrash size={12} />
          </button>
        </div>
      </div>
    );
  };

  const renderFolderRow = (item: LibraryFolder, depth: number, allowChildren = true) => {
    const isExpanded = visibleExpandedFolderIds.has(item.id);
    const children = childrenMap.get(item.id) ?? [];
    const isSelected = visibleSelectedIds.has(item.id);
    const hasLoaded = activeAncestorIds.has(item.id);
    return (
      <div key={item.id}>
        <div
          className={[
            'library-tree-node',
            isSelected ? 'selected' : '',
            activeFolderId === item.id ? 'selected' : '',
            hasLoaded ? 'has-loaded' : '',
            dragOverId === item.id ? 'drop-target' : '',
          ].join(' ')}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => {
            setCurrentFolderId(item.id);
            setExpandedFolderIds((prev) => new Set(prev).add(item.id));
          }}
          draggable
          onDragStart={handleItemDragStart(item.id)}
          onDragEnd={handleItemDragEnd}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setDragOverId(item.id);
          }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={handleDropOnFolder(item.id)}
        >
          <button
            type="button"
            className={['library-tree-node-arrow', isExpanded ? 'expanded' : ''].join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              setExpandedFolderIds((prev) => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                return next;
              });
            }}
            title={isExpanded ? 'Collapse folder' : 'Expand folder'}
          >
            <FaChevronRight size={12} />
          </button>
          <button
            type="button"
            className={[
              'library-tree-node-select',
              isSelected ? 'is-visible' : '',
            ].join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSelect(item.id);
            }}
            title={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected ? <FaCheckSquare size={12} /> : <FaSquare size={12} />}
          </button>
          <span className="library-tree-node-icon">
            <FaFolderOpen size={12} />
          </span>
          <div className="library-tree-node-name">{item.name}</div>
          <div className="library-tree-node-meta">{children.length}</div>
          <div className="library-tree-node-actions">
            <button
              type="button"
              className="library-tree-node-action"
              onClick={(e) => {
                e.stopPropagation();
                handleDuplicate(item);
              }}
              title="Duplicate"
              aria-label="Duplicate"
            >
              <FaCopy size={12} />
            </button>
            <button
              type="button"
              className="library-tree-node-action"
              onClick={(e) => {
                e.stopPropagation();
                handleRename(item);
              }}
              title="Rename"
            >
              <FaPen size={12} />
            </button>
            <button
              type="button"
              className="library-tree-node-action danger"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(item);
              }}
              title="Delete"
            >
              <FaTrash size={12} />
            </button>
          </div>
        </div>
        {allowChildren && isExpanded && children.length > 0 && (
          <div>
            {children.map((child) =>
              isFolder(child) ? renderFolderRow(child, depth + 1, allowChildren) : renderFileRow(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (!open) return null;

  const renderSection = (args: {
    title: string;
    open: boolean;
    onToggle: () => void;
    actions?: React.ReactNode;
    wrapperClassName?: string;
    contentClassName?: string;
    children: React.ReactNode;
  }) => {
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
          open={args.open}
          onToggle={args.onToggle}
          actions={args.actions}
        />
        {args.open ? (
          <div className={args.contentClassName ?? 'panel-section-content'}>
            {args.children}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      {textDialog && <LibraryTextDialog dialog={textDialog} onClose={() => setTextDialog(null)} />}
      {confirmDialog && <LibraryConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />}
      <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />
      <div
        ref={panelRef}
        data-dropzone="library"
        className={[
          'ui-panel border-r flex flex-col overflow-x-hidden relative',
          'fixed inset-y-0 left-0 z-40 w-full max-w-none sm:max-w-sm',
          'lg:static lg:z-auto',
          docked ? 'lg:max-w-none' : 'lg:w-80',
          isMobile ? 'mobile-safe-bottom mobile-safe-inset' : '',
        ].join(' ')}
        style={docked && width ? { width } : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="ui-bar ui-bar-height ui-bar-pad border-b border-[var(--ui-border)] flex items-center gap-2">
          <button
            type="button"
            className="lg:hidden h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:text-white transition-colors"
            onClick={onClose}
            title="Close library"
          >
            <FaTimes />
          </button>
          <div className="text-sm font-semibold text-[var(--ui-text)]">Library</div>
          <div
            className={[
              'hidden sm:inline-flex px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wider',
              libraryStatus === 'error'
                ? 'ui-danger-soft text-[var(--ui-danger)] border-[var(--ui-danger)]'
                : libraryStatus === 'saving'
                  ? 'bg-[var(--ui-warning-soft)] text-[var(--ui-warning)] border-[var(--ui-warning)]'
                  : 'ui-success-soft text-[var(--ui-success)] border-[var(--ui-success)]',
            ].join(' ')}
            title={libraryError ?? 'IndexedDB library storage'}
          >
            {libraryStatus === 'loading' ? 'Loading' : libraryStatus === 'saving' ? 'Saving' : libraryStatus === 'error' ? 'Error' : 'IndexedDB'}
          </div>
          <div className="flex flex-wrap items-center gap-1 ml-auto">
            <button
              type="button"
              className={headerActionClass}
              onClick={handleCreateFolder}
              title="Create new folder"
              aria-label="Create new folder"
            >
              <FaPlus />
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={handleSaveCurrent}
              title="Save current game to Library"
              aria-label="Save current game to Library"
            >
              <FaSave />
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={() => fileInputRef.current?.click()}
              title="Import SGF or ZIP files"
              aria-label="Import SGF or ZIP files"
            >
              <FaFolderOpen />
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={() => void handleExportLibraryZip()}
              title="Export library as ZIP"
              aria-label="Export library as ZIP"
            >
              <FaFileArchive />
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={handleBackupLibrary}
              title="Download full library backup"
              aria-label="Download full library backup"
            >
              <FaDownload />
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={() => backupInputRef.current?.click()}
              title="Restore library backup"
              aria-label="Restore library backup"
            >
              <FaUpload />
            </button>
            <button
              type="button"
              className={headerDangerActionClass}
              onClick={handleClearLibrary}
              title="Clear library"
              aria-label="Clear library"
            >
              <FaTrash />
            </button>
            <div className="h-5 w-px bg-[var(--ui-border)] mx-1" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".sgf,.zip,application/zip,application/x-zip-compressed"
              multiple
              onChange={(e) => void handleImportFiles(e.target.files)}
              className="hidden"
            />
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleRestoreBackup(e.target.files)}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="flex flex-col min-h-0">
            {renderSection({
              title: 'Library',
              open: listOpen,
              onToggle: () => setListOpen((prev) => !prev),
              contentClassName: 'panel-section-content flex flex-col min-h-0 p-0',
              children: (
                <>
              <div className="panel-toolbar">
                <div className="relative flex-1 min-w-[160px]">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 ui-text-faint text-xs" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search library…"
                    className="w-full ui-input border rounded pl-8 pr-3 py-1 text-sm text-[var(--ui-text)] focus:border-[var(--ui-accent)]"
                  />
                </div>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  className="ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
                  title="Sort"
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="moves">Moves</option>
                  <option value="size">Size</option>
                </select>
                <button
                  type="button"
                  className="panel-icon-button"
                  onClick={handleGoUp}
                  disabled={!activeFolderId}
                  title="Up"
                >
                  <FaArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="panel-icon-button"
                  onClick={() => setCurrentFolderId(null)}
                  title="Root"
                >
                  <FaFolderOpen size={12} />
                </button>
                <div className="ml-auto flex items-center gap-2 text-[11px] ui-text-faint">
                  <div>
                    {sortedItems.length} items{visibleSelectedIds.size > 0 ? ` · ${visibleSelectedIds.size} selected` : ''}
                  </div>
                  {sortedItems.length > 0 && (
                    <button
                      type="button"
                      className="h-6 w-6 rounded hover:bg-[var(--ui-surface-2)] flex items-center justify-center"
                      onClick={handleSelectAll}
                      title="Select all"
                      aria-label="Select all"
                    >
                      <FaCheckSquare size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div className="px-3 py-1 text-[11px] ui-text-faint flex flex-wrap items-center gap-1 border-b border-[var(--ui-border)]">
                <span>Folder: {currentFolderName}</span>
                {!isSearching &&
                  breadcrumbs.map((crumb, index) => (
                    <button
                      key={crumb.id}
                      type="button"
                      className="px-1.5 py-0.5 rounded hover:bg-[var(--ui-surface-2)] ui-text-faint"
                      onClick={() => setCurrentFolderId(crumb.id)}
                    >
                      {index === 0 ? crumb.name : `/${crumb.name}`}
                    </button>
                  ))}
                {isDragging && (
                  <span className="ml-auto ui-accent-soft border rounded px-2 py-0.5">
                    Drop SGF files to import
                  </span>
                )}
              </div>
              {visibleSelectedIds.size > 0 && (
                <div className="panel-toolbar border-b border-[var(--ui-border)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]">
                  <button
                    type="button"
                    className={bulkActionClass}
                    onClick={handleBulkDuplicate}
                    title="Duplicate selected"
                    aria-label="Duplicate selected"
                  >
                    <FaCopy size={12} />
                  </button>
                  <button
                    type="button"
                    className={bulkActionClass}
                    onClick={() => void handleBulkExport()}
                    title="Export selected as ZIP"
                    aria-label="Export selected as ZIP"
                  >
                    <FaDownload size={12} />
                  </button>
                  <button
                    type="button"
                    className={bulkDangerActionClass}
                    onClick={handleBulkDelete}
                    title="Delete selected"
                    aria-label="Delete selected"
                  >
                    <FaTrash size={12} />
                  </button>
                  <select
                    value={bulkMoveTarget}
                    onChange={(e) => setBulkMoveTarget(e.target.value)}
                    className="ml-1 ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
                  >
                    <option value="">Move to...</option>
                    <option value="root">Root</option>
                    {folderItems.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="panel-action-button"
                    onClick={handleBulkMove}
                    disabled={!bulkMoveTarget}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    className={`ml-auto ${bulkActionClass}`}
                    onClick={handleClearSelection}
                    title="Clear selection"
                    aria-label="Clear selection"
                  >
                    <FaTimes size={12} />
                  </button>
                </div>
              )}
              <div
                className={[
                  'library-tree panel-scroll-region',
                  isMobile ? 'max-h-[calc(100dvh-220px)]' : 'panel-compact-list',
                  dragOverRoot ? 'bg-[var(--ui-accent-soft)]' : '',
                ].join(' ')}
                onDragOver={handleRootDragOver}
                onDragLeave={handleRootDragLeave}
                onDrop={handleRootDrop}
              >
                {isSearching ? (
                  sortedItems.length === 0 ? (
                    <div className="p-6 text-sm ui-text-faint">
                      <div className="font-semibold text-[var(--ui-text-muted)] mb-2">No matches</div>
                      <div>Try a different search term.</div>
                    </div>
                  ) : (
                    <div>
                      {sortedItems.map((item) =>
                        isFolder(item) ? renderFolderRow(item, 0, false) : renderFileRow(item, 0)
                      )}
                    </div>
                  )
                ) : libraryStatus === 'loading' ? (
                  <div className="p-6 text-sm ui-text-faint">
                    <div className="font-semibold text-[var(--ui-text-muted)] mb-2">Loading library</div>
                    <div>Opening IndexedDB storage and migrating saved SGFs if needed.</div>
                  </div>
                ) : libraryStatus === 'error' ? (
                  <div className="p-6 text-sm ui-text-faint">
                    <div className="font-semibold text-[var(--ui-danger)] mb-2">Library storage error</div>
                    <div>{libraryError ?? 'The library could not be read or saved.'}</div>
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-6 text-sm ui-text-faint">
                    <div className="font-semibold text-[var(--ui-text-muted)] mb-2">Library is empty</div>
                    <div>Save the current game or drag SGF files here to build your library.</div>
                  </div>
                ) : (
                  <div>
                    {(childrenMap.get(null) ?? []).map((item) =>
                      isFolder(item) ? renderFolderRow(item, 0) : renderFileRow(item, 0)
                    )}
                  </div>
                )}
              </div>
                </>
              ),
            })}

            {docked &&
              renderSection({
                title: 'Analysis',
                open: analysisOpen,
                onToggle: () => setAnalysisOpen((prev) => !prev),
                wrapperClassName: 'mx-0',
                contentClassName: 'panel-section-content p-0',
                actions: onStopAnalysis ? (
                  <button
                    type="button"
                    className={[
                      analysisActionClass,
                      isAnalysisRunning ? 'ui-danger-soft' : 'text-[var(--ui-text-muted)]',
                    ].join(' ')}
                    onClick={onStopAnalysis}
                    disabled={!isAnalysisRunning}
                    title="Stop analysis"
                    aria-label="Stop analysis"
                  >
                    <FaStop size={12} />
                  </button>
                ) : null,
                children: (
                  <div className="panel-scroll-region">
                    {analysisContent ? (
                      analysisContent
                    ) : graphOptions.score || graphOptions.winrate ? (
                      <div className="panel-compact-graph">
                        <ScoreWinrateGraph showScore={graphOptions.score} showWinrate={graphOptions.winrate} />
                      </div>
                    ) : (
                      <div className="panel-compact-graph flex items-center justify-center text-xs ui-text-faint border border-[var(--ui-border)] rounded">
                        Graph hidden
                      </div>
                    )}
                  </div>
                ),
              })}
          </div>
        </div>
      </div>
    </>
  );
};

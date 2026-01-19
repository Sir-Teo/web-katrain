import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaTimes, FaFolderOpen, FaSave, FaTrash, FaPen, FaSearch, FaChevronDown, FaChevronRight, FaDownload, FaCheckSquare, FaSquare, FaPlus, FaArrowUp } from 'react-icons/fa';
import {
  createLibraryFolder,
  createLibraryItem,
  deleteLibraryItem,
  loadLibrary,
  saveLibrary,
  updateLibraryItem,
  type LibraryItem,
  type LibraryFile,
  type LibraryFolder,
} from '../utils/library';
import { ScoreWinrateGraph } from './ScoreWinrateGraph';
import { SectionHeader, panelCardBase, panelCardClosed, panelCardOpen } from './layout/ui';

const GRAPH_HEIGHT = 200;

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
  onLoadSgf: (sgf: string) => void;
  onToast: (msg: string, type: 'info' | 'error' | 'success') => void;
  onOpenRecent?: (sgf: string) => void;
  onLibraryUpdated?: () => void;
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
  onOpenRecent,
  onLibraryUpdated,
}) => {
  const isFolder = (item: LibraryItem): item is LibraryFolder => item.type === 'folder';
  const isFile = (item: LibraryItem): item is LibraryFile => item.type === 'file';
  const ToggleLabel: React.FC<{ open: boolean; children: React.ReactNode }> = ({ open, children }) => (
    <span className="flex items-center gap-2">
      {open ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
      {children}
    </span>
  );
  const [items, setItems] = useState<LibraryItem[]>(() => loadLibrary());
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerActionClass = 'px-2 py-1 rounded bg-[var(--ui-surface-2)] text-xs text-[var(--ui-text)] hover:brightness-110';
  const headerDangerActionClass = 'px-2 py-1 rounded ui-danger-soft text-xs hover:brightness-110';
  const bulkActionClass = 'px-2 py-1 rounded bg-[var(--ui-surface-2)] border border-[var(--ui-border)] hover:brightness-110';
  const bulkDangerActionClass = 'px-2 py-1 rounded ui-danger-soft border hover:brightness-110';
  const analysisActionClass =
    'px-2 py-1 rounded text-[11px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const [sortKey, setSortKey] = useState(() => {
    if (typeof localStorage === 'undefined') return 'recent';
    return localStorage.getItem('web-katrain:library_sort:v1') ?? 'recent';
  });
  const [graphOpen, setGraphOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_graph_open:v1') !== 'false';
  });
  const [searchOpen, setSearchOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_search_open:v1') !== 'false';
  });
  const [listOpen, setListOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_list_open:v1') !== 'false';
  });
  const [recentOpen, setRecentOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_recent_open:v1') !== 'false';
  });
  const [listHeight, setListHeight] = useState(() => {
    if (typeof localStorage === 'undefined') {
      return typeof window === 'undefined' ? 360 : Math.min(420, Math.round(window.innerHeight * 0.45));
    }
    const raw = localStorage.getItem('web-katrain:library_list_height:v2');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(parsed)) return parsed;
    return typeof window === 'undefined' ? 360 : Math.min(420, Math.round(window.innerHeight * 0.45));
  });
  const listSectionRef = useRef<HTMLDivElement>(null);
  const graphSectionRef = useRef<HTMLDivElement>(null);
  const listResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [isResizingList, setIsResizingList] = useState(false);
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

  useEffect(() => saveLibrary(items), [items]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const item of items) {
        if (prev.has(item.id)) next.add(item.id);
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!currentFolderId) return;
    const exists = items.some((item) => isFolder(item) && item.id === currentFolderId);
    if (!exists) setCurrentFolderId(null);
  }, [currentFolderId, items]);

  useEffect(() => {
    setExpandedFolderIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const item of items) {
        if (isFolder(item) && prev.has(item.id)) next.add(item.id);
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_current_folder:v1', currentFolderId ?? '');
  }, [currentFolderId]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const arr = Array.from(expandedFolderIds.values());
    localStorage.setItem('web-katrain:library_folders_expanded:v1', JSON.stringify(arr));
  }, [expandedFolderIds]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_graph_open:v1', String(graphOpen));
  }, [graphOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_search_open:v1', String(searchOpen));
  }, [searchOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_sort:v1', String(sortKey));
  }, [sortKey]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_list_open:v1', String(listOpen));
  }, [listOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_list_height:v2', String(listHeight));
  }, [listHeight]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_recent_open:v1', String(recentOpen));
  }, [recentOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_graph_opts:v1', JSON.stringify(graphOptions));
  }, [graphOptions]);

  useEffect(() => {
    onLibraryUpdated?.();
  }, [items, onLibraryUpdated]);

  const getListBounds = () => {
    const panel = panelRef.current;
    const listEl = listSectionRef.current;
    if (!panel || !listEl) return null;
    const panelRect = panel.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();
    const minHeight = 220;
    const graphOffset = graphOpen && graphSectionRef.current
      ? graphSectionRef.current.getBoundingClientRect().height + 16
      : 16;
    const available = panelRect.bottom - listRect.top - graphOffset;
    const softMax = Math.round(panelRect.height * 0.65);
    const maxHeight = Math.max(minHeight, Math.min(available, softMax));
    return { minHeight, maxHeight };
  };

  const clampListHeight = () => {
    const bounds = getListBounds();
    if (!bounds) return;
    setListHeight((current) => Math.min(bounds.maxHeight, Math.max(bounds.minHeight, current)));
  };

  useEffect(() => {
    if (!open || !listOpen) return;
    const frame = window.requestAnimationFrame(() => clampListHeight());
    return () => window.cancelAnimationFrame(frame);
  }, [graphOpen, listOpen, open, searchOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => clampListHeight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [graphOpen, listOpen, open, searchOpen]);

  useEffect(() => {
    if (!isResizingList) return;
    const onMove = (e: MouseEvent) => {
      if (!listResizeRef.current) return;
      const bounds = getListBounds();
      if (!bounds) return;
      const delta = e.clientY - listResizeRef.current.startY;
      const next = Math.min(bounds.maxHeight, Math.max(bounds.minHeight, listResizeRef.current.startHeight + delta));
      setListHeight(next);
    };
    const onUp = () => {
      setIsResizingList(false);
      listResizeRef.current = null;
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [graphOpen, isResizingList]);


  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  const isSearching = query.trim().length > 0;

  const getMoveCount = (item: LibraryItem) => (isFile(item) ? item.moveCount : 0);
  const getSize = (item: LibraryItem) => (isFile(item) ? item.size : 0);

  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    switch (sortKey) {
      case 'name':
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'moves':
        arr.sort((a, b) => getMoveCount(b) - getMoveCount(a));
        break;
      case 'size':
        arr.sort((a, b) => getSize(b) - getSize(a));
        break;
      case 'recent':
      default:
        arr.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
    }
    return arr;
  }, [filteredItems, sortKey]);

  const folderItems = useMemo(() => items.filter(isFolder), [items]);
  const currentFolder = folderItems.find((folder) => folder.id === currentFolderId) ?? null;
  const currentFolderName = currentFolder?.name ?? 'Root';
  const parentById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of items) map.set(item.id, item.parentId ?? null);
    return map;
  }, [items]);

  const breadcrumbs = useMemo(() => {
    if (!currentFolderId) return [];
    const trail: LibraryFolder[] = [];
    let current: LibraryItem | undefined = items.find((item) => item.id === currentFolderId);
    while (current && isFolder(current)) {
      trail.push(current);
      const parentId = current.parentId ?? null;
      current = parentId ? items.find((item) => item.id === parentId) : undefined;
    }
    return trail.reverse();
  }, [currentFolderId, items]);

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

  const recentFiles = useMemo(() => {
    return items
      .filter(isFile)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [items]);

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
    const name = window.prompt('Save to Library as:', `Game ${items.length + 1}`) ?? '';
    if (!name.trim()) return;
    const sgf = getCurrentSgf();
    if (!sgf.trim()) {
      onToast('Nothing to save yet.', 'info');
      return;
    }
    const newItem = createLibraryItem(name, sgf, currentFolderId);
    setItems((prev) => [newItem, ...prev]);
    setActiveId(newItem.id);
    onToast(`Saved "${newItem.name}" to Library.`, 'success');
  };

  const handleRename = (item: LibraryItem) => {
    const next = window.prompt(`Rename ${isFolder(item) ? 'folder' : 'file'}:`, item.name) ?? '';
    if (!next.trim()) return;
    setItems((prev) => updateLibraryItem(prev, item.id, { name: next.trim() }));
  };

  const handleCreateFolder = () => {
    const name = window.prompt('New folder name:', 'New Folder') ?? '';
    if (!name.trim()) return;
    const folder = createLibraryFolder(name.trim(), currentFolderId);
    setItems((prev) => [folder, ...prev]);
    setExpandedFolderIds((prev) => new Set(prev).add(folder.id));
    setCurrentFolderId(folder.id);
    onToast(`Created folder "${folder.name}".`, 'success');
  };

  const handleClearLibrary = () => {
    if (!window.confirm('Clear the entire library?')) return;
    setItems([]);
    setSelectedIds(new Set());
    setCurrentFolderId(null);
    onToast('Library cleared.', 'info');
  };

  const handleGoUp = () => {
    if (!currentFolderId) return;
    const parentId = parentById.get(currentFolderId) ?? null;
    setCurrentFolderId(parentId);
  };

  const handleDelete = (item: LibraryItem) => {
    const isFolderItem = isFolder(item);
    const message = isFolderItem
      ? `Delete folder "${item.name}" and its contents?`
      : `Delete "${item.name}" from Library?`;
    if (!window.confirm(message)) return;
    setItems((prev) => deleteLibraryItem(prev, item.id));
    if (activeId === item.id) setActiveId(null);
  };

  const handleDownload = (item: LibraryFile) => {
    const blob = new Blob([item.sgf], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.name || 'game'}.sgf`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`Exported \"${item.name}\".`, 'success');
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
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} item(s) from Library?`)) return;
    setItems((prev) => {
      let next = prev;
      for (const id of selectedIds) {
        next = deleteLibraryItem(next, id);
      }
      return next;
    });
    if (activeId && selectedIds.has(activeId)) setActiveId(null);
    setSelectedIds(new Set());
  };

  const handleBulkExport = () => {
    if (selectedIds.size === 0) return;
    const selected = items.filter((item) => selectedIds.has(item.id)).filter(isFile);
    if (selected.length === 0) {
      onToast('No files selected to export.', 'info');
      return;
    }
    selected.forEach((item, idx) => {
      window.setTimeout(() => handleDownload(item), idx * 120);
    });
    onToast(`Exported ${selected.length} item${selected.length > 1 ? 's' : ''}.`, 'success');
  };

  const handleBulkMove = () => {
    if (selectedIds.size === 0) return;
    if (!bulkMoveTarget) return;
    const targetId = bulkMoveTarget === 'root' ? null : bulkMoveTarget;
    setItems((prev) =>
      prev.map((item) => {
        if (!selectedIds.has(item.id)) return item;
        if (targetId && (item.id === targetId || isDescendantOf(targetId, item.id))) return item;
        return { ...item, parentId: targetId, updatedAt: Date.now() };
      })
    );
    setBulkMoveTarget('');
    onToast('Moved selected items.', 'success');
  };

  const handleLoad = (item: LibraryItem) => {
    if (!isFile(item)) return;
    try {
      onLoadSgf(item.sgf);
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
      if (!file.name.toLowerCase().endsWith('.sgf')) continue;
      try {
        const text = await file.text();
        const name = file.name.replace(/\.sgf$/i, '');
        imported.push(createLibraryItem(name, text, folderId));
      } catch {
        // ignore per-file failures
      }
    }
    if (imported.length === 0) {
      onToast('No SGF files were imported.', 'info');
      return;
    }
    setItems((prev) => [...imported, ...prev]);
    onToast(`Imported ${imported.length} file${imported.length > 1 ? 's' : ''}.`, 'success');
  };

  const handleImportFiles = async (files: FileList | null) =>
    handleImportFilesToFolder(files, currentFolderId);

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

  const renderFileRow = (item: LibraryFile, depth: number) => (
    <div
      key={item.id}
      className={[
        'px-3 py-2 flex items-center gap-2 hover:bg-[var(--ui-surface-2)] cursor-pointer',
        activeId === item.id ? 'bg-[var(--ui-surface-2)]' : '',
      ].join(' ')}
      style={{ paddingLeft: 12 + depth * 16 }}
      onClick={() => handleLoad(item)}
      draggable
      onDragStart={handleItemDragStart(item.id)}
      onDragEnd={handleItemDragEnd}
    >
      <button
        type="button"
        className="ui-text-faint hover:text-white p-1"
        onClick={(e) => {
          e.stopPropagation();
          handleToggleSelect(item.id);
        }}
        title={selectedIds.has(item.id) ? 'Deselect' : 'Select'}
      >
        {selectedIds.has(item.id) ? <FaCheckSquare /> : <FaSquare />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[var(--ui-text)] truncate">{item.name}</div>
        <div className="text-xs ui-text-faint">
          {item.moveCount} moves · {(item.size / 1024).toFixed(1)} KB
        </div>
      </div>
      <button
        type="button"
        className="ui-text-faint hover:text-white p-1"
        onClick={(e) => {
          e.stopPropagation();
          handleDownload(item);
        }}
        title="Download SGF"
      >
        <FaDownload />
      </button>
      <button
        type="button"
        className="ui-text-faint hover:text-white p-1"
        onClick={(e) => {
          e.stopPropagation();
          handleRename(item);
        }}
        title="Rename"
      >
        <FaPen />
      </button>
      <button
        type="button"
        className="ui-text-faint hover:text-[var(--ui-danger)] p-1"
        onClick={(e) => {
          e.stopPropagation();
          handleDelete(item);
        }}
        title="Delete"
      >
        <FaTrash />
      </button>
    </div>
  );

  const renderFolderRow = (item: LibraryFolder, depth: number, allowChildren = true) => {
    const isExpanded = expandedFolderIds.has(item.id);
    const children = childrenMap.get(item.id) ?? [];
    return (
      <div key={item.id}>
      <div
        className={[
          'px-3 py-2 flex items-center gap-2 hover:bg-[var(--ui-surface-2)] cursor-pointer',
          currentFolderId === item.id ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]' : '',
          dragOverId === item.id ? 'bg-[var(--ui-accent-soft)]' : '',
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
            className="ui-text-faint hover:text-white p-1"
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
            {isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
          </button>
          <button
            type="button"
            className="ui-text-faint hover:text-white p-1"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSelect(item.id);
            }}
            title={selectedIds.has(item.id) ? 'Deselect' : 'Select'}
          >
            {selectedIds.has(item.id) ? <FaCheckSquare /> : <FaSquare />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--ui-text)] truncate">{item.name}</div>
            <div className="text-xs ui-text-faint">{children.length} items</div>
          </div>
          <button
            type="button"
            className="ui-text-faint hover:text-white p-1"
            onClick={(e) => {
              e.stopPropagation();
              handleRename(item);
            }}
            title="Rename"
          >
            <FaPen />
          </button>
          <button
            type="button"
            className="ui-text-faint hover:text-[var(--ui-danger)] p-1"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(item);
            }}
            title="Delete"
          >
            <FaTrash />
          </button>
        </div>
        {allowChildren && isExpanded && children.length > 0 && (
          <div className="divide-y divide-[var(--ui-border)]">
            {children.map((child) =>
              isFolder(child) ? renderFolderRow(child, depth + 1, allowChildren) : renderFileRow(child, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />
      <div
        ref={panelRef}
        data-dropzone="library"
        className={[
          'ui-panel border-r flex flex-col overflow-x-hidden relative',
          'fixed inset-y-0 left-0 z-40 w-full max-w-sm',
          'lg:static lg:z-auto',
          docked ? 'lg:max-w-none' : 'lg:w-80',
          isMobile ? 'pb-16' : '',
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
          <div className="font-semibold text-[var(--ui-text)]">Library</div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className={headerActionClass}
              onClick={handleCreateFolder}
              title="Create new folder"
            >
              <FaPlus className="inline-block mr-1" /> Folder
            </button>
            <button
              type="button"
              className={headerDangerActionClass}
              onClick={handleClearLibrary}
              title="Clear library"
            >
              <FaTrash className="inline-block mr-1" /> Clear
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={handleSaveCurrent}
              title="Save current game to Library"
            >
              <FaSave className="inline-block mr-1" /> Save
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={() => fileInputRef.current?.click()}
              title="Import SGF files"
            >
              <FaFolderOpen className="inline-block mr-1" /> Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sgf"
              multiple
              onChange={(e) => void handleImportFiles(e.target.files)}
              className="hidden"
            />
          </div>
        </div>

        <div
          className={[
            'mx-3 mt-3',
            panelCardBase,
            searchOpen ? panelCardOpen : panelCardClosed,
            searchOpen ? 'flex flex-col' : '',
          ].join(' ')}
        >
          <SectionHeader title="Search & Filters" open={searchOpen} onToggle={() => setSearchOpen((prev) => !prev)} />
          {searchOpen ? (
            <>
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="relative">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 ui-text-faint text-xs" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search library…"
                    className="w-full ui-input border rounded pl-8 pr-3 py-2 text-sm text-[var(--ui-text)] focus:border-[var(--ui-accent)]"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs ui-text-faint">
                  <span>Sort</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
                  >
                    <option value="recent">Recent</option>
                    <option value="name">Name</option>
                    <option value="moves">Moves</option>
                    <option value="size">Size</option>
                  </select>
                </div>
                <div className="mt-2 text-xs ui-text-faint flex items-center justify-between">
                  <span>Save to: {currentFolderName}</span>
                  {currentFolderId && (
                    <button
                      type="button"
                      className="text-xs ui-text-faint hover:text-white"
                      onClick={() => setCurrentFolderId(null)}
                    >
                      Root
                    </button>
                  )}
                </div>
                {!isSearching && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs ui-text-faint">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-[var(--ui-surface-2)] border border-[var(--ui-border)] hover:brightness-110 disabled:opacity-40"
                      onClick={handleGoUp}
                      disabled={!currentFolderId}
                    >
                      <FaArrowUp className="inline-block mr-1" /> Up
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-[var(--ui-surface-2)] border border-[var(--ui-border)] hover:brightness-110"
                      onClick={() => setCurrentFolderId(null)}
                    >
                      Root
                    </button>
                    {breadcrumbs.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 ui-text-faint">
                        {breadcrumbs.map((crumb, index) => (
                          <button
                            key={crumb.id}
                            type="button"
                            className="px-1.5 py-0.5 rounded hover:bg-[var(--ui-surface-2)] ui-text-faint"
                            onClick={() => setCurrentFolderId(crumb.id)}
                          >
                            {index === 0 ? crumb.name : `/${crumb.name}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {isDragging && (
                  <div className="mt-3 text-xs ui-accent-soft border rounded px-2 py-1">
                    Drop SGF files to import
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div
          ref={listSectionRef}
          className={[
            'flex flex-col mx-3 mb-3 mt-3 overflow-hidden',
            panelCardBase,
            listOpen ? `${panelCardOpen} min-h-0` : `flex-none ${panelCardClosed}`,
          ].join(' ')}
          style={listOpen ? { height: listHeight } : undefined}
        >
          <SectionHeader
            title="Library"
            open={listOpen}
            onToggle={() => setListOpen((prev) => !prev)}
            actions={
              <div className="flex items-center gap-2 text-xs ui-text-faint">
                {sortedItems.length > 0 && (
                  <button
                    type="button"
                    className="text-xs ui-text-faint hover:text-white"
                    onClick={handleSelectAll}
                  >
                    Select all
                  </button>
                )}
                <div className="text-xs ui-text-faint">
                  {sortedItems.length} items{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
                </div>
              </div>
            }
          />
          {listOpen && selectedIds.size > 0 && (
            <div className="px-3 py-2 border-b border-[var(--ui-border)] flex items-center gap-2 text-xs text-[var(--ui-text-muted)]">
              <button
                type="button"
                className={bulkActionClass}
                onClick={handleBulkExport}
              >
                Export
              </button>
              <button
                type="button"
                className={bulkDangerActionClass}
                onClick={handleBulkDelete}
              >
                Delete
              </button>
              <select
                value={bulkMoveTarget}
                onChange={(e) => setBulkMoveTarget(e.target.value)}
                className="ml-2 ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
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
                className={`${bulkActionClass} disabled:opacity-40`}
                onClick={handleBulkMove}
                disabled={!bulkMoveTarget}
              >
                Move
              </button>
              <button
                type="button"
                className={`ml-auto ${bulkActionClass}`}
                onClick={handleClearSelection}
              >
                Clear
              </button>
            </div>
          )}
          <div
            className={[
              'flex-1 min-h-0 overflow-y-auto',
              dragOverRoot ? 'bg-[var(--ui-accent-soft)]' : '',
            ].join(' ')}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
          >
            {!listOpen ? (
              <div className="p-4 text-xs ui-text-faint">Library list hidden</div>
            ) : isSearching ? (
              sortedItems.length === 0 ? (
                <div className="p-6 text-sm ui-text-faint">
                  <div className="font-semibold text-[var(--ui-text-muted)] mb-2">No matches</div>
                  <div>Try a different search term.</div>
                </div>
              ) : (
                <div className="divide-y divide-[var(--ui-border)]">
                  {sortedItems.map((item) =>
                    isFolder(item) ? renderFolderRow(item, 0, false) : renderFileRow(item, 0)
                  )}
                </div>
              )
            ) : items.length === 0 ? (
              <div className="p-6 text-sm ui-text-faint">
                <div className="font-semibold text-[var(--ui-text-muted)] mb-2">Library is empty</div>
                <div>Save the current game or drag SGF files here to build your library.</div>
              </div>
            ) : (
              <>
                <div className="border-b border-[var(--ui-border)]">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-[var(--ui-text)] font-semibold"
                    onClick={() => setRecentOpen((prev) => !prev)}
                  >
                    <ToggleLabel open={recentOpen}>Recent</ToggleLabel>
                    <span className="text-xs ui-text-faint">{recentFiles.length}</span>
                  </button>
                  {recentOpen && (
                    <div className="divide-y divide-[var(--ui-border)]">
                      {recentFiles.length === 0 ? (
                        <div className="px-3 py-2 text-xs ui-text-faint">No recent files.</div>
                      ) : (
                        recentFiles.map((item) =>
                          onOpenRecent ? (
                            <div key={item.id} onClick={() => onOpenRecent(item.sgf)}>
                              {renderFileRow(item, 0)}
                            </div>
                          ) : (
                            renderFileRow(item, 0)
                          )
                        )
                      )}
                    </div>
                  )}
                </div>
                <div className="divide-y divide-[var(--ui-border)]">
                  {(childrenMap.get(null) ?? []).map((item) =>
                    isFolder(item) ? renderFolderRow(item, 0) : renderFileRow(item, 0)
                  )}
                </div>
              </>
            )}
          </div>
          {listOpen && !isMobile && (
            <div
              className="h-3 cursor-row-resize bg-[var(--ui-surface-2)] hover:bg-[var(--ui-border-strong)] transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                listResizeRef.current = { startY: e.clientY, startHeight: listHeight };
                setIsResizingList(true);
              }}
              title="Drag to resize list"
            />
          )}
        </div>

        {docked && (
          <div
            ref={graphSectionRef}
            className={[
              'mx-3 mb-3',
              panelCardBase,
              graphOpen ? panelCardOpen : panelCardClosed,
            ].join(' ')}
          >
            <SectionHeader
              title="Analysis"
              open={graphOpen}
              onToggle={() => setGraphOpen((prev) => !prev)}
              actions={
                onStopAnalysis ? (
                  <button
                    type="button"
                    className={[
                      analysisActionClass,
                      isAnalysisRunning
                        ? 'ui-danger-soft border hover:brightness-110'
                        : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] border-[var(--ui-border)]',
                    ].join(' ')}
                    onClick={onStopAnalysis}
                    disabled={!isAnalysisRunning}
                  >
                    Stop analysis
                  </button>
                ) : null
              }
            />
            {graphOpen ? (
              <>
                <div className="mt-2" style={{ height: GRAPH_HEIGHT }}>
                  <div className="h-full overflow-y-auto">
                    {analysisContent ? (
                      analysisContent
                    ) : graphOptions.score || graphOptions.winrate ? (
                      <ScoreWinrateGraph showScore={graphOptions.score} showWinrate={graphOptions.winrate} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs ui-text-faint border border-[var(--ui-border)] rounded">
                        Graph hidden
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
};

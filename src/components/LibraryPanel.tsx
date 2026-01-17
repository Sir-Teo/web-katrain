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

interface LibraryPanelProps {
  open: boolean;
  docked?: boolean;
  width?: number;
  onClose: () => void;
  isMobile?: boolean;
  getCurrentSgf: () => string;
  onLoadSgf: (sgf: string) => void;
  onToast: (msg: string, type: 'info' | 'error' | 'success') => void;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  open,
  docked = false,
  width,
  onClose,
  isMobile = false,
  getCurrentSgf,
  onLoadSgf,
  onToast,
}) => {
  const isFolder = (item: LibraryItem): item is LibraryFolder => item.type === 'folder';
  const isFile = (item: LibraryItem): item is LibraryFile => item.type === 'file';
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
  const [sortKey, setSortKey] = useState(() => {
    if (typeof localStorage === 'undefined') return 'recent';
    return localStorage.getItem('web-katrain:library_sort:v1') ?? 'recent';
  });
  const [graphOpen, setGraphOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_graph_open:v1') !== 'false';
  });
  const [listOpen, setListOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_list_open:v1') !== 'false';
  });
  const [recentOpen, setRecentOpen] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    return localStorage.getItem('web-katrain:library_recent_open:v1') !== 'false';
  });
  const [graphHeight, setGraphHeight] = useState(() => {
    if (typeof localStorage === 'undefined') return 180;
    const raw = localStorage.getItem('web-katrain:library_graph_height:v1');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : 180;
  });
  const [graphOptions, setGraphOptions] = useState(() => {
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
  const [isResizingGraph, setIsResizingGraph] = useState(false);

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
    localStorage.setItem('web-katrain:library_sort:v1', String(sortKey));
  }, [sortKey]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_list_open:v1', String(listOpen));
  }, [listOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_recent_open:v1', String(recentOpen));
  }, [recentOpen]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_graph_height:v1', String(graphHeight));
  }, [graphHeight]);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('web-katrain:library_graph_opts:v1', JSON.stringify(graphOptions));
  }, [graphOptions]);

  useEffect(() => {
    if (!isResizingGraph) return;
    const minGraph = 120;
    const minList = 180;
    const onMove = (e: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      const available = rect.height - 140;
      const maxGraph = Math.max(minGraph, available - minList);
      const next = Math.min(maxGraph, Math.max(minGraph, rect.bottom - e.clientY));
      setGraphHeight(next);
    };
    const onUp = () => setIsResizingGraph(false);
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingGraph]);

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
        arr.sort((a, b) => b.moveCount - a.moveCount);
        break;
      case 'size':
        arr.sort((a, b) => b.size - a.size);
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
        'px-3 py-2 flex items-center gap-2 hover:bg-slate-800/60 cursor-pointer',
        activeId === item.id ? 'bg-slate-800/80' : '',
      ].join(' ')}
      style={{ paddingLeft: 12 + depth * 16 }}
      onClick={() => handleLoad(item)}
      draggable
      onDragStart={handleItemDragStart(item.id)}
      onDragEnd={handleItemDragEnd}
    >
      <button
        type="button"
        className="text-slate-500 hover:text-slate-200 p-1"
        onClick={(e) => {
          e.stopPropagation();
          handleToggleSelect(item.id);
        }}
        title={selectedIds.has(item.id) ? 'Deselect' : 'Select'}
      >
        {selectedIds.has(item.id) ? <FaCheckSquare /> : <FaSquare />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-100 truncate">{item.name}</div>
        <div className="text-xs text-slate-500">
          {item.moveCount} moves · {(item.size / 1024).toFixed(1)} KB
        </div>
      </div>
      <button
        type="button"
        className="text-slate-400 hover:text-slate-200 p-1"
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
        className="text-slate-400 hover:text-slate-200 p-1"
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
        className="text-slate-400 hover:text-rose-300 p-1"
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
            'px-3 py-2 flex items-center gap-2 hover:bg-slate-800/60 cursor-pointer',
            currentFolderId === item.id ? 'bg-emerald-500/10 text-emerald-100' : '',
            dragOverId === item.id ? 'bg-emerald-500/20' : '',
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
            className="text-slate-500 hover:text-slate-200 p-1"
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
            className="text-slate-500 hover:text-slate-200 p-1"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSelect(item.id);
            }}
            title={selectedIds.has(item.id) ? 'Deselect' : 'Select'}
          >
            {selectedIds.has(item.id) ? <FaCheckSquare /> : <FaSquare />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-100 truncate">{item.name}</div>
            <div className="text-xs text-slate-500">{children.length} items</div>
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-200 p-1"
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
            className="text-slate-400 hover:text-rose-300 p-1"
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
          <div className="divide-y divide-slate-800">
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
        className={[
          'bg-slate-900 border-r border-slate-700/50 flex flex-col',
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
        <div className="h-14 border-b border-slate-700/50 flex items-center gap-2 px-3">
          <button
            type="button"
            className="lg:hidden h-9 w-9 flex items-center justify-center rounded hover:bg-slate-700 text-slate-300 hover:text-white"
            onClick={onClose}
            title="Close library"
          >
            <FaTimes />
          </button>
          <div className="font-semibold text-slate-100">Library</div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 rounded bg-slate-800/70 text-xs text-slate-200 hover:bg-slate-700"
              onClick={handleCreateFolder}
              title="Create new folder"
            >
              <FaPlus className="inline-block mr-1" /> Folder
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded bg-rose-900/40 text-xs text-rose-200 hover:bg-rose-800/50"
              onClick={handleClearLibrary}
              title="Clear library"
            >
              <FaTrash className="inline-block mr-1" /> Clear
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded bg-slate-800/70 text-xs text-slate-200 hover:bg-slate-700"
              onClick={handleSaveCurrent}
              title="Save current game to Library"
            >
              <FaSave className="inline-block mr-1" /> Save
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded bg-slate-800/70 text-xs text-slate-200 hover:bg-slate-700"
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

        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search library…"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded pl-8 pr-3 py-2 text-sm text-slate-200 focus:border-emerald-500"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Sort</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="bg-slate-800/80 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-200"
            >
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="moves">Moves</option>
              <option value="size">Size</option>
            </select>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Save to: {currentFolderName}</span>
            {currentFolderId && (
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={() => setCurrentFolderId(null)}
              >
                Root
              </button>
            )}
          </div>
          {!isSearching && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <button
                type="button"
                className="px-2 py-1 rounded bg-slate-800/70 border border-slate-700/50 hover:bg-slate-700/60 disabled:opacity-40"
                onClick={handleGoUp}
                disabled={!currentFolderId}
              >
                <FaArrowUp className="inline-block mr-1" /> Up
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded bg-slate-800/70 border border-slate-700/50 hover:bg-slate-700/60"
                onClick={() => setCurrentFolderId(null)}
              >
                Root
              </button>
              {breadcrumbs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-slate-500">
                  {breadcrumbs.map((crumb, index) => (
                    <button
                      key={crumb.id}
                      type="button"
                      className="px-1.5 py-0.5 rounded hover:bg-slate-800/60 text-slate-400"
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
            <div className="mt-3 text-xs text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 bg-emerald-900/20">
              Drop SGF files to import
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-2 text-sm text-slate-200 font-semibold"
              onClick={() => setListOpen((prev) => !prev)}
            >
              {listOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
              Library Items
            </button>
            <div className="flex items-center gap-2">
              {sortedItems.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-slate-200"
                  onClick={handleSelectAll}
                >
                  Select all
                </button>
              )}
              <div className="text-xs text-slate-500">
                {sortedItems.length} items{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
              </div>
            </div>
          </div>
          {selectedIds.size > 0 && (
            <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 text-xs text-slate-300">
              <button
                type="button"
                className="px-2 py-1 rounded bg-slate-800/70 border border-slate-700/60 hover:bg-slate-700/60"
                onClick={handleBulkExport}
              >
                Export
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded bg-rose-900/40 border border-rose-700/50 text-rose-200 hover:bg-rose-800/50"
                onClick={handleBulkDelete}
              >
                Delete
              </button>
              <select
                value={bulkMoveTarget}
                onChange={(e) => setBulkMoveTarget(e.target.value)}
                className="ml-2 bg-slate-800/80 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-200"
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
                className="px-2 py-1 rounded bg-slate-800/70 border border-slate-700/60 hover:bg-slate-700/60 disabled:opacity-40"
                onClick={handleBulkMove}
                disabled={!bulkMoveTarget}
              >
                Move
              </button>
              <button
                type="button"
                className="ml-auto px-2 py-1 rounded bg-slate-800/70 border border-slate-700/60 hover:bg-slate-700/60"
                onClick={handleClearSelection}
              >
                Clear
              </button>
            </div>
          )}
          <div
            className={[
              'flex-1 min-h-0 overflow-y-auto',
              dragOverRoot ? 'bg-emerald-500/10' : '',
            ].join(' ')}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
          >
            {!listOpen ? (
              <div className="p-4 text-xs text-slate-500">Library list hidden</div>
            ) : isSearching ? (
              sortedItems.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  <div className="font-semibold text-slate-300 mb-2">No matches</div>
                  <div>Try a different search term.</div>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {sortedItems.map((item) =>
                    isFolder(item) ? renderFolderRow(item, 0, false) : renderFileRow(item, 0)
                  )}
                </div>
              )
            ) : items.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                <div className="font-semibold text-slate-300 mb-2">Library is empty</div>
                <div>Save the current game or drag SGF files here to build your library.</div>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-800">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-200 font-semibold"
                    onClick={() => setRecentOpen((prev) => !prev)}
                  >
                    <span className="flex items-center gap-2">
                      {recentOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
                      Recent
                    </span>
                    <span className="text-xs text-slate-500">{recentFiles.length}</span>
                  </button>
                  {recentOpen && (
                    <div className="divide-y divide-slate-800">
                      {recentFiles.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-slate-500">No recent files.</div>
                      ) : (
                        recentFiles.map((item) => renderFileRow(item, 0))
                      )}
                    </div>
                  )}
                </div>
                <div className="divide-y divide-slate-800">
                  {(childrenMap.get(null) ?? []).map((item) =>
                    isFolder(item) ? renderFolderRow(item, 0) : renderFileRow(item, 0)
                  )}
                </div>
              </>
            )}
          </div>

          {docked && (
            <>
              <div
                className="hidden lg:block h-1 cursor-row-resize bg-slate-800/70 hover:bg-slate-600/80 transition-colors"
                onMouseDown={() => setIsResizingGraph(true)}
              />
              <div className="border-t border-slate-800 px-3 py-2">
                <button
                  type="button"
                  className="flex items-center gap-2 text-sm text-slate-200 font-semibold"
                  onClick={() => setGraphOpen((prev) => !prev)}
                >
                  {graphOpen ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
                  Analysis Graph
                </button>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className={[
                      'px-2 py-1 rounded text-xs font-medium',
                      graphOptions.score ? 'bg-blue-600/30 text-blue-200 border border-blue-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50',
                    ].join(' ')}
                    onClick={() => setGraphOptions((prev) => ({ ...prev, score: !prev.score }))}
                  >
                    Score
                  </button>
                  <button
                    type="button"
                    className={[
                      'px-2 py-1 rounded text-xs font-medium',
                      graphOptions.winrate ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/50' : 'bg-slate-800/60 text-slate-400 border border-slate-700/50',
                    ].join(' ')}
                    onClick={() => setGraphOptions((prev) => ({ ...prev, winrate: !prev.winrate }))}
                  >
                    Win%
                  </button>
                </div>
                {graphOpen && (
                  <div className="mt-2" style={{ height: graphHeight }}>
                    {graphOptions.score || graphOptions.winrate ? (
                      <ScoreWinrateGraph showScore={graphOptions.score} showWinrate={graphOptions.winrate} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-slate-500 border border-slate-800 rounded">
                        Graph hidden
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

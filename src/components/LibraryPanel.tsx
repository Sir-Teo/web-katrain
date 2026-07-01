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
  FaFileAlt,
  FaFileArchive,
  FaCopy,
  FaPlay,
  FaCloudDownloadAlt,
} from 'react-icons/fa';
import {
  LIBRARY_CURRENT_FOLDER_STORAGE_KEY,
  createLibraryBackup,
  createLibraryFolder,
  createLibraryItem,
  deleteLibraryItem,
  duplicateLibraryItem,
  duplicateLibraryItems,
  formatLibrarySize,
  getLibraryFileMoveSortCount,
  getLibraryFileMoveSummary,
  getLibraryFolderOptions,
  getLibraryStats,
  getUniqueLibraryItemName,
  libraryItemMatchesQuery,
  librarySgfDownloadFilename,
  loadLibrary,
  moveLibraryItems,
  restoreLibrary,
  saveLibrary,
  suggestLibraryItemNameFromSgf,
  updateLibraryFileSgf,
  updateLibraryItem,
  type LibraryItem,
  type LibraryFile,
  type LibraryFolder,
} from '../utils/library';
import { createLibraryZipBlob, importLibraryItemsFromZip } from '../utils/libraryZip';
import { assertValidLibrarySgfImport } from '../utils/libraryImportValidation';
import { stripUnsafeFilenameControls } from '../utils/filename';
import {
  PHOTO_BOARD_IMAGE_ACCEPT,
  PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE,
  isPhotoBoardImageFile,
  isUnsupportedPhotoBoardImageFile,
} from '../utils/photoBoard';
import { SectionHeader } from './layout/ui';
import { panelCardBase, panelCardClosed, panelCardOpen } from './layout/ui-utils';
import { getIndexedDB, readLocalStorage, writeLocalStorage } from '../utils/storage';
import { isMobileLayoutViewport } from '../utils/responsiveLayout';
import { downloadBlob as downloadBlobFile } from '../utils/objectUrl';
import { getDroppedSgfOrOgsText, hasPotentialGameImportDrag } from '../utils/dragImport';
import { createLibraryItemFromSgfOrOgsText } from '../utils/libraryTextImport';
import { ogsSyncFileName, ogsSyncFolderName, type OgsSyncedGame } from '../utils/ogsSync';
import { OgsSyncModal } from './OgsSyncModal';
import {
  getLibraryMenuNavigationIndex,
  getLibraryRowKeyAction,
  isLibraryMenuCloseKey,
} from '../utils/libraryKeyboard';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

const isFolder = (item: LibraryItem): item is LibraryFolder => item.type === 'folder';
const isFile = (item: LibraryItem): item is LibraryFile => item.type === 'file';
const safeDownloadName = (name: string, fallback: string): string =>
  stripUnsafeFilenameControls(name)
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '') || fallback;
const libraryImportAccept = [
  '.sgf',
  '.zip',
  'application/zip',
  'application/x-zip-compressed',
  PHOTO_BOARD_IMAGE_ACCEPT,
].join(',');

type LibraryTextDialogState = {
  title: string;
  label: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel: string;
  folderSelect?: {
    label: string;
    rootLabel: string;
    initialFolderId: string | null;
    options: Array<{ id: string; name: string; depth: number }>;
  };
  onSubmit: (value: string, folderId?: string | null) => void;
};

type LibraryConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

type LibraryContextMenuState = {
  x: number;
  y: number;
  itemId: string | null;
};

const LibraryTextDialog: React.FC<{
  dialog: LibraryTextDialogState;
  onClose: () => void;
}> = ({ dialog, onClose }) => {
  const [value, setValue] = useState(dialog.initialValue);
  const [folderId, setFolderId] = useState<string | null>(dialog.folderSelect?.initialFolderId ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  useEscapeToClose(onClose);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    if (!trimmed) return;
    dialog.onSubmit(trimmed, dialog.folderSelect ? folderId : undefined);
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
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close"
          >
            <FaTimes aria-hidden="true" />
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
          {dialog.folderSelect && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[var(--ui-text-muted)]">{dialog.folderSelect.label}</span>
              <select
                value={folderId ?? ''}
                onChange={(e) => setFolderId(e.target.value || null)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') onClose();
                }}
                className="w-full ui-input border rounded px-3 py-2 text-sm text-[var(--ui-text)] focus:border-[var(--ui-accent)] outline-none"
              >
                <option value="">{dialog.folderSelect.rootLabel}</option>
                {dialog.folderSelect.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {`${'-- '.repeat(option.depth)}${option.name}`}
                  </option>
                ))}
              </select>
            </label>
          )}
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
  useEscapeToClose(onClose);

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
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close"
          >
            <FaTimes aria-hidden="true" />
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
  showCloseButtonOnDesktop?: boolean;
  isMobile?: boolean;
  getCurrentSgf: () => string;
  onLoadSgf: (sgf: string) => boolean | Promise<boolean>;
  onToast: (msg: string, type: 'info' | 'error' | 'success') => void;
  onOpenPhotoBoard?: (file: File) => void;
  onLibraryUpdated?: () => void;
  onCurrentSaved?: () => void;
  loadedFileId?: string | null;
  loadedFileDirty?: boolean;
  onLoadedFileChange?: (id: string | null, name?: string | null) => void;
  externalFileUpdate?: { id: string; sgf: string; updatedAt: number } | null;
  externalItemRename?: { id: string; name: string; updatedAt: number } | null;
  externalItemCreate?: { item: LibraryItem; updatedAt: number } | null;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  open,
  docked = false,
  width,
  onClose,
  showCloseButtonOnDesktop = false,
  isMobile = false,
  getCurrentSgf,
  onLoadSgf,
  onToast,
  onOpenPhotoBoard,
  onLibraryUpdated,
  onCurrentSaved,
  loadedFileId = null,
  loadedFileDirty = false,
  onLoadedFileChange,
  externalFileUpdate = null,
  externalItemRename = null,
  externalItemCreate = null,
}) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const indexedDbAvailable = useMemo(() => getIndexedDB() !== null, []);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => {
    const raw = readLocalStorage(LIBRARY_CURRENT_FOLDER_STORAGE_KEY);
    return raw || null;
  });
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => {
    const raw = readLocalStorage('web-katrain:library_folders_expanded:v1');
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
  const [showOgsSync, setShowOgsSync] = useState(false);
  const [contextMenu, setContextMenu] = useState<LibraryContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const didLoadLibraryRef = useRef(false);
  const lastExternalFileUpdateRef = useRef<string | null>(null);
  const lastExternalItemRenameRef = useRef<string | null>(null);
  const lastExternalItemCreateRef = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerActionClass = 'panel-icon-button';
  const headerDangerActionClass = 'panel-icon-button ui-danger-soft';
  const headerSecondaryActionClass = `${headerActionClass} library-header-secondary-action`;
  const headerSecondaryDangerActionClass = `${headerDangerActionClass} library-header-secondary-action`;
  const bulkActionClass = 'panel-icon-button';
  const bulkDangerActionClass = 'panel-icon-button ui-danger-soft';
  const [sortKey, setSortKey] = useState(() => {
    return readLocalStorage('web-katrain:library_sort:v1') ?? 'recent';
  });
  const [listOpen, setListOpen] = useState(() => {
    return readLocalStorage('web-katrain:library_list_open:v1') !== 'false';
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

  useEffect(() => {
    if (!didLoadLibraryRef.current || !externalFileUpdate) return;
    const key = `${externalFileUpdate.id}:${externalFileUpdate.updatedAt}`;
    if (lastExternalFileUpdateRef.current === key) return;
    lastExternalFileUpdateRef.current = key;
    setItems((prev) =>
      updateLibraryFileSgf(prev, externalFileUpdate.id, externalFileUpdate.sgf, externalFileUpdate.updatedAt)
    );
  }, [externalFileUpdate]);

  useEffect(() => {
    if (!didLoadLibraryRef.current || !externalItemRename) return;
    const key = `${externalItemRename.id}:${externalItemRename.updatedAt}`;
    if (lastExternalItemRenameRef.current === key) return;
    lastExternalItemRenameRef.current = key;
    setItems((prev) =>
      updateLibraryItem(prev, externalItemRename.id, { name: externalItemRename.name }, externalItemRename.updatedAt)
    );
  }, [externalItemRename]);

  useEffect(() => {
    if (!didLoadLibraryRef.current || !externalItemCreate) return;
    const key = `${externalItemCreate.item.id}:${externalItemCreate.updatedAt}`;
    if (lastExternalItemCreateRef.current === key) return;
    lastExternalItemCreateRef.current = key;
    setItems((prev) =>
      prev.some((item) => item.id === externalItemCreate.item.id)
        ? prev.map((item) => (item.id === externalItemCreate.item.id ? externalItemCreate.item : item))
        : [externalItemCreate.item, ...prev]
    );
  }, [externalItemCreate]);

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
    writeLocalStorage(LIBRARY_CURRENT_FOLDER_STORAGE_KEY, activeFolderId ?? '');
  }, [activeFolderId]);

  useEffect(() => {
    const arr = Array.from(visibleExpandedFolderIds.values());
    writeLocalStorage('web-katrain:library_folders_expanded:v1', JSON.stringify(arr));
  }, [visibleExpandedFolderIds]);

  useEffect(() => {
    writeLocalStorage('web-katrain:library_sort:v1', String(sortKey));
  }, [sortKey]);

  useEffect(() => {
    writeLocalStorage('web-katrain:library_list_open:v1', String(listOpen));
  }, [listOpen]);

  useEffect(() => {
    onLibraryUpdated?.();
  }, [items, onLibraryUpdated]);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;

    const frame = window.requestAnimationFrame(() => {
      contextMenuRef.current
        ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
        ?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [contextMenu]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    return items.filter((item) => libraryItemMatchesQuery(item, query));
  }, [items, query]);

  const isSearching = query.trim().length > 0;

  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    switch (sortKey) {
      case 'name':
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'moves':
        arr.sort(
          (a, b) =>
            (isFile(b) ? getLibraryFileMoveSortCount(b) : 0) -
            (isFile(a) ? getLibraryFileMoveSortCount(a) : 0)
        );
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
  const folderOptions = useMemo(() => getLibraryFolderOptions(items), [items]);
  const currentFolder = folderItems.find((folder) => folder.id === activeFolderId) ?? null;
  const currentFolderName = currentFolder?.name ?? 'Root';
  const libraryStats = useMemo(() => getLibraryStats(items), [items]);
  const loadedLibraryFile = useMemo(() => {
    if (!loadedFileId) return null;
    const item = items.find((candidate) => candidate.id === loadedFileId);
    return item && isFile(item) ? item : null;
  }, [items, loadedFileId]);
  const canSaveCurrentToLibrary = libraryStatus !== 'loading' && libraryStatus !== 'error';
  const saveCurrentTitle = !canSaveCurrentToLibrary
    ? 'Library is not ready'
    : loadedLibraryFile
      ? `Update "${loadedLibraryFile.name}" in Library`
      : 'Save current game to Library';
  const libraryStorageBadge = libraryStatus === 'loading'
    ? 'Loading'
    : libraryStatus === 'saving'
      ? 'Saving'
      : libraryStatus === 'error'
        ? 'Error'
        : indexedDbAvailable
          ? 'IndexedDB'
          : 'Local';
  const libraryStorageTitle = libraryError
    ?? (indexedDbAvailable
      ? 'IndexedDB library storage'
      : 'Using local fallback storage because IndexedDB is unavailable');
  const libraryStatsText = [
    `${libraryStats.files} game${libraryStats.files === 1 ? '' : 's'}`,
    `${libraryStats.folders} folder${libraryStats.folders === 1 ? '' : 's'}`,
    formatLibrarySize(libraryStats.size),
  ].join(' · ');
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
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
    if (!loadedFileId) return new Set<string>();
    const ancestors = new Set<string>();
    let current = items.find((item) => item.id === loadedFileId);
    while (current?.parentId) {
      ancestors.add(current.parentId);
      current = items.find((item) => item.id === current?.parentId);
    }
    return ancestors;
  }, [loadedFileId, items]);

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
            return (
              (isFile(b) ? getLibraryFileMoveSortCount(b) : 0) -
              (isFile(a) ? getLibraryFileMoveSortCount(a) : 0)
            );
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

  const contextMenuItem = contextMenu?.itemId ? (itemById.get(contextMenu.itemId) ?? null) : null;
  const contextMenuSelection = useMemo(() => {
    if (!contextMenuItem) return new Set<string>();
    if (visibleSelectedIds.has(contextMenuItem.id)) return visibleSelectedIds;
    return new Set([contextMenuItem.id]);
  }, [contextMenuItem, visibleSelectedIds]);

  const clampContextMenuPosition = (x: number, y: number): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x, y };
    const menuWidth = 230;
    const menuHeight = 300;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - menuWidth - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - menuHeight - 8)),
    };
  };

  const openContextMenuAt = (x: number, y: number, item: LibraryItem | null) => {
    const position = clampContextMenuPosition(x, y);
    setContextMenu({ ...position, itemId: item?.id ?? null });
  };

  const openContextMenu = (event: React.MouseEvent, item: LibraryItem | null) => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt(event.clientX, event.clientY, item);
  };

  const openKeyboardContextMenu = (event: React.KeyboardEvent<HTMLElement>, item: LibraryItem | null) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenuAt(
      rect.left + Math.min(32, rect.width / 2),
      rect.top + Math.min(32, rect.height / 2),
      item
    );
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleContextMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isLibraryMenuCloseKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu();
      return;
    }

    const menuItems = Array.from(
      contextMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    );
    const currentIndex = menuItems.findIndex((item) => item === document.activeElement);
    const nextIndex = getLibraryMenuNavigationIndex({
      key: event.key,
      currentIndex,
      itemCount: menuItems.length,
    });
    if (nextIndex === null) return;

    event.preventDefault();
    event.stopPropagation();
    menuItems[nextIndex]?.focus();
  };

  const runContextAction = (action: () => void) => {
    closeContextMenu();
    action();
  };

  const activateFolderRow = (item: LibraryFolder) => {
    setCurrentFolderId(item.id);
    setExpandedFolderIds((prev) => new Set(prev).add(item.id));
  };

  const handleFileRowKeyDown = (item: LibraryFile) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const action = getLibraryRowKeyAction({ key: event.key, shiftKey: event.shiftKey, kind: 'file' });
    if (action === 'none') return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'activate') void handleLoad(item);
    else if (action === 'context-menu') openKeyboardContextMenu(event, item);
  };

  const handleFolderRowKeyDown = (
    item: LibraryFolder,
    isExpanded: boolean,
    hasChildren: boolean,
    allowChildren: boolean
  ) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const action = getLibraryRowKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      kind: 'folder',
      isExpanded,
      hasChildren,
      allowChildren,
    });
    if (action === 'none') return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'activate') activateFolderRow(item);
    else if (action === 'expand') setExpandedFolderIds((prev) => new Set(prev).add(item.id));
    else if (action === 'collapse') {
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } else if (action === 'context-menu') {
      openKeyboardContextMenu(event, item);
    }
  };

  const handleSaveCurrent = () => {
    if (!canSaveCurrentToLibrary) {
      onToast(
        libraryStatus === 'loading' ? 'Library is still loading.' : 'Library storage is unavailable.',
        libraryStatus === 'loading' ? 'info' : 'error'
      );
      return;
    }
    const sgf = getCurrentSgf();
    if (!sgf.trim()) {
      onToast('Nothing to save yet.', 'info');
      return;
    }
    if (loadedLibraryFile) {
      setItems((prev) => updateLibraryFileSgf(prev, loadedLibraryFile.id, sgf));
      onCurrentSaved?.();
      onToast(`Updated "${loadedLibraryFile.name}" in Library.`, 'success');
      return;
    }
    setTextDialog({
      title: 'Save to Library',
      label: 'Name',
      initialValue: suggestLibraryItemNameFromSgf(sgf, `Game ${items.length + 1}`),
      placeholder: 'Game name',
      confirmLabel: 'Save',
      folderSelect: {
        label: 'Save to folder',
        rootLabel: 'Root',
        initialFolderId: currentFolder?.id ?? null,
        options: folderOptions,
      },
      onSubmit: (name, targetFolderId) => {
        const parentId = targetFolderId ?? null;
        const uniqueName = getUniqueLibraryItemName(name, items, parentId);
        const newItem = createLibraryItem(uniqueName, sgf, parentId);
        setItems((prev) => [newItem, ...prev]);
        onLoadedFileChange?.(newItem.id, newItem.name);
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
        const uniqueName = getUniqueLibraryItemName(next, items, item.parentId ?? null, item.id);
        setItems((prev) => updateLibraryItem(prev, item.id, { name: uniqueName }));
        if (item.id === loadedFileId) onLoadedFileChange?.(item.id, uniqueName);
      },
    });
  };

  const handleCreateFolder = (parentId: string | null = activeFolderId) => {
    setTextDialog({
      title: 'New Folder',
      label: 'Name',
      initialValue: 'New Folder',
      placeholder: 'Folder name',
      confirmLabel: 'Create',
      onSubmit: (name) => {
        const uniqueName = getUniqueLibraryItemName(name, items, parentId);
        const folder = createLibraryFolder(uniqueName, parentId);
        setItems((prev) => [folder, ...prev]);
        setExpandedFolderIds((prev) => new Set(prev).add(folder.id));
        setCurrentFolderId(folder.id);
        onToast(`Created folder "${folder.name}".`, 'success');
      },
    });
  };

  const handleOgsSyncImport = (username: string, games: OgsSyncedGame[]) => {
    if (games.length === 0) return;
    const folderName = ogsSyncFolderName(username);
    let next = items;
    let folder = next.find(
      (item): item is LibraryFolder =>
        isFolder(item) && item.parentId === null && item.name === folderName
    );
    if (!folder) {
      folder = createLibraryFolder(folderName, null);
      next = [folder, ...next];
    }
    const folderId = folder.id;
    const files: LibraryItem[] = [];
    for (const game of games) {
      const name = getUniqueLibraryItemName(
        ogsSyncFileName(game.summary),
        [...next, ...files],
        folderId
      );
      files.push(createLibraryItem(name, game.sgf, folderId));
    }
    setItems([...files, ...next]);
    setExpandedFolderIds((prev) => new Set(prev).add(folderId));
    onToast(`Synced ${games.length} OGS game${games.length === 1 ? '' : 's'} into "${folderName}".`, 'success');
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
        onLoadedFileChange?.(null);
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
        if (loadedFileId === item.id || (isFolderItem && loadedFileId && isDescendantOf(loadedFileId, item.id))) {
          onLoadedFileChange?.(null);
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
    if (!downloadBlobFile(blob, librarySgfDownloadFilename(item.name))) {
      onToast('Failed to start SGF download.', 'error');
      return;
    }
    onToast(`Exported "${item.name}".`, 'success');
  };

  const handleBackupLibrary = () => {
    try {
      const blob = new Blob([createLibraryBackup(items)], { type: 'application/json' });
      if (!downloadBlobFile(blob, `webkatrain-library-${new Date().toISOString().slice(0, 10)}.json`)) {
        onToast('Failed to start library backup download.', 'error');
        return;
      }
      onToast('Library backup downloaded.', 'success');
    } catch {
      onToast('Failed to create library backup.', 'error');
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    if (!downloadBlobFile(blob, filename)) {
      throw new Error('Download unavailable');
    }
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

  const handleExportFolderZip = async (item: LibraryFolder) => {
    try {
      const { blob, fileCount } = await createLibraryZipBlob(items, new Set([item.id]));
      if (fileCount === 0) {
        onToast(`Folder "${item.name}" has no SGF files to export.`, 'info');
        return;
      }
      downloadBlob(blob, `${safeDownloadName(item.name, 'folder')}.zip`);
      onToast(`Exported "${item.name}" with ${fileCount} SGF file${fileCount === 1 ? '' : 's'}.`, 'success');
    } catch {
      onToast('Failed to export folder ZIP.', 'error');
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
      onLoadedFileChange?.(null);
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
          loadedFileId &&
          Array.from(visibleSelectedIds).some((id) => loadedFileId === id || isDescendantOf(loadedFileId, id))
        ) {
          onLoadedFileChange?.(null);
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
    const result = moveLibraryItems(items, visibleSelectedIds, targetId);
    setItems(result.items);
    setBulkMoveTarget('');
    if (result.movedIds.length === 0) {
      onToast('No selected items were moved.', 'info');
      return;
    }
    if (result.skippedIds.length > 0) {
      onToast(`Moved ${result.movedIds.length} item(s); skipped ${result.skippedIds.length} invalid move(s).`, 'info');
      return;
    }
    onToast(`Moved ${result.movedIds.length} selected item${result.movedIds.length === 1 ? '' : 's'}.`, 'success');
  };

  const handleMoveToRoot = (item: LibraryItem) => {
    if (!item.parentId) return;
    setItems((prev) => prev.map((candidate) => (
      candidate.id === item.id ? { ...candidate, parentId: null, updatedAt: Date.now() } : candidate
    )));
    onToast(`Moved "${item.name}" to Root.`, 'success');
  };

  const handleLoad = async (item: LibraryItem) => {
    if (!isFile(item)) return;
    try {
      const loaded = await onLoadSgf(item.sgf);
      if (!loaded) return;
      onLoadedFileChange?.(item.id, item.name);
      setCurrentFolderId(item.parentId ?? null);
      onToast(`Loaded "${item.name}".`, 'success');
      if (isMobileLayoutViewport()) {
        onClose();
      }
    } catch {
      onToast('Failed to load SGF from Library.', 'error');
    }
  };

  const handleImportFilesToFolder = async (files: FileList | null, folderId: string | null) => {
    if (!files || files.length === 0) return;
    const imported: LibraryItem[] = [];
    let openedPhotoBoard = false;
    let skippedUnsupportedPhotoImages = 0;
    let skippedInvalidSgfFiles = 0;
    const pushImportedItem = (item: LibraryItem) => {
      const uniqueName = getUniqueLibraryItemName(item.name, [...items, ...imported], item.parentId ?? null);
      imported.push(uniqueName === item.name ? item : { ...item, name: uniqueName });
    };
    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      try {
        if (isPhotoBoardImageFile(file)) {
          if (!openedPhotoBoard && onOpenPhotoBoard) {
            onOpenPhotoBoard(file);
            openedPhotoBoard = true;
          }
          continue;
        }
        if (isUnsupportedPhotoBoardImageFile(file)) {
          skippedUnsupportedPhotoImages += 1;
          continue;
        }
        if (name.endsWith('.zip')) {
          for (const item of await importLibraryItemsFromZip(file, folderId)) pushImportedItem(item);
          continue;
        }
        if (!name.endsWith('.sgf')) continue;
        const text = await file.text();
        try {
          assertValidLibrarySgfImport(text);
        } catch {
          skippedInvalidSgfFiles += 1;
          continue;
        }
        pushImportedItem(createLibraryItem(file.name.replace(/\.sgf$/i, ''), text, folderId));
      } catch {
        // ignore per-file failures
      }
    }
    if (imported.length === 0) {
      onToast(
        openedPhotoBoard
          ? 'Opened photo board from image.'
          : skippedUnsupportedPhotoImages > 0
            ? PHOTO_BOARD_UNSUPPORTED_IMAGE_MESSAGE
            : skippedInvalidSgfFiles > 0
              ? 'No valid SGF games were imported.'
              : 'No SGF, ZIP, or board image files were imported.',
        (skippedUnsupportedPhotoImages > 0 || skippedInvalidSgfFiles > 0) && !openedPhotoBoard ? 'error' : 'info'
      );
      return;
    }
    setItems((prev) => [...imported, ...prev]);
    const importedFiles = imported.filter(isFile).length;
    const skippedUnsupportedSummary = skippedUnsupportedPhotoImages > 0
      ? ` Skipped ${skippedUnsupportedPhotoImages} unsupported board image${skippedUnsupportedPhotoImages === 1 ? '' : 's'}.`
      : '';
    const skippedInvalidSgfSummary = skippedInvalidSgfFiles > 0
      ? ` Skipped ${skippedInvalidSgfFiles} invalid SGF file${skippedInvalidSgfFiles === 1 ? '' : 's'}.`
      : '';
    onToast(
      `Imported ${importedFiles} file${importedFiles === 1 ? '' : 's'}${openedPhotoBoard ? ' and opened photo board image' : ''}.${skippedUnsupportedSummary}${skippedInvalidSgfSummary}`,
      'success'
    );
  };

  const handleImportFiles = async (files: FileList | null) =>
    handleImportFilesToFolder(files, activeFolderId);

  const handleImportDroppedTextToFolder = async (
    dataTransfer: DataTransfer,
    folderId: string | null
  ): Promise<boolean> => {
    const droppedText = getDroppedSgfOrOgsText(dataTransfer);
    if (!droppedText) return false;
    try {
      const result = await createLibraryItemFromSgfOrOgsText(
        droppedText,
        folderId,
        `Game ${items.length + 1}`
      );
      const uniqueName = getUniqueLibraryItemName(result.item.name, items, result.item.parentId ?? null);
      const item = uniqueName === result.item.name ? result.item : { ...result.item, name: uniqueName };
      setItems((prev) => [item, ...prev]);
      onToast(
        result.source === 'ogs' && result.gameId
          ? `Imported OGS game ${result.gameId} to Library.`
          : `Imported "${item.name}" to Library.`,
        'success'
      );
    } catch {
      onToast('Failed to import dropped SGF or OGS URL.', 'error');
    }
    return true;
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      await handleImportFiles(event.dataTransfer.files);
      return;
    }
    if (await handleImportDroppedTextToFolder(event.dataTransfer, activeFolderId)) return;
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
    if (!draggingId && (event.dataTransfer.types.includes('Files') || hasPotentialGameImportDrag(event.dataTransfer))) {
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
    if (await handleImportDroppedTextToFolder(event.dataTransfer, folderId)) {
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

  const handleRootDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (await handleImportDroppedTextToFolder(event.dataTransfer, null)) {
      setDragOverRoot(false);
      return;
    }
    if (!draggingId) return;
    setItems((prev) =>
      prev.map((item) => (item.id === draggingId ? { ...item, parentId: null, updatedAt: Date.now() } : item))
    );
    setDraggingId(null);
    setDragOverRoot(false);
  };

  const renderFileRow = (item: LibraryFile, depth: number) => {
    const isSelected = visibleSelectedIds.has(item.id);
    const isLoaded = loadedFileId === item.id;
    const isLoadedDirty = isLoaded && loadedFileDirty;
    const selectFileLabel = `${isSelected ? 'Deselect' : 'Select'} ${item.name}`;
    const duplicateFileLabel = `Duplicate ${item.name}`;
    const downloadFileLabel = `Download ${item.name} as SGF`;
    const renameFileLabel = `Rename ${item.name}`;
    const deleteFileLabel = `Delete ${item.name}`;
    const moveSummary = getLibraryFileMoveSummary(item);
    return (
      <div
        key={item.id}
        className={[
          'library-tree-node',
          isSelected ? 'selected' : '',
          isLoaded ? 'loaded' : '',
          isLoadedDirty ? 'dirty' : '',
        ].join(' ')}
        style={{ paddingLeft: 12 + depth * 16 }}
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        aria-current={isLoaded ? 'true' : undefined}
        aria-label={`${item.name}, game file, ${moveSummary}${isLoadedDirty ? ', unsaved changes' : ''}`}
        data-library-row="file"
        data-library-row-name={item.name}
        data-library-loaded-dirty={isLoadedDirty ? 'true' : undefined}
        onClick={() => void handleLoad(item)}
        onKeyDown={handleFileRowKeyDown(item)}
        onContextMenu={(event) => openContextMenu(event, item)}
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
          title={selectFileLabel}
          aria-label={selectFileLabel}
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
          {moveSummary} · {(item.size / 1024).toFixed(1)} KB
        </div>
        {isLoadedDirty && (
          <span
            className="library-dirty-indicator"
            title="Unsaved changes"
            aria-label="Unsaved changes"
            data-library-dirty-indicator="true"
          >
            Unsaved
          </span>
        )}
        <div className="library-tree-node-actions">
          <button
            type="button"
            className="library-tree-node-action"
            onClick={(e) => {
              e.stopPropagation();
              handleDuplicate(item);
            }}
            title={duplicateFileLabel}
            aria-label={duplicateFileLabel}
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
            title={downloadFileLabel}
            aria-label={downloadFileLabel}
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
            title={renameFileLabel}
            aria-label={renameFileLabel}
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
            title={deleteFileLabel}
            aria-label={deleteFileLabel}
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
    const hasDirtyLoaded = hasLoaded && loadedFileDirty;
    const toggleFolderLabel = `${isExpanded ? 'Collapse' : 'Expand'} ${item.name}`;
    const selectFolderLabel = `${isSelected ? 'Deselect' : 'Select'} ${item.name}`;
    const duplicateFolderLabel = `Duplicate ${item.name}`;
    const exportFolderLabel = `Export ${item.name} as ZIP`;
    const renameFolderLabel = `Rename ${item.name}`;
    const deleteFolderLabel = `Delete ${item.name}`;
    return (
      <div key={item.id}>
        <div
          className={[
            'library-tree-node',
            isSelected ? 'selected' : '',
            activeFolderId === item.id ? 'selected' : '',
            hasLoaded ? 'has-loaded' : '',
            hasDirtyLoaded ? 'has-loaded-dirty' : '',
            dragOverId === item.id ? 'drop-target' : '',
          ].join(' ')}
          style={{ paddingLeft: 12 + depth * 16 }}
          role="treeitem"
          tabIndex={0}
          aria-selected={isSelected || activeFolderId === item.id}
          aria-expanded={allowChildren && children.length > 0 ? isExpanded : undefined}
          aria-label={`${item.name}, folder, ${children.length} item${children.length === 1 ? '' : 's'}${hasDirtyLoaded ? ', contains loaded game with unsaved changes' : ''}`}
          data-library-row="folder"
          data-library-row-name={item.name}
          data-library-folder-loaded-dirty={hasDirtyLoaded ? 'true' : undefined}
          onClick={() => activateFolderRow(item)}
          onKeyDown={handleFolderRowKeyDown(item, isExpanded, children.length > 0, allowChildren)}
          onContextMenu={(event) => openContextMenu(event, item)}
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
            title={toggleFolderLabel}
            aria-label={toggleFolderLabel}
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
            title={selectFolderLabel}
            aria-label={selectFolderLabel}
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
              title={duplicateFolderLabel}
              aria-label={duplicateFolderLabel}
            >
              <FaCopy size={12} />
            </button>
            <button
              type="button"
              className="library-tree-node-action"
              onClick={(e) => {
                e.stopPropagation();
                void handleExportFolderZip(item);
              }}
              title={exportFolderLabel}
              aria-label={exportFolderLabel}
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
              title={renameFolderLabel}
              aria-label={renameFolderLabel}
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
              title={deleteFolderLabel}
              aria-label={deleteFolderLabel}
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

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    const menuButtonClass = 'library-context-menu-item';
    const dangerMenuButtonClass = 'library-context-menu-item danger';

    return (
      <div
        ref={contextMenuRef}
        className="library-context-menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        role="menu"
        aria-label="Library actions"
        onKeyDown={handleContextMenuKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {!contextMenuItem ? (
          <button
            type="button"
            role="menuitem"
            className={menuButtonClass}
            onClick={() => runContextAction(() => handleCreateFolder())}
          >
            <FaPlus size={12} /> New folder
          </button>
        ) : contextMenuSelection.size > 1 && contextMenuSelection.has(contextMenuItem.id) ? (
          <>
            <div className="library-context-menu-header">{contextMenuSelection.size} selected</div>
            <button
              type="button"
              role="menuitem"
              className={menuButtonClass}
              onClick={() => runContextAction(handleBulkDuplicate)}
            >
              <FaCopy size={12} /> Duplicate selected
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuButtonClass}
              onClick={() => runContextAction(() => void handleBulkExport())}
            >
              <FaDownload size={12} /> Export selected as ZIP
            </button>
            <div className="library-context-menu-separator" />
            <button
              type="button"
              role="menuitem"
              className={dangerMenuButtonClass}
              onClick={() => runContextAction(handleBulkDelete)}
            >
              <FaTrash size={12} /> Delete selected
            </button>
          </>
        ) : (
          <>
            {isFile(contextMenuItem) && (
              <button
                type="button"
                role="menuitem"
                className={menuButtonClass}
                onClick={() => runContextAction(() => void handleLoad(contextMenuItem))}
              >
                <FaPlay size={12} /> Load
              </button>
            )}
            {isFolder(contextMenuItem) && (
              <button
                type="button"
                role="menuitem"
                className={menuButtonClass}
                onClick={() => runContextAction(() => handleCreateFolder(contextMenuItem.id))}
              >
                <FaPlus size={12} /> New folder inside
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={menuButtonClass}
              onClick={() => runContextAction(() => handleRename(contextMenuItem))}
            >
              <FaPen size={12} /> Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuButtonClass}
              onClick={() => runContextAction(() => handleDuplicate(contextMenuItem))}
            >
              <FaCopy size={12} /> Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuButtonClass}
              onClick={() => runContextAction(() => {
                if (isFile(contextMenuItem)) handleDownload(contextMenuItem);
                else void handleExportFolderZip(contextMenuItem);
              })}
            >
              <FaDownload size={12} /> {isFile(contextMenuItem) ? 'Download SGF' : 'Export folder as ZIP'}
            </button>
            {contextMenuItem.parentId && (
              <button
                type="button"
                role="menuitem"
                className={menuButtonClass}
                onClick={() => runContextAction(() => handleMoveToRoot(contextMenuItem))}
              >
                <FaArrowUp size={12} /> Move to Root
              </button>
            )}
            <div className="library-context-menu-separator" />
            <button
              type="button"
              role="menuitem"
              className={dangerMenuButtonClass}
              onClick={() => runContextAction(() => handleDelete(contextMenuItem))}
            >
              <FaTrash size={12} /> Delete
            </button>
          </>
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
      {showOgsSync && (
        <OgsSyncModal items={items} onClose={() => setShowOgsSync(false)} onImport={handleOgsSyncImport} />
      )}
      <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={onClose} />
      <div
        ref={panelRef}
        data-dropzone="library"
        data-layout-panel="library"
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
            className={[
              showCloseButtonOnDesktop ? '' : 'lg:hidden',
              'h-9 w-9 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] transition-colors',
            ].join(' ')}
            onClick={onClose}
            title="Close library"
            aria-label="Close library"
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
                  : !indexedDbAvailable
                    ? 'bg-[var(--ui-warning-soft)] text-[var(--ui-warning)] border-[var(--ui-warning)]'
                    : 'ui-success-soft text-[var(--ui-success)] border-[var(--ui-success)]',
            ].join(' ')}
            title={libraryStorageTitle}
            data-library-storage-badge="true"
          >
            {libraryStorageBadge}
          </div>
          <div className="flex flex-wrap items-center gap-1 ml-auto">
            <button
              type="button"
              className={headerActionClass}
              onClick={() => handleCreateFolder()}
              title="Create new folder"
              aria-label="Create new folder"
            >
              <FaPlus />
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={handleSaveCurrent}
              disabled={!canSaveCurrentToLibrary}
              title={saveCurrentTitle}
              aria-label={loadedLibraryFile ? 'Update loaded library game' : 'Save current game to Library'}
            >
              <FaSave />
            </button>
            <button
              type="button"
              className={headerActionClass}
              onClick={() => fileInputRef.current?.click()}
              title="Import SGF, ZIP, or board image files"
              aria-label="Import SGF, ZIP, or board image files"
            >
              <FaFolderOpen />
            </button>
            <button
              type="button"
              className={headerSecondaryActionClass}
              onClick={() => void handleExportLibraryZip()}
              title="Export library as ZIP"
              aria-label="Export library as ZIP"
            >
              <FaFileArchive />
            </button>
            <button
              type="button"
              className={headerSecondaryActionClass}
              onClick={() => setShowOgsSync(true)}
              title="Sync games from an OGS account"
              aria-label="Sync games from an OGS account"
            >
              <FaCloudDownloadAlt />
            </button>
            <button
              type="button"
              className={headerSecondaryActionClass}
              onClick={handleBackupLibrary}
              title="Download full library backup"
              aria-label="Download full library backup"
            >
              <FaDownload />
            </button>
            <button
              type="button"
              className={headerSecondaryActionClass}
              onClick={() => backupInputRef.current?.click()}
              title="Restore library backup"
              aria-label="Restore library backup"
            >
              <FaUpload />
            </button>
            <button
              type="button"
              className={headerSecondaryDangerActionClass}
              onClick={handleClearLibrary}
              title="Clear library"
              aria-label="Clear library"
            >
              <FaTrash />
            </button>
            <div className="library-header-secondary-action h-5 w-px bg-[var(--ui-border)] mx-1" />
            <input
              ref={fileInputRef}
              type="file"
              accept={libraryImportAccept}
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
                    aria-label="Search library"
                    placeholder="Search library…"
                    className="w-full ui-input border rounded pl-8 pr-3 py-1 text-sm text-[var(--ui-text)] focus:border-[var(--ui-accent)]"
                  />
                </div>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value)}
                  className="ui-input border rounded px-2 py-1 text-xs text-[var(--ui-text)]"
                  aria-label="Sort library"
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
                  title="Go to parent folder"
                  aria-label="Go to parent folder"
                >
                  <FaArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="panel-icon-button"
                  onClick={() => setCurrentFolderId(null)}
                  title="Go to library root"
                  aria-label="Go to library root"
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
                      aria-label={`Open folder ${crumb.name}`}
                    >
                      {index === 0 ? crumb.name : `/${crumb.name}`}
                    </button>
                  ))}
                {isDragging && (
                  <span className="ml-auto ui-accent-soft border rounded px-2 py-0.5">
                    Drop SGF, OGS URL, ZIP, or board images to import
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
                    aria-label="Move selected to folder"
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
                    title="Move selected items"
                    aria-label="Move selected items"
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
                role="tree"
                aria-label="Library games"
                onDragOver={handleRootDragOver}
                onDragLeave={handleRootDragLeave}
                onDrop={handleRootDrop}
                onContextMenu={(event) => {
                  if ((event.target as HTMLElement | null)?.closest?.('.library-tree-node')) return;
                  openContextMenu(event, null);
                }}
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
                    <div>Save the current game or drag SGF, ZIP, or board image files here to build your library.</div>
                  </div>
                ) : (
                  <div>
                    {(childrenMap.get(null) ?? []).map((item) =>
                      isFolder(item) ? renderFolderRow(item, 0) : renderFileRow(item, 0)
                    )}
                  </div>
                )}
              </div>
              {items.length > 0 && (
                <div className="library-stats" aria-label="Library totals">
                  {libraryStatsText}
                </div>
              )}
                </>
              ),
            })}

          </div>
        </div>
      </div>
      {renderContextMenu()}
    </>
  );
};

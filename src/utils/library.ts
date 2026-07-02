import { PRELOADED_GAMES } from '../data/preloadedGames';
import { stripUnsafeFilenameControls } from './filename';
import { getIndexedDB, readLocalStorage, writeLocalStorage } from './storage';

export type LibraryBase = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;
  type: 'file' | 'folder';
};

export type LibraryFileMetadata = {
  gameName?: string;
  black?: string;
  white?: string;
  event?: string;
  date?: string;
  result?: string;
  boardSize?: number;
  komi?: number;
  handicap?: number;
  rules?: string;
  setupStoneCount?: number;
};

export type LibraryFile = LibraryBase & {
  type: 'file';
  sgf: string;
  moveCount: number;
  size: number;
  metadata: LibraryFileMetadata;
  favorite?: boolean;
  tags?: string[];
};

export type LibraryFolder = LibraryBase & {
  type: 'folder';
};

export type LibraryItem = LibraryFile | LibraryFolder;

export type LibraryBackup = {
  version: 2;
  exportedAt: string;
  app: 'web-katrain';
  items: LibraryItem[];
};

export type DuplicateLibraryItemResult = {
  items: LibraryItem[];
  duplicated: LibraryItem | null;
  duplicatedIds: string[];
};

export type MoveLibraryItemsResult = {
  items: LibraryItem[];
  movedIds: string[];
  skippedIds: string[];
};

export type LibraryStats = {
  files: number;
  folders: number;
  size: number;
};

export type LibraryFolderOption = {
  id: string;
  name: string;
  depth: number;
};

const LEGACY_STORAGE_KEY = 'web-katrain:library:v1';
const MIGRATION_FLAG_KEY = 'web-katrain:library_migrated_to_idb:v1';
const PRELOADED_VERSION_KEY = 'web-katrain:library_preloaded_version:v1';
export const LIBRARY_CURRENT_FOLDER_STORAGE_KEY = 'web-katrain:library_current_folder:v1';
const PRELOADED_VERSION = 3;
const PRELOADED_FOLDER_NAME = 'Famous Games';
const DB_NAME = 'web-katrain-library';
const DB_VERSION = 1;
const ITEM_STORE = 'items';
const META_STORE = 'meta';

let memoryItems: LibraryItem[] | null = null;

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const unescapeSgfValue = (value: string): string => value.replace(/\\([\s\S])/g, '$1').trim();

const readRootSgfProperties = (sgf: string): Record<string, string[]> => {
  const start = sgf.indexOf('(;');
  if (start < 0) return {};
  let i = start + 2;
  let inValue = false;
  let escaped = false;
  while (i < sgf.length) {
    const ch = sgf[i]!;
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === '[') {
      inValue = true;
    } else if (ch === ']') {
      inValue = false;
    } else if (!inValue && (ch === ';' || ch === '(' || ch === ')')) {
      break;
    }
    i++;
  }

  const root = sgf.slice(start + 2, i);
  const props: Record<string, string[]> = {};
  const propRe = /([A-Za-z]+)((?:\[(?:\\.|[^\]])*\])+)/g;
  let propMatch: RegExpExecArray | null;
  while ((propMatch = propRe.exec(root))) {
    const key = propMatch[1]!.replace(/[a-z]/g, '');
    const valuesRaw = propMatch[2]!;
    const values: string[] = [];
    const valueRe = /\[((?:\\.|[^\]])*)\]/g;
    let valueMatch: RegExpExecArray | null;
    while ((valueMatch = valueRe.exec(valuesRaw))) values.push(unescapeSgfValue(valueMatch[1] ?? ''));
    if (values.length > 0) props[key] = props[key] ? props[key]!.concat(values) : values;
  }
  return props;
};

const numberProp = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
};

export const extractLibraryMetadata = (sgf: string): LibraryFileMetadata => {
  const props = readRootSgfProperties(sgf);
  const setupStoneCount = (props.AB?.length ?? 0) + (props.AW?.length ?? 0);
  return {
    gameName: props.GN?.[0] || undefined,
    black: props.PB?.[0] || undefined,
    white: props.PW?.[0] || undefined,
    event: props.EV?.[0] || undefined,
    date: props.DT?.[0] || undefined,
    result: props.RE?.[0] || undefined,
    boardSize: numberProp(props.SZ?.[0]),
    komi: numberProp(props.KM?.[0]),
    handicap: numberProp(props.HA?.[0]),
    rules: props.RU?.[0] || undefined,
    setupStoneCount: setupStoneCount > 0 ? setupStoneCount : undefined,
  };
};

const sanitizeLibraryItemName = (value: string): string | null => {
  const cleaned = stripUnsafeFilenameControls(value)
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .replace(/\.sgf$/i, '')
    .slice(0, 96)
    .trim();
  return cleaned || null;
};

export const suggestLibraryItemNameFromSgf = (sgf: string, fallback = 'Untitled'): string => {
  const metadata = extractLibraryMetadata(sgf);
  const gameName = metadata.gameName ? sanitizeLibraryItemName(metadata.gameName) : null;
  if (gameName) return gameName;

  const black = metadata.black ? sanitizeLibraryItemName(metadata.black) : null;
  const white = metadata.white ? sanitizeLibraryItemName(metadata.white) : null;
  if (black && white) return `${black} vs ${white}`;
  if (black) return black;
  if (white) return white;

  return sanitizeLibraryItemName(fallback) ?? 'Untitled';
};

export const librarySgfDownloadFilename = (name: string): string => {
  const stem = sanitizeLibraryItemName(name) ?? 'game';
  return `${stem}.sgf`;
};

export const getLibraryStats = (items: LibraryItem[]): LibraryStats =>
  items.reduce<LibraryStats>(
    (stats, item) => {
      if (item.type === 'folder') {
        stats.folders += 1;
      } else {
        stats.files += 1;
        stats.size += item.size;
      }
      return stats;
    },
    { files: 0, folders: 0, size: 0 }
  );

export const getLibraryFolderOptions = (items: LibraryItem[]): LibraryFolderOption[] => {
  const folders = items.filter((item): item is LibraryFolder => item.type === 'folder');
  const folderIds = new Set(folders.map((folder) => folder.id));
  const childrenByParent = new Map<string | null, LibraryFolder[]>();

  for (const folder of folders) {
    const parentId = folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(folder);
    childrenByParent.set(parentId, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  const options: LibraryFolderOption[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      options.push({ id: child.id, name: child.name, depth });
      walk(child.id, depth + 1);
    }
  };

  walk(null, 0);
  for (const folder of folders) {
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);
    options.push({ id: folder.id, name: folder.name, depth: 0 });
    walk(folder.id, 1);
  }
  return options;
};

export const getLibrarySaveTargetFolderId = ({
  items,
  loadedLibraryFileId,
  preferredFolderId,
}: {
  items: LibraryItem[];
  loadedLibraryFileId?: string | null;
  preferredFolderId?: string | null;
}): string | null => {
  const loadedLibraryItem = loadedLibraryFileId ? items.find((item) => item.id === loadedLibraryFileId) : null;
  if (loadedLibraryItem?.type === 'file') return loadedLibraryItem.parentId ?? null;
  if (!preferredFolderId) return null;
  return items.some((item) => item.type === 'folder' && item.id === preferredFolderId) ? preferredFolderId : null;
};

export const formatLibrarySize = (bytes: number): string => {
  const normalized = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (normalized < 1024) return `${normalized} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = normalized / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
};

export const getLibraryFileMoveSortCount = (item: LibraryFile): number =>
  item.moveCount > 0 ? item.moveCount : item.metadata.setupStoneCount ?? 0;

export const getLibraryFileMoveSummary = (item: LibraryFile): string => {
  if (item.moveCount > 0) return `${item.moveCount} move${item.moveCount === 1 ? '' : 's'}`;
  const setupStoneCount = item.metadata.setupStoneCount ?? 0;
  if (setupStoneCount > 0) return `${setupStoneCount} setup stone${setupStoneCount === 1 ? '' : 's'}`;
  return '0 moves';
};

const librarySearchTokens = (query: string): string[] =>
  query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export const getLibraryItemSearchText = (item: LibraryItem): string => {
  const fields: Array<string | undefined> = [item.name, item.type];
  if (item.type === 'file') {
    const metadata = item.metadata;
    fields.push(
      metadata.gameName,
      metadata.black,
      metadata.white,
      metadata.event,
      metadata.date,
      metadata.result,
      metadata.rules,
      typeof metadata.boardSize === 'number' ? `${metadata.boardSize}x${metadata.boardSize}` : undefined,
      typeof metadata.komi === 'number' ? `komi ${metadata.komi}` : undefined,
      typeof metadata.handicap === 'number' ? `handicap ${metadata.handicap}` : undefined,
      typeof metadata.setupStoneCount === 'number' ? `${metadata.setupStoneCount} setup stones` : undefined,
      getLibraryFileMoveSummary(item),
      item.favorite ? 'favorite starred' : undefined,
      ...(item.tags ?? []),
    );
  }
  return fields.filter((field): field is string => !!field).join(' ').toLowerCase();
};

export const libraryItemMatchesQuery = (item: LibraryItem, query: string): boolean => {
  const tokens = librarySearchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = getLibraryItemSearchText(item);
  return tokens.every((token) => haystack.includes(token));
};

const countMoves = (sgf: string): number => {
  if (!sgf) return 0;
  const matches = sgf.match(/;[BW]\[/g);
  return matches ? matches.length : 0;
};

const normalizeParentId = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export const normalizeLibraryItems = (rawItems: unknown): LibraryItem[] => {
  if (!Array.isArray(rawItems)) return [];
  const now = Date.now();
  return rawItems
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const raw = item as Record<string, unknown>;
      const parentId = normalizeParentId(raw.parentId);
      const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
      const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
      const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled';
      const id = typeof raw.id === 'string' && raw.id ? raw.id : createId();
      const isFolder = raw.type === 'folder' || typeof raw.sgf !== 'string';
      if (isFolder) {
        return {
          id,
          name,
          createdAt,
          updatedAt,
          parentId,
          type: 'folder',
        } as LibraryFolder;
      }
      const sgf = typeof raw.sgf === 'string' ? raw.sgf : '';
      const metadata = {
        ...extractLibraryMetadata(sgf),
        ...(raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as LibraryFileMetadata) : {}),
      };
      const tags = Array.isArray(raw.tags)
        ? Array.from(
            new Set(
              raw.tags
                .filter((tag): tag is string => typeof tag === 'string')
                .map((tag) => tag.trim())
                .filter(Boolean)
            )
          )
        : [];
      // Only attach favorite/tags when meaningful so untagged items keep their
      // original shape (no forced defaults), which keeps round-trips stable.
      return {
        id,
        name,
        createdAt,
        updatedAt,
        parentId,
        type: 'file',
        sgf,
        moveCount: typeof raw.moveCount === 'number' && Number.isFinite(raw.moveCount) ? raw.moveCount : countMoves(sgf),
        size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : sgf.length,
        metadata,
        ...(raw.favorite === true ? { favorite: true } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      } as LibraryFile;
    });
};

const safeParse = (raw: string | null): LibraryItem[] => {
  if (!raw) return [];
  try {
    return normalizeLibraryItems(JSON.parse(raw));
  } catch {
    return [];
  }
};

const getPreloadedVersion = (): number => {
  const raw = readLocalStorage(PRELOADED_VERSION_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const setPreloadedVersion = (version: number): void => {
  writeLocalStorage(PRELOADED_VERSION_KEY, String(version));
};

const createPreloadedLibrary = (): LibraryItem[] => {
  if (!PRELOADED_GAMES.length) return [];
  const now = Date.now();
  const folderId = createId();
  const folder: LibraryFolder = {
    id: folderId,
    name: PRELOADED_FOLDER_NAME,
    createdAt: now,
    updatedAt: now,
    parentId: null,
    type: 'folder',
  };
  const items: LibraryItem[] = [folder];
  for (const game of PRELOADED_GAMES) {
    items.push(createLibraryItem(game.name, game.sgf, folderId, now));
  }
  return items;
};

const ensurePreloadedLibrary = (items: LibraryItem[]): { items: LibraryItem[]; changed: boolean } => {
  if (getPreloadedVersion() >= PRELOADED_VERSION || PRELOADED_GAMES.length === 0) {
    return { items, changed: false };
  }
  const now = Date.now();
  let changed = false;
  let nextItems = [...items];
  let folder = nextItems.find(
    (item): item is LibraryFolder =>
      item.type === 'folder' && item.parentId === null && item.name === PRELOADED_FOLDER_NAME
  );

  if (!folder) {
    folder = {
      id: createId(),
      name: PRELOADED_FOLDER_NAME,
      createdAt: now,
      updatedAt: now,
      parentId: null,
      type: 'folder',
    };
    nextItems = [folder, ...nextItems];
    changed = true;
  }

  const existingNames = new Set(
    nextItems
      .filter((item): item is LibraryFile => item.type === 'file' && item.parentId === folder!.id)
      .map((item) => item.name)
  );

  for (const game of PRELOADED_GAMES) {
    if (existingNames.has(game.name)) continue;
    nextItems.push(createLibraryItem(game.name, game.sgf, folder.id, now));
    changed = true;
  }

  setPreloadedVersion(PRELOADED_VERSION);
  return { items: nextItems, changed };
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });

const openLibraryDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const indexedDb = getIndexedDB();
    if (!indexedDb) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEM_STORE)) {
        const store = db.createObjectStore(ITEM_STORE, { keyPath: 'id' });
        store.createIndex('parentId', 'parentId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

const loadFromIndexedDb = async (): Promise<LibraryItem[]> => {
  const db = await openLibraryDb();
  try {
    const tx = db.transaction(ITEM_STORE, 'readonly');
    const result = await requestToPromise(tx.objectStore(ITEM_STORE).getAll());
    return normalizeLibraryItems(result);
  } finally {
    db.close();
  }
};

const saveToIndexedDb = async (items: LibraryItem[]): Promise<void> => {
  const db = await openLibraryDb();
  try {
    const tx = db.transaction([ITEM_STORE, META_STORE], 'readwrite');
    const store = tx.objectStore(ITEM_STORE);
    store.clear();
    for (const item of normalizeLibraryItems(items)) store.put(item);
    tx.objectStore(META_STORE).put({ key: 'updatedAt', value: Date.now() });
    tx.objectStore(META_STORE).put({ key: 'schemaVersion', value: DB_VERSION });
    await transactionDone(tx);
  } finally {
    db.close();
  }
};

const loadFallbackLibrary = (): LibraryItem[] => {
  if (memoryItems) return memoryItems;
  const raw = readLocalStorage(LEGACY_STORAGE_KEY);
  if (raw === null) {
    memoryItems = createPreloadedLibrary();
  } else {
    memoryItems = safeParse(raw);
    const ensured = ensurePreloadedLibrary(memoryItems);
    memoryItems = ensured.items;
  }
  return memoryItems;
};

const saveFallbackLibrary = (items: LibraryItem[]): void => {
  memoryItems = normalizeLibraryItems(items);
  writeLocalStorage(LEGACY_STORAGE_KEY, JSON.stringify(memoryItems));
};

export const loadLibrary = async (): Promise<LibraryItem[]> => {
  if (!getIndexedDB()) {
    return loadFallbackLibrary();
  }

  try {
    let items = await loadFromIndexedDb();
    const legacyRaw = readLocalStorage(LEGACY_STORAGE_KEY);
    const hasMigrated = readLocalStorage(MIGRATION_FLAG_KEY) === 'true';

    if (items.length === 0 && legacyRaw !== null && !hasMigrated) {
      items = safeParse(legacyRaw);
      const ensured = ensurePreloadedLibrary(items);
      items = ensured.items;
      await saveToIndexedDb(items);
      writeLocalStorage(MIGRATION_FLAG_KEY, 'true');
      return items;
    }

    if (items.length === 0 && legacyRaw === null) {
      items = createPreloadedLibrary();
      await saveToIndexedDb(items);
      setPreloadedVersion(PRELOADED_VERSION);
      return items;
    }

    const ensured = ensurePreloadedLibrary(items);
    if (ensured.changed) {
      items = ensured.items;
      await saveToIndexedDb(items);
    }
    return items;
  } catch {
    return loadFallbackLibrary();
  }
};

export const saveLibrary = async (items: LibraryItem[]): Promise<void> => {
  const normalized = normalizeLibraryItems(items);
  if (!getIndexedDB()) {
    saveFallbackLibrary(normalized);
    return;
  }
  try {
    await saveToIndexedDb(normalized);
    memoryItems = normalized;
  } catch {
    saveFallbackLibrary(normalized);
  }
};

export const createLibraryItem = (
  name: string,
  sgf: string,
  parentId: string | null = null,
  timestamp = Date.now()
): LibraryFile => {
  return {
    id: createId(),
    name: name.trim() || 'Untitled',
    sgf,
    createdAt: timestamp,
    updatedAt: timestamp,
    moveCount: countMoves(sgf),
    size: sgf.length,
    metadata: extractLibraryMetadata(sgf),
    parentId,
    type: 'file',
  };
};

export const updateLibraryFileSgf = (
  items: LibraryItem[],
  id: string,
  sgf: string,
  timestamp = Date.now()
): LibraryItem[] => {
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== id || item.type !== 'file') return item;
    changed = true;
    return {
      ...item,
      sgf,
      updatedAt: timestamp,
      moveCount: countMoves(sgf),
      size: sgf.length,
      metadata: extractLibraryMetadata(sgf),
    };
  });
  return changed ? nextItems : items;
};

export const createLibraryFolder = (name: string, parentId: string | null = null): LibraryFolder => {
  const now = Date.now();
  return {
    id: createId(),
    name: name.trim() || 'New Folder',
    createdAt: now,
    updatedAt: now,
    parentId,
    type: 'folder',
  };
};

const createCopyName = (name: string): string => {
  if (name.toLowerCase().endsWith('.sgf')) return `${name.slice(0, -4)} (copy).sgf`;
  return `${name} (copy)`;
};

const uniqueLibraryName = (preferred: string, siblings: LibraryItem[]): string => {
  const existing = new Set(siblings.map((item) => item.name.toLowerCase()));
  if (!existing.has(preferred.toLowerCase())) return preferred;

  const dotSgf = preferred.toLowerCase().endsWith('.sgf');
  const base = dotSgf ? preferred.slice(0, -4) : preferred;
  const suffix = dotSgf ? '.sgf' : '';
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base} ${i}${suffix}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now()}${suffix}`;
};

export const getUniqueLibraryItemName = (
  preferred: string,
  items: LibraryItem[],
  parentId: string | null,
  excludeId?: string
): string => {
  const normalizedParentId = parentId ?? null;
  const siblings = items.filter(
    (item) => item.id !== excludeId && (item.parentId ?? null) === normalizedParentId
  );
  return uniqueLibraryName(preferred.trim() || 'Untitled', siblings);
};

export const duplicateLibraryItem = (
  items: LibraryItem[],
  id: string,
  timestamp = Date.now()
): DuplicateLibraryItemResult => {
  const source = items.find((item) => item.id === id);
  if (!source) return { items, duplicated: null, duplicatedIds: [] };

  const copies: LibraryItem[] = [];
  const duplicatedIds: string[] = [];
  const idMap = new Map<string, string>();
  const siblings = items.filter((item) => (item.parentId ?? null) === (source.parentId ?? null) && item.id !== source.id);
  const rootCopyName = uniqueLibraryName(createCopyName(source.name), siblings);

  const copyOne = (item: LibraryItem, parentId: string | null, name: string): LibraryItem => {
    const newId = createId();
    idMap.set(item.id, newId);
    duplicatedIds.push(newId);
    if (isLibraryFile(item)) {
      return {
        ...createLibraryItem(name, item.sgf, parentId, timestamp),
        id: newId,
      };
    }
    return {
      id: newId,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      parentId,
      type: 'folder',
    };
  };

  const rootCopy = copyOne(source, source.parentId ?? null, rootCopyName);
  copies.push(rootCopy);

  if (source.type === 'folder') {
    let copiedAny = true;
    while (copiedAny) {
      copiedAny = false;
      for (const item of items) {
        if (idMap.has(item.id)) continue;
        const copiedParentId = item.parentId ? idMap.get(item.parentId) : undefined;
        if (!copiedParentId) continue;
        copies.push(copyOne(item, copiedParentId, item.name));
        copiedAny = true;
      }
    }
  }

  return {
    items: [...copies, ...items],
    duplicated: rootCopy,
    duplicatedIds,
  };
};

export const duplicateLibraryItems = (
  items: LibraryItem[],
  ids: Iterable<string>,
  timestamp = Date.now()
): DuplicateLibraryItemResult => {
  const selectedIds = Array.from(ids);
  const selectedIdSet = new Set(selectedIds);
  const parentById = new Map(items.map((item) => [item.id, item.parentId ?? null]));
  const rootSelectedIds = selectedIds.filter((id) => {
    let parentId = parentById.get(id) ?? null;
    while (parentId) {
      if (selectedIdSet.has(parentId)) return false;
      parentId = parentById.get(parentId) ?? null;
    }
    return true;
  });

  let nextItems = items;
  const duplicatedIds: string[] = [];
  let firstDuplicated: LibraryItem | null = null;
  for (const id of rootSelectedIds) {
    const result = duplicateLibraryItem(nextItems, id, timestamp);
    nextItems = result.items;
    if (!firstDuplicated) firstDuplicated = result.duplicated;
    duplicatedIds.push(...result.duplicatedIds);
  }
  return { items: nextItems, duplicated: firstDuplicated, duplicatedIds };
};

const isLibraryFile = (item: LibraryItem): item is LibraryFile => item.type === 'file';

type LibraryItemUpdates = Partial<Pick<LibraryItem, 'name' | 'parentId'>>;

export const updateLibraryItem = (
  items: LibraryItem[],
  id: string,
  updates: LibraryItemUpdates,
  timestamp = Date.now()
): LibraryItem[] => {
  return items.map((item) => (item.id === id ? { ...item, ...updates, updatedAt: timestamp } : item));
};

export const normalizeTagList = (tags: Iterable<string>): string[] =>
  Array.from(
    new Set(
      Array.from(tags)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

export const toggleLibraryFileFavorite = (
  items: LibraryItem[],
  id: string,
  timestamp = Date.now()
): LibraryItem[] =>
  items.map((item) =>
    item.id === id && isLibraryFile(item)
      ? { ...item, favorite: !item.favorite, updatedAt: timestamp }
      : item
  );

export const setLibraryFileTags = (
  items: LibraryItem[],
  id: string,
  tags: Iterable<string>,
  timestamp = Date.now()
): LibraryItem[] => {
  const normalized = normalizeTagList(tags);
  return items.map((item) =>
    item.id === id && isLibraryFile(item)
      ? { ...item, tags: normalized, updatedAt: timestamp }
      : item
  );
};

export const getAllLibraryTags = (items: LibraryItem[]): string[] =>
  normalizeTagList(items.flatMap((item) => (isLibraryFile(item) ? item.tags ?? [] : [])));

const libraryParentById = (items: LibraryItem[]): Map<string, string | null> =>
  new Map(items.map((item) => [item.id, item.parentId ?? null]));

const libraryItemIsDescendantOf = (
  parentById: Map<string, string | null>,
  candidateId: string | null,
  ancestorId: string
): boolean => {
  if (!candidateId) return false;
  let current = parentById.get(candidateId) ?? null;
  while (current) {
    if (current === ancestorId) return true;
    current = parentById.get(current) ?? null;
  }
  return false;
};

export const moveLibraryItems = (
  items: LibraryItem[],
  ids: Iterable<string>,
  targetParentId: string | null,
  timestamp = Date.now()
): MoveLibraryItemsResult => {
  const selectedIds = new Set(ids);
  if (selectedIds.size === 0) return { items, movedIds: [], skippedIds: [] };

  const targetId = targetParentId ?? null;
  const targetIsValid = targetId === null || items.some((item) => item.type === 'folder' && item.id === targetId);
  const existingSelectedIds = items.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
  if (!targetIsValid) return { items, movedIds: [], skippedIds: existingSelectedIds };

  const parentById = libraryParentById(items);
  const movedIds: string[] = [];
  const skippedIds: string[] = [];
  const nextItems = items.map((item) => {
    if (!selectedIds.has(item.id)) return item;
    if ((item.parentId ?? null) === targetId) {
      skippedIds.push(item.id);
      return item;
    }
    if (targetId && (item.id === targetId || libraryItemIsDescendantOf(parentById, targetId, item.id))) {
      skippedIds.push(item.id);
      return item;
    }
    movedIds.push(item.id);
    return { ...item, parentId: targetId, updatedAt: timestamp };
  });

  return {
    items: movedIds.length > 0 ? nextItems : items,
    movedIds,
    skippedIds,
  };
};

const collectDescendants = (items: LibraryItem[], id: string): Set<string> => {
  const toDelete = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && toDelete.has(item.parentId) && !toDelete.has(item.id)) {
        toDelete.add(item.id);
        changed = true;
      }
    }
  }
  return toDelete;
};

export const deleteLibraryItem = (items: LibraryItem[], id: string): LibraryItem[] => {
  const ids = collectDescendants(items, id);
  return items.filter((item) => !ids.has(item.id));
};

export const createLibraryBackup = (items: LibraryItem[]): string => {
  const backup: LibraryBackup = {
    version: 2,
    exportedAt: new Date().toISOString(),
    app: 'web-katrain',
    items: normalizeLibraryItems(items),
  };
  return JSON.stringify(backup, null, 2);
};

export const parseLibraryBackup = (raw: string): LibraryItem[] => {
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed)) return normalizeLibraryItems(parsed);
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)) {
    return normalizeLibraryItems((parsed as { items: unknown }).items);
  }
  throw new Error('Invalid library backup');
};

export const backupLibrary = async (): Promise<string> => createLibraryBackup(await loadLibrary());

export const restoreLibrary = async (raw: string): Promise<LibraryItem[]> => {
  const items = parseLibraryBackup(raw);
  await saveLibrary(items);
  return items;
};

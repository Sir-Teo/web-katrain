import { PRELOADED_GAMES } from '../data/preloadedGames';
import { createSerialTaskQueue } from './serialTaskQueue';
import { applyLibraryChanges, type LibraryEditBatch } from './libraryEdits';
import { stripUnsafeFilenameControls } from './filename';
import { countSgfGames, countSgfMoves, sgfTrailingGames } from './sgfScan';
import { expandSgfPointList } from './sgf';
import { getIndexedDB, getLocalStorage, readLocalStorage, removeLocalStorage, writeLocalStorage } from './storage';
import { toSearchTerms } from './searchTerms';

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
/** Persisted twin of `fallbackHasUnflushedWrites`; see `setFallbackUnflushed`. */
const FALLBACK_UNFLUSHED_KEY = 'web-katrain:library_fallback_unflushed:v1';
const PRELOADED_VERSION_KEY = 'web-katrain:library_preloaded_version:v1';
export const LIBRARY_CURRENT_FOLDER_STORAGE_KEY = 'web-katrain:library_current_folder:v1';
const PRELOADED_VERSION = 3;
const PRELOADED_FOLDER_NAME = 'Famous Games';
const DB_NAME = 'web-katrain-library';
const DB_VERSION = 1;
const ITEM_STORE = 'items';
const META_STORE = 'meta';
/** Bumped by each localStorage fallback write; see `readFallbackRevision`. */
const FALLBACK_REVISION_KEY = 'web-katrain:library_fallback_revision:v1';
/** Web Locks name and BroadcastChannel name shared by every tab of the app. */
const LIBRARY_LOCK_NAME = 'web-katrain:library';
const LIBRARY_CHANNEL_NAME = 'web-katrain:library';

let memoryItems: LibraryItem[] | null = null;
/** The fallback revision `memoryItems` was last read or written at. */
let memoryRevision: string | null = null;

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const unescapeSgfValue = (value: string): string => value.replace(/\\([\s\S])/g, '$1').trim();

const readRootSgfProperties = (sgf: string): Record<string, string[]> => {
  // SGF allows whitespace between '(' and ';', and the parser accepts it; a
  // bare indexOf('(;') read such a file as having no metadata at all.
  const opening = /\(\s*;/.exec(sgf);
  if (!opening) return {};
  const rootStart = opening.index + opening[0].length;
  let i = rootStart;
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

  const root = sgf.slice(rootStart, i);
  const props: Record<string, string[]> = {};
  // Values may be separated by whitespace, as wrapped AB lists are.
  const propRe = /([A-Za-z]+)((?:\s*\[(?:\\.|[^\]])*\])+)/g;
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
  // Stones, not values: AB[aa:cc] is nine of them, as the board shows.
  const boardSizeProp = numberProp(props.SZ?.[0]);
  const countPoints = (values: string[] | undefined) =>
    (values ?? []).reduce((total, value) => total + expandSgfPointList(value, boardSizeProp ?? 19).length, 0);
  const setupStoneCount = countPoints(props.AB) + countPoints(props.AW);
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
    .replace(/\.sgf$/i, '');
  // By code point: a UTF-16 slice split an emoji at the limit and left a lone
  // surrogate, shown as "�" in the row and in the downloaded file's name.
  const limited = Array.from(cleaned).slice(0, 96).join('').trim();
  return limited || null;
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

export const getLibraryFolderOptions = (items: readonly LibraryItem[]): LibraryFolderOption[] => {
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
    siblings.sort((a, b) => compareLibraryNames(a.name, b.name) || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  const options: LibraryFolderOption[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    const pending = (childrenByParent.get(parentId) ?? []).map(child => ({ child, depth })).reverse();
    while (pending.length > 0) {
      const { child, depth } = pending.pop()!;
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      options.push({ id: child.id, name: child.name, depth });
      const children = childrenByParent.get(child.id) ?? [];
      for (let i = children.length - 1; i >= 0; i--) {
        pending.push({ child: children[i]!, depth: depth + 1 });
      }
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

// Backups can contain arbitrarily deep folders. Keep indentation bounded while
// retaining the destination name and its exact nesting level.
export const formatLibraryFolderOptionLabel = (option: LibraryFolderOption): string => {
  return option.depth > 4
    ? `… ${option.name} (level ${option.depth + 1})`
    : `${'-- '.repeat(option.depth)}${option.name}`;
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

/**
 * Library name order, reading numbers as numbers. The app names games
 * "Game 1".."Game 10" and suffixes duplicates " 2", " 10"; a plain
 * localeCompare put Game 10 and Game 11 before Game 2.
 */
export const compareLibraryNames = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

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

/**
 * Timestamp for recency lists: date plus hour and minute, never seconds — nobody
 * scans a "Recent" list to the second, and the extra digits wrapped the line.
 * Matches the minute precision already used for save status and game reports.
 */
export const formatLibraryTimestamp = (updatedAt: number): string => {
  const date = new Date(updatedAt);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * The games a "Recent" list should offer. The bundled Famous Games are seeded
 * with the moment of the first visit, so by `updatedAt` alone a new player's
 * "Recent" list was pro games they never opened, each stamped with today.
 * Seeded games still unchanged since seeding are left out; when nothing else
 * remains, they come back as `featured`, to be labelled and dated as what they
 * are rather than as the player's history.
 */
export type RecentLibraryFiles = { kind: 'recent' | 'featured'; files: LibraryFile[] };

export const selectRecentLibraryFiles = (
  items: LibraryItem[],
  limit = 6,
  /** A seeded game the player has opened counts as theirs. */
  wasOpened: (id: string) => boolean = () => false
): RecentLibraryFiles => {
  const preloadedFolderIds = new Set(
    items
      .filter((item) => item.type === 'folder' && item.parentId === null && item.name === PRELOADED_FOLDER_NAME)
      .map((item) => item.id)
  );
  const preloadedNames = new Set(PRELOADED_GAMES.map((game) => game.name));
  const files = items
    .filter((item): item is LibraryFile => item.type === 'file')
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const isUntouchedSeed = (file: LibraryFile) =>
    file.parentId !== null
    && preloadedFolderIds.has(file.parentId)
    && preloadedNames.has(file.name)
    && file.updatedAt === file.createdAt
    && !file.favorite
    && !(file.tags && file.tags.length > 0)
    && !wasOpened(file.id);
  const touched = files.filter((file) => !isUntouchedSeed(file));
  if (touched.length > 0) return { kind: 'recent', files: touched.slice(0, limit) };
  return { kind: 'featured', files: files.slice(0, limit) };
};

/** The detail line under a Recent or featured game: moves, size, and a date. */
export const formatRecentLibraryFileDetail = (file: LibraryFile, kind: 'recent' | 'featured'): string => {
  const parts = [`${file.moveCount} moves`];
  if (kind === 'featured') {
    // Bundled names already end in "(2005-12-10)"; don't say it twice.
    if (file.metadata.date && !file.name.includes(file.metadata.date)) parts.push(file.metadata.date);
    if (file.metadata.result) parts.push(file.metadata.result);
  } else {
    parts.push(formatLibrarySize(file.size), formatLibraryTimestamp(file.updatedAt));
  }
  return parts.filter(Boolean).join(' · ');
};

export const getLibraryFileMoveSortCount = (item: LibraryFile): number =>
  item.moveCount > 0 ? item.moveCount : item.metadata.setupStoneCount ?? 0;

export const getLibraryFileMoveSummary = (item: LibraryFile): string => {
  if (item.moveCount > 0) return `${item.moveCount} move${item.moveCount === 1 ? '' : 's'}`;
  const setupStoneCount = item.metadata.setupStoneCount ?? 0;
  if (setupStoneCount > 0) return `${setupStoneCount} setup stone${setupStoneCount === 1 ? '' : 's'}`;
  return '0 moves';
};

/**
 * True when a row's name already reads "<black> vs <white>", as imported game
 * records almost always do. The meta line below repeats that pair, and since the
 * name is what gets truncated at phone widths, the repetition costs the row the
 * event or date that actually tells it apart from its neighbours.
 */
export const libraryNameRepeatsPlayers = (
  name: string,
  black: string | undefined,
  white: string | undefined
): boolean => {
  const blackName = black?.trim();
  const whiteName = white?.trim();
  if (!blackName || !whiteName) return false;
  return name.toLowerCase().includes(`${blackName} vs ${whiteName}`.toLowerCase());
};

const librarySearchTokens = (query: string): string[] => toSearchTerms(query);

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

const countMoves = countSgfMoves;

const normalizeParentId = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Puts back at the root anything the folder tree cannot reach.
 *
 * Every item carries a `parentId` and nothing checked that it named a folder
 * that exists, or that following it ever arrived anywhere. The mutating
 * operations all guard against making such a tree -- `moveLibraryItems` and the
 * panel's drag-and-drop both refuse to put a folder inside its own descendant
 * -- but `restoreLibrary` hands a file the reader chose straight to the store,
 * and a backup is plain JSON that anything may have produced.
 *
 * Measured by restoring one: eight items in, "Restored 8 library items." on
 * screen and 5 files / 3 folders in the footer, with **three** of them
 * reachable from the root. Two games under a folder id that was not in the
 * file, and a game inside a two-folder cycle, were stored, counted, and
 * invisible -- across reloads, with no way back to them. The move-to-folder
 * picker offered the cycled folders as destinations, because it does its own
 * rescue, so the one surface that could still see them was a route to lose more.
 *
 * Cutting the one link that closes a cycle is enough to bring the whole run
 * back, so a folder keeps its contents and only loses a parent it could never
 * legitimately have had.
 */
const rerootUnreachableItems = (items: LibraryItem[]): LibraryItem[] => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const folderIds = new Set(items.filter((item) => item.type === 'folder').map((item) => item.id));

  // A parent that is not a folder in this library is not a parent at all.
  for (const item of items) {
    if (item.parentId !== null && !folderIds.has(item.parentId)) item.parentId = null;
  }

  // Then the chains that never arrive: each walk cuts at the node it revisits.
  const reachesRoot = new Set<string>();
  for (const item of items) {
    if (reachesRoot.has(item.id)) continue;
    const walked: LibraryItem[] = [];
    const onPath = new Set<string>();
    let current: LibraryItem | undefined = item;
    while (current) {
      if (reachesRoot.has(current.id)) break;
      if (onPath.has(current.id)) {
        current.parentId = null;
        break;
      }
      onPath.add(current.id);
      walked.push(current);
      if (current.parentId === null) break;
      const parent = byId.get(current.parentId);
      if (!parent) {
        current.parentId = null;
        break;
      }
      current = parent;
    }
    for (const node of walked) reachesRoot.add(node.id);
  }

  return items;
};

export const normalizeLibraryItems = (rawItems: unknown): LibraryItem[] => {
  if (!Array.isArray(rawItems)) return [];
  const now = Date.now();
  // Ids key the IndexedDB store, so a second record under one id -- a backup
  // merged by hand from two devices -- replaced the first on write: "Restored
  // 2 library items", and one after a reload. A repeat gets a fresh id; links
  // to the id keep pointing at the first.
  const seenIds = new Set<string>();
  const normalized: LibraryItem[] = rawItems
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const raw = item as Record<string, unknown>;
      const parentId = normalizeParentId(raw.parentId);
      const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now;
      const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;
      const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled';
      const storedId = typeof raw.id === 'string' && raw.id ? raw.id : null;
      const id = storedId && !seenIds.has(storedId) ? storedId : createId();
      seenIds.add(id);
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
      // Everything here is read from the SGF, and read afresh: a stored copy
      // took precedence, so each fix to that reading -- a player name after
      // "( ;", an AB[aa:cc] rectangle, a comment before the first move --
      // never reached games already in the library.
      const metadata: LibraryFileMetadata = extractLibraryMetadata(sgf);
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
        moveCount: countMoves(sgf),
        size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : sgf.length,
        metadata,
        ...(raw.favorite === true ? { favorite: true } : {}),
        ...(tags.length > 0 ? { tags } : {}),
      } as LibraryFile;
    });
  return rerootUnreachableItems(normalized);
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

/**
 * A write that found the stored library changed since it was read.
 *
 * Every tab has its own task queue, so two tabs could each read the library,
 * each add a game, and each write back what they had read plus their own game:
 * the second write replaced the first. Reproduced with two tabs saving at once
 * -- two "Saved to Library." toasts, one game after a reload. Web Locks keep
 * tabs from interleaving where the browser has them; this catches the rest, and
 * the operation runs again against what the other tab wrote.
 */
class LibraryConflictError extends Error {
  constructor() {
    super('The library was changed in another tab. Try again.');
    this.name = 'LibraryConflictError';
  }
}

/** A library as read, with where it came from and the revision it was read at. */
type LibrarySnapshot = { items: LibraryItem[]; source: 'idb' | 'fallback'; token: string };

const readMetaValue = (meta: IDBObjectStore, key: string): Promise<unknown> =>
  requestToPromise(meta.get(key)).then((record) => (record as { value?: unknown } | undefined)?.value);

/**
 * The stored library's revision. `updatedAt` is part of the token because a
 * tab still running an older build writes that and nothing else.
 */
const readStoredRevision = async (meta: IDBObjectStore): Promise<{ revision: number; token: string }> => {
  const [revision, updatedAt] = await Promise.all([readMetaValue(meta, 'revision'), readMetaValue(meta, 'updatedAt')]);
  const current = typeof revision === 'number' && Number.isFinite(revision) ? revision : 0;
  return { revision: current, token: `${current}:${typeof updatedAt === 'number' ? updatedAt : 0}` };
};

const loadFromIndexedDb = async (): Promise<{ items: LibraryItem[]; token: string }> => {
  const db = await openLibraryDb();
  try {
    const tx = db.transaction([ITEM_STORE, META_STORE], 'readonly');
    const [records, { token }] = await Promise.all([
      requestToPromise(tx.objectStore(ITEM_STORE).getAll()),
      readStoredRevision(tx.objectStore(META_STORE)),
    ]);
    return { items: normalizeLibraryItems(records), token };
  } finally {
    db.close();
  }
};

/**
 * Replaces the stored library with already-normalized items. Given the token
 * the library was read at, only if nothing wrote since: the check and the write
 * share one transaction, which the database runs alone against any other tab's.
 */
const saveToIndexedDb = async (items: LibraryItem[], expectedToken: string | null = null): Promise<string> => {
  const db = await openLibraryDb();
  try {
    const tx = db.transaction([ITEM_STORE, META_STORE], 'readwrite');
    const done = transactionDone(tx);
    // Handled here as well, so an abort before the final await is not unhandled.
    done.catch(() => undefined);
    const meta = tx.objectStore(META_STORE);
    const stored = await readStoredRevision(meta);
    if (expectedToken !== null && stored.token !== expectedToken) {
      tx.abort();
      throw new LibraryConflictError();
    }
    const store = tx.objectStore(ITEM_STORE);
    store.clear();
    for (const item of items) store.put(item);
    const updatedAt = Date.now();
    const revision = stored.revision + 1;
    meta.put({ key: 'revision', value: revision });
    meta.put({ key: 'updatedAt', value: updatedAt });
    meta.put({ key: 'schemaVersion', value: DB_VERSION });
    await done;
    setPreloadedVersion(PRELOADED_VERSION);
    return `${revision}:${updatedAt}`;
  } finally {
    db.close();
  }
};

/**
 * Bumped by every fallback write, so a tab can tell that its memory copy is
 * out of date and a write can tell that another tab wrote first.
 */
const readFallbackRevision = (): string => readLocalStorage(FALLBACK_REVISION_KEY) ?? '';

const rememberItems = (items: LibraryItem[]): void => {
  memoryItems = items;
  memoryRevision = readFallbackRevision();
};

const loadFallbackLibrary = (): LibraryItem[] => {
  const revision = readFallbackRevision();
  // Another tab may have written the fallback since this one read it. With no
  // stored copy there is nothing newer to read, and memory stays: where storage
  // is off, memory is the whole library.
  if (memoryItems && (memoryRevision === revision || readLocalStorage(LEGACY_STORAGE_KEY) === null)) {
    memoryRevision = revision;
    return memoryItems;
  }
  // Use the same version check as IndexedDB, including on the first load.
  // Saving records initialization only after the library is persisted.
  const ensured = ensurePreloadedLibrary(safeParse(readLocalStorage(LEGACY_STORAGE_KEY)));
  memoryItems = ensured.items;
  memoryRevision = revision;
  return memoryItems;
};

/**
 * Last resort when IndexedDB is gone.
 *
 * Reports whether the bytes actually landed, which used to be dropped on the
 * floor here. `writeLocalStorage` answers false for two very different things,
 * so they are separated: a store that is simply *absent* is a standing
 * condition outside a browser -- SSR, a Node test -- and memory-only is the
 * right answer there. A store that exists and *refuses* the write is out of
 * room. Inside a browser, absent means site data is switched off, and the
 * caller treats that as the failure it is; see `saveLibrarySnapshot`.
 *
 * Given the revision the library was read at, a write that another tab has
 * overtaken is refused rather than written over it.
 */
const saveFallbackLibrary = (
  items: LibraryItem[],
  expectedRevision: string | null = null
): 'saved' | 'rejected' | 'no-storage' => {
  if (expectedRevision !== null && readFallbackRevision() !== expectedRevision) throw new LibraryConflictError();
  // A refused write still leaves memory as the newest copy this tab has.
  rememberItems(items);
  if (!getLocalStorage()) return 'no-storage';
  if (!writeLocalStorage(LEGACY_STORAGE_KEY, JSON.stringify(items))) return 'rejected';
  writeLocalStorage(FALLBACK_REVISION_KEY, String((Number.parseInt(memoryRevision ?? '', 10) || 0) + 1));
  memoryRevision = readFallbackRevision();
  setPreloadedVersion(PRELOADED_VERSION);
  return 'saved';
};

// Set when reading IndexedDB failed while IndexedDB itself is available.
// A failed load leaves us holding a fallback snapshot (preloaded games or
// stale legacy data), so persisting it back would wipe the real library.
let idbLoadFailed = false;
/**
 * Set when a save went to the fallback only because IndexedDB was unavailable.
 *
 * IndexedDB can fail for a while and then work again, and every read retried it
 * unconditionally -- so the first read after it recovered returned the database
 * as it stood *before* the outage and threw away everything saved during it.
 * Measured: with 8 games stored, breaking IndexedDB, saving a ninth, then
 * letting it recover left the ninth gone for good.
 *
 * While this is set the fallback is the newer copy, so a recovered database is
 * written from it rather than read over it.
 */
let fallbackHasUnflushedWrites = false;

/**
 * The flag above, kept in storage too. Held only in memory, it was gone after
 * a reload: the recovered database was read on its own and the save made in
 * the fallback -- reported as "Saved to Library" -- vanished, then the next
 * fallback save wrote over it for good.
 */
const setFallbackUnflushed = (value: boolean): void => {
  fallbackHasUnflushedWrites = value;
  if (value) writeLocalStorage(FALLBACK_UNFLUSHED_KEY, 'true');
  else removeLocalStorage(FALLBACK_UNFLUSHED_KEY);
};

const hasUnflushedFallback = (): boolean =>
  fallbackHasUnflushedWrites || readLocalStorage(FALLBACK_UNFLUSHED_KEY) === 'true';

/**
 * Once the database holds the library, the legacy copy is never a first
 * migration again. A fallback written during an outage stays in that key, and
 * with the flag unset an emptied library read it back as one: clearing the
 * library returned the games just deleted.
 */
const markMigrated = (): void => {
  if (readLocalStorage(MIGRATION_FLAG_KEY) !== 'true') writeLocalStorage(MIGRATION_FLAG_KEY, 'true');
  // With the database holding everything, the legacy copy is only a stale
  // snapshot. Kept, it came back the next time an IndexedDB read failed: the
  // panel showed it, its first write put it back in the fallback as unflushed
  // work, and the next good load merged it in -- deleted games returned, and a
  // game edited since the outage reverted to its old moves for good. It also
  // held a whole library's worth of the localStorage quota.
  if (readLocalStorage(LEGACY_STORAGE_KEY) !== null) removeLocalStorage(LEGACY_STORAGE_KEY);
};

/**
 * Both copies of the library, keeping the newer record of anything in both.
 *
 * Used only to reconcile a fallback written during an IndexedDB outage with the
 * database that comes back afterwards; `updatedAt` is the only ordering either
 * side carries.
 */
export const mergeLibrariesByNewest = (stored: LibraryItem[], fallback: LibraryItem[]): LibraryItem[] => {
  const byId = new Map<string, LibraryItem>();
  for (const item of [...stored, ...fallback]) {
    const existing = byId.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
  }
  return normalizeLibraryItems([...byId.values()]);
};

type LibraryChangeListener = () => void;
const changeListeners = new Set<LibraryChangeListener>();
let changeChannel: BroadcastChannel | null = null;

/**
 * One channel per tab, for sending and hearing alike: a channel never hears
 * its own messages, so a tab is told only about other tabs' writes.
 */
const getChangeChannel = (): BroadcastChannel | null => {
  if (changeChannel) return changeChannel;
  try {
    if (typeof BroadcastChannel !== 'function') return null;
    const channel = new BroadcastChannel(LIBRARY_CHANNEL_NAME);
    channel.onmessage = () => {
      for (const listener of [...changeListeners]) listener();
    };
    // Node keeps a process alive while a channel is open; browsers have no unref.
    (channel as unknown as { unref?: () => void }).unref?.();
    changeChannel = channel;
    return channel;
  } catch {
    return null;
  }
};

/** Tells other tabs to read the library again. */
const notifyLibraryChanged = (): void => {
  try {
    getChangeChannel()?.postMessage({ type: 'library-changed' });
  } catch {
    // Other tabs only miss a refresh; their next write still reads fresh.
  }
};

/**
 * Calls `listener` whenever another tab of the app writes the library. Returns
 * the unsubscribe. Where BroadcastChannel is missing it never fires, and each
 * tab still reads the stored library before its own next change.
 */
export const subscribeToLibraryChanges = (listener: LibraryChangeListener): (() => void) => {
  changeListeners.add(listener);
  getChangeChannel();
  return () => {
    changeListeners.delete(listener);
  };
};

const fallbackSnapshot = (): LibrarySnapshot => {
  const items = loadFallbackLibrary();
  return { items, source: 'fallback', token: readFallbackRevision() };
};

const loadLibrarySnapshot = async (): Promise<LibrarySnapshot> => {
  if (!getIndexedDB()) {
    return fallbackSnapshot();
  }

  try {
    const loaded = await loadFromIndexedDb();
    let items = loaded.items;
    idbLoadFailed = false;
    // The database is back, and the fallback holds work it never saw. Merge
    // rather than replace: during an outage the fallback is whatever could be
    // scraped together, often nothing, so writing it over a recovered database
    // would destroy everything stored before the outage. A union keeps both
    // sides -- an item deleted during the outage comes back, which is the
    // failure worth having when the alternative is losing one for good.
    if (hasUnflushedFallback()) {
      const merged = mergeLibrariesByNewest(items, loadFallbackLibrary());
      const token = await saveToIndexedDb(merged, loaded.token);
      rememberItems(merged);
      setFallbackUnflushed(false);
      markMigrated();
      notifyLibraryChanged();
      return { items: merged, source: 'idb', token };
    }
    const legacyRaw = readLocalStorage(LEGACY_STORAGE_KEY);
    const hasMigrated = readLocalStorage(MIGRATION_FLAG_KEY) === 'true';

    if (items.length === 0 && legacyRaw !== null && !hasMigrated) {
      items = safeParse(legacyRaw);
      const ensured = ensurePreloadedLibrary(items);
      items = ensured.items;
      const token = await saveToIndexedDb(items, loaded.token);
      writeLocalStorage(MIGRATION_FLAG_KEY, 'true');
      notifyLibraryChanged();
      return { items, source: 'idb', token };
    }

    // Empty is also a valid saved library. Let the version check distinguish
    // first-run samples from an existing collection the user has cleared.
    const ensured = ensurePreloadedLibrary(items);
    if (ensured.changed) {
      items = ensured.items;
      const token = await saveToIndexedDb(items, loaded.token);
      notifyLibraryChanged();
      return { items, source: 'idb', token };
    }
    return { items, source: 'idb', token: loaded.token };
  } catch (error) {
    // Another tab wrote first; the caller reads again. Not a failed read.
    if (error instanceof LibraryConflictError) throw error;
    idbLoadFailed = true;
    // A read that failed is not an empty library. Falling back silently put
    // "Library is empty" on screen over games that were still in the database
    // -- alarming on its own, and an invitation to save something over them,
    // which is the write the outage reconciliation then has to rescue.
    //
    // A fallback with something in it is a real, if older, copy and worth
    // showing. An empty one says nothing, so say that instead of inventing an
    // answer: every caller already handles this rejection, and the panel has a
    // storage-error state waiting for it.
    const fallback = fallbackSnapshot();
    if (fallback.items.length > 0) return fallback;
    const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
    throw new Error(`${LIBRARY_READ_FAILED_MESSAGE}${reason}`);
  }
};

/**
 * Thrown when neither IndexedDB nor localStorage would take the library.
 *
 * Every caller already handles a rejection, and each does the right thing with
 * it: the panel shows its inline error status instead of "ready", saving to the
 * Library reports the failure rather than a green "Saved", and updating a
 * loaded file falls back to downloading the SGF. What none of them could do was
 * notice a save that quietly persisted nothing.
 */
export const LIBRARY_SAVE_FAILED_MESSAGE =
  'Could not save the library: browser storage is full or unavailable.';

export const LIBRARY_READ_FAILED_MESSAGE =
  'Could not read the library from browser storage. Your games are still there; reload to try again.';

/**
 * Persist the library, preferring IndexedDB and falling back to localStorage.
 *
 * Rejects if neither accepted the write. It used to resolve regardless, so a
 * device out of storage got "Saved to Library." and, on that same path, had its
 * autosave cleared straight afterwards -- the games were only in `memoryItems`
 * and went with the tab. Throwing runs the callers' existing catch blocks
 * *before* that cleanup, which is what keeps the fallback copy alive.
 *
 * That first fix only covered `'rejected'`. A browser with site data switched
 * off has *no* localStorage at all, which is `'no-storage'`, and took the
 * resolving path -- the same false "Saved to Library." and the same cleared
 * recovery, on the one configuration least able to survive it. Outside a
 * browser there is nobody to tell and memory-only is the intended mode, so the
 * distinction is `window`, not the store.
 */
const persistFallback = (items: LibraryItem[], expectedRevision: string | null = null): void => {
  const outcome = saveFallbackLibrary(items, expectedRevision);
  const inBrowser = typeof window !== 'undefined';
  if (outcome === 'rejected' || (outcome === 'no-storage' && inBrowser)) {
    throw new Error(LIBRARY_SAVE_FAILED_MESSAGE);
  }
};

/**
 * A fallback write, always marked for reconciliation, and marked before it is
 * made.
 *
 * Only a write that went to the fallback because an IndexedDB write *failed*
 * used to be marked. One made while the browser offered no IndexedDB at all --
 * for a moment, or until the next reload -- was not, so the database that came
 * back afterwards was read over it and the game saved in between was gone.
 * Where IndexedDB never appears the mark is simply never read.
 *
 * Marked first, so a write that landed is never left unmarked by a failure to
 * write the mark; a write that did not land puts the mark back as it was.
 */
const persistPendingFallback = (items: LibraryItem[], expectedRevision: string | null = null): void => {
  const wasPending = hasUnflushedFallback();
  setFallbackUnflushed(true);
  try {
    persistFallback(items, expectedRevision);
  } catch (error) {
    if (!wasPending) setFallbackUnflushed(false);
    throw error;
  }
};

/**
 * @see the note above `persistFallback` for why a fallback can reject.
 *
 * `base` is the snapshot a read-modify-write started from. The write is
 * refused with a `LibraryConflictError` if another tab changed the library
 * since, so the caller can apply its change again to what that tab wrote.
 */
const saveLibrarySnapshot = async (items: LibraryItem[], base: LibrarySnapshot | null = null): Promise<void> => {
  const normalized = normalizeLibraryItems(items);
  const hasIndexedDb = !!getIndexedDB();
  if (!hasIndexedDb || idbLoadFailed) {
    persistPendingFallback(normalized, base?.source === 'fallback' ? base.token : null);
    notifyLibraryChanged();
    return;
  }
  try {
    await saveToIndexedDb(normalized, base?.source === 'idb' ? base.token : null);
    rememberItems(normalized);
    if (hasUnflushedFallback()) setFallbackUnflushed(false);
    markMigrated();
  } catch (error) {
    if (error instanceof LibraryConflictError) throw error;
    persistPendingFallback(normalized);
  }
  notifyLibraryChanged();
};

const getLockManager = (): LockManager | null => {
  try {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    return locks && typeof locks.request === 'function' ? locks : null;
  } catch {
    return null;
  }
};

/**
 * Holds the library across every tab of the app for one task, where the
 * browser has Web Locks. A browser without them, or one that refuses the
 * request, still has the revision check in each write to fall back on.
 */
const withLibraryLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const locks = getLockManager();
  if (!locks) return task();
  let started = false;
  try {
    return (await locks.request(LIBRARY_LOCK_NAME, () => {
      started = true;
      return task();
    })) as T;
  } catch (error) {
    if (started) throw error;
    return task();
  }
};

/** A task that lost a race with another tab starts again from a fresh read. */
const MAX_CONFLICT_RETRIES = 8;
const retryOnConflict = async <T>(task: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (!(error instanceof LibraryConflictError) || attempt >= MAX_CONFLICT_RETRIES) throw error;
    }
  }
};

const runLibraryTask = createSerialTaskQueue();
/** In request order within this tab, one tab at a time across tabs. */
const runExclusiveLibraryTask = <T>(task: () => Promise<T>): Promise<T> =>
  runLibraryTask(() => withLibraryLock(() => retryOnConflict(task)));

let gameSaveRequestId = 0;
/** Order game-save UI notifications by request, independent of storage latency. */
export const nextLibraryGameSaveRequestId = (): number => ++gameSaveRequestId;

export const loadLibrary = (): Promise<LibraryItem[]> =>
  runExclusiveLibraryTask(async () => (await loadLibrarySnapshot()).items);

export const saveLibrary = (items: LibraryItem[]): Promise<void> =>
  runExclusiveLibraryTask(() => saveLibrarySnapshot(items));

/**
 * Keep a read/modify/write operation together, in the order it was requested.
 * `update` may run more than once if another tab writes in between, so it must
 * not have side effects beyond its result.
 */
export const updateStoredLibrary = <T>(
  update: (items: LibraryItem[]) => { items: LibraryItem[]; result: T }
): Promise<T> => runExclusiveLibraryTask(async () => {
  const loaded = await loadLibrarySnapshot();
  const mutation = update(loaded.items);
  // An update that changed nothing need not rewrite every record. Opening the
  // Library is one: it cleared and re-put the whole store each time -- 2.6s
  // to rows at 3,000 games. A fallback-only library still writes, since that
  // write is what keeps the fallback current.
  const unchanged = mutation.items === loaded.items && loaded.source === 'idb';
  if (!unchanged) await saveLibrarySnapshot(mutation.items, loaded);
  return mutation.result;
});

/** One panel's pending edits, acknowledged only after their write succeeds. */
export const createLibraryEditSaver = () => {
  let savedRevision = 0;
  return (batches: LibraryEditBatch[]): Promise<{ items: LibraryItem[]; revision: number }> => runExclusiveLibraryTask(async () => {
    const loaded = await loadLibrarySnapshot();
    let items = loaded.items;
    const pending = batches.filter(batch => batch.revision > savedRevision);
    for (const batch of pending) items = applyLibraryChanges(items, batch.changes);
    if (pending.length) {
      await saveLibrarySnapshot(items, loaded);
      // A later batch can contain earlier in-flight edits. Do not replay those
      // over another caller's intervening save once they have succeeded.
      savedRevision = pending[pending.length - 1].revision;
    }
    return { items, revision: savedRevision };
  });
};

/**
 * "Game N" for a game with no name of its own, numbered after the player's
 * earlier ones. Counting every item made a first save "Game 9", since the
 * bundled famous games and their folder were counted too.
 */
export const nextUntitledGameName = (items: LibraryItem[]): string => {
  let highest = 0;
  for (const item of items) {
    const match = item.type === 'file' ? /^Game (\d+)$/.exec(item.name) : null;
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Game ${highest + 1}`;
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

/**
 * Writes an edited game back over the record it came from.
 *
 * A record may hold a collection: several complete games in one file, of which
 * the app opens the first. The editor therefore hands back one game, and
 * writing it straight over the record deleted the rest. Measured by dropping a
 * three-game file on the panel, opening it and pressing Update: 187 bytes of
 * Alice, Carol and Eve became 165 bytes of Alice alone, with no prompt and no
 * way back -- two complete games gone because the save could only see the one
 * that was open.
 *
 * The games after the first are carried across as the text they already were.
 * Re-serializing them is not an option: nothing parsed them.
 */
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
    // Only when the edit is the single game this record opens; an incoming
    // collection is already whole and must not have the old tail appended.
    const trailing = countSgfGames(sgf) === 1 ? sgfTrailingGames(item.sgf) : '';
    const nextSgf = trailing ? `${sgf}\n${trailing}` : sgf;
    return {
      ...item,
      sgf: nextSgf,
      updatedAt: timestamp,
      moveCount: countMoves(nextSgf),
      size: nextSgf.length,
      metadata: extractLibraryMetadata(nextSgf),
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

type LibraryNamePool = { names: Set<string>; nextSuffix: Map<string, number> };

const reserveLibraryName = (preferred: string, pool: LibraryNamePool): string => {
  const key = preferred.toLowerCase();
  if (!pool.names.has(key)) {
    pool.names.add(key);
    return preferred;
  }

  const dotSgf = key.endsWith('.sgf');
  const base = dotSgf ? preferred.slice(0, -4) : preferred;
  const suffix = dotSgf ? '.sgf' : '';
  for (let i = pool.nextSuffix.get(key) ?? 2; ; i++) {
    const candidate = `${base} ${i}${suffix}`;
    const candidateKey = candidate.toLowerCase();
    if (!pool.names.has(candidateKey)) {
      pool.names.add(candidateKey);
      pool.nextSuffix.set(key, i + 1);
      return candidate;
    }
  }
};

const uniqueLibraryName = (preferred: string, siblings: LibraryItem[]): string =>
  reserveLibraryName(preferred, {
    names: new Set(siblings.map((item) => item.name.toLowerCase())),
    nextSuffix: new Map(),
  });

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

/** Name a completed import against the latest state, once per batch. */
export const prependLibraryImports = (
  items: readonly LibraryItem[],
  imported: readonly LibraryItem[]
): LibraryItem[] => {
  const pools = new Map<string | null, LibraryNamePool>();
  const poolFor = (parentId: string | null): LibraryNamePool => {
    let pool = pools.get(parentId);
    if (!pool) {
      pool = { names: new Set(), nextSuffix: new Map() };
      pools.set(parentId, pool);
    }
    return pool;
  };
  for (const item of items) poolFor(item.parentId ?? null).names.add(item.name.toLowerCase());
  const named = imported.map((item) => {
    const name = reserveLibraryName(item.name.trim() || 'Untitled', poolFor(item.parentId ?? null));
    return name === item.name ? item : { ...item, name };
  });
  return [...named, ...items];
};

const libraryChildrenByParent = (items: readonly LibraryItem[]): Map<string, LibraryItem[]> => {
  const children = new Map<string, LibraryItem[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = children.get(item.parentId);
    if (siblings) siblings.push(item);
    else children.set(item.parentId, [item]);
  }
  return children;
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
      // A saved record also contains tags, favorites, and metadata that may
      // not be present in its SGF. Preserve it without reparsing unchanged SGF.
      return {
        ...item,
        id: newId,
        name,
        parentId,
        createdAt: timestamp,
        updatedAt: timestamp,
        metadata: { ...item.metadata },
        ...(item.tags ? { tags: [...item.tags] } : {}),
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
    const children = libraryChildrenByParent(items);
    const pending = [...(children.get(source.id) ?? [])].reverse();
    while (pending.length > 0) {
      const item = pending.pop()!;
      if (idMap.has(item.id)) continue;
      const copiedParentId = item.parentId ? idMap.get(item.parentId) : undefined;
      if (!copiedParentId) continue;
      copies.push(copyOne(item, copiedParentId, item.name));
      const descendants = children.get(item.id) ?? [];
      for (let i = descendants.length - 1; i >= 0; i--) {
        pending.push(descendants[i]!);
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
  // An item inside a selected folder travels with that folder, as it does
  // for delete, duplicate and export. Moved on its own it was pulled out:
  // Select all, then Move, emptied every folder into the target.
  const hasSelectedAncestor = (id: string): boolean => {
    let parentId = parentById.get(id) ?? null;
    // Bounded, so a corrupt parent cycle cannot hang the move.
    for (let steps = 0; parentId && steps < items.length; steps++) {
      if (selectedIds.has(parentId)) return true;
      parentId = parentById.get(parentId) ?? null;
    }
    return false;
  };
  // Names stay unique within a folder, as creating, renaming, importing and
  // duplicating keep them; a move was the one way to end up with two "Game"s.
  const targetNames: LibraryNamePool = {
    names: new Set(items.filter((item) => (item.parentId ?? null) === targetId).map((item) => item.name.toLowerCase())),
    nextSuffix: new Map(),
  };
  const movedIds: string[] = [];
  const skippedIds: string[] = [];
  const nextItems = items.map((item) => {
    if (!selectedIds.has(item.id)) return item;
    if (hasSelectedAncestor(item.id)) return item;
    if ((item.parentId ?? null) === targetId) {
      skippedIds.push(item.id);
      return item;
    }
    if (targetId && (item.id === targetId || libraryItemIsDescendantOf(parentById, targetId, item.id))) {
      skippedIds.push(item.id);
      return item;
    }
    movedIds.push(item.id);
    const name = reserveLibraryName(item.name, targetNames);
    return { ...item, name, parentId: targetId, updatedAt: timestamp };
  });

  return {
    items: movedIds.length > 0 ? nextItems : items,
    movedIds,
    skippedIds,
  };
};

/** Existing selected items and all descendants, each included once. */
export const getLibrarySelectionIds = (items: readonly LibraryItem[], ids: Iterable<string>): Set<string> => {
  const selected = new Set(ids);
  const included = new Set<string>();
  if (selected.size === 0) return included;
  const pending = items.filter(item => selected.has(item.id)).map(item => item.id);
  if (pending.length === 0) return included;
  const children = libraryChildrenByParent(items);
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (included.has(id)) continue;
    included.add(id);
    for (const child of children.get(id) ?? []) {
      if (!included.has(child.id)) pending.push(child.id);
    }
  }
  return included;
};

export const deleteLibraryItems = (items: LibraryItem[], ids: Iterable<string>): LibraryItem[] => {
  const removed = getLibrarySelectionIds(items, ids);
  return removed.size > 0 ? items.filter(item => !removed.has(item.id)) : items;
};

export const deleteLibraryItem = (items: LibraryItem[], id: string): LibraryItem[] =>
  deleteLibraryItems(items, [id]);

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

export const restoreLibrary = async (raw: string): Promise<LibraryItem[]> => {
  const items = parseLibraryBackup(raw);
  await saveLibrary(items);
  return items;
};

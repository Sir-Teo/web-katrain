import { PRELOADED_GAMES } from '../data/preloadedGames';

export type LibraryBase = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;
  type: 'file' | 'folder';
};

export type LibraryFile = LibraryBase & {
  type: 'file';
  sgf: string;
  moveCount: number;
  size: number;
};

export type LibraryFolder = LibraryBase & {
  type: 'folder';
};

export type LibraryItem = LibraryFile | LibraryFolder;

const STORAGE_KEY = 'web-katrain:library:v1';
const PRELOADED_VERSION_KEY = 'web-katrain:library_preloaded_version:v1';
const PRELOADED_VERSION = 3;
const PRELOADED_FOLDER_NAME = 'Famous Games';

const safeParse = (raw: string | null): LibraryItem[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const parentId = typeof item.parentId === 'string' ? item.parentId : null;
        const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
        const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : createdAt;
        const name = typeof item.name === 'string' ? item.name : 'Untitled';
        const isFolder = item.type === 'folder' || typeof item.sgf !== 'string';
        if (isFolder) {
          return {
            id: typeof item.id === 'string' ? item.id : createId(),
            name,
            createdAt,
            updatedAt,
            parentId,
            type: 'folder',
          } as LibraryFolder;
        }
        const sgf = typeof item.sgf === 'string' ? item.sgf : '';
        return {
          id: typeof item.id === 'string' ? item.id : createId(),
          name,
          createdAt,
          updatedAt,
          parentId,
          type: 'file',
          sgf,
          moveCount: typeof item.moveCount === 'number' ? item.moveCount : countMoves(sgf),
          size: typeof item.size === 'number' ? item.size : sgf.length,
        } as LibraryFile;
      });
  } catch {
    return [];
  }
};

const createId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const countMoves = (sgf: string): number => {
  if (!sgf) return 0;
  const matches = sgf.match(/[BW]\[/g);
  return matches ? matches.length : 0;
};

const getPreloadedVersion = (): number => {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem(PRELOADED_VERSION_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const setPreloadedVersion = (version: number): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PRELOADED_VERSION_KEY, String(version));
  } catch {
    // Ignore quota/permission errors.
  }
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
    items.push({
      id: createId(),
      name: game.name,
      sgf: game.sgf,
      createdAt: now,
      updatedAt: now,
      parentId: folderId,
      type: 'file',
      moveCount: countMoves(game.sgf),
      size: game.sgf.length,
    });
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
    nextItems.push({
      id: createId(),
      name: game.name,
      sgf: game.sgf,
      createdAt: now,
      updatedAt: now,
      parentId: folder.id,
      type: 'file',
      moveCount: countMoves(game.sgf),
      size: game.sgf.length,
    });
    changed = true;
  }

  setPreloadedVersion(PRELOADED_VERSION);
  return { items: nextItems, changed };
};

export const loadLibrary = (): LibraryItem[] => {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    const seeded = createPreloadedLibrary();
    if (seeded.length) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      } catch {
        // Ignore quota/permission errors.
      }
    }
    setPreloadedVersion(PRELOADED_VERSION);
    return seeded;
  }
  const parsed = safeParse(raw);
  const { items, changed } = ensurePreloadedLibrary(parsed);
  if (changed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore quota/permission errors.
    }
  }
  return items;
};

export const saveLibrary = (items: LibraryItem[]): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota/permission errors.
  }
};

export const createLibraryItem = (name: string, sgf: string, parentId: string | null = null): LibraryFile => {
  const now = Date.now();
  return {
    id: createId(),
    name: name.trim() || 'Untitled',
    sgf,
    createdAt: now,
    updatedAt: now,
    moveCount: countMoves(sgf),
    size: sgf.length,
    parentId,
    type: 'file',
  };
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

type LibraryItemUpdates = Partial<Pick<LibraryItem, 'name' | 'parentId'>>;

export const updateLibraryItem = (items: LibraryItem[], id: string, updates: LibraryItemUpdates): LibraryItem[] => {
  return items.map((item) => (item.id === id ? { ...item, ...updates, updatedAt: Date.now() } : item));
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

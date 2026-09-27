import { getLocalStorage } from './storage';

export type AutoSavedGame = {
  version: 1;
  savedAt: number;
  sgf: string;
};

export type AutoSaveWriteResult = 'saved' | 'too-large' | 'failed';

type AutoSaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const AUTO_SAVED_GAME_KEY = 'web-katrain:auto_saved_game:v1';
export const AUTO_SAVE_MAX_BYTES = 5 * 1024 * 1024;
export const AUTO_SAVE_MAX_LABEL = '5 MB';

const getDefaultStorage = (): AutoSaveStorage | null => {
  return getLocalStorage();
};

function getSerializedByteLength(value: string): number {
  try {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(value).byteLength;
    }
  } catch {
    // Fall back to UTF-16 length if TextEncoder is unavailable or blocked.
  }
  return value.length;
}

export function readAutoSavedGame(storage: AutoSaveStorage | null = getDefaultStorage()): AutoSavedGame | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AUTO_SAVED_GAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AutoSavedGame> | null;
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.sgf !== 'string' || !parsed.sgf.trim()) return null;
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null;
    return { version: 1, savedAt: parsed.savedAt, sgf: parsed.sgf };
  } catch {
    return null;
  }
}

export function writeAutoSavedGame(
  sgf: string,
  storage: AutoSaveStorage | null = getDefaultStorage(),
  savedAt = Date.now()
): AutoSaveWriteResult {
  if (!storage || !sgf.trim()) return 'failed';
  try {
    const snapshot: AutoSavedGame = { version: 1, savedAt, sgf };
    const serialized = JSON.stringify(snapshot);
    // Too large to keep: leave the last copy that fit where it is. It is
    // older than the game on the board, but it is the only copy there is --
    // removing it turned "the newest changes are unprotected" into "nothing
    // is", one keystroke past the limit.
    if (getSerializedByteLength(serialized) > AUTO_SAVE_MAX_BYTES) return 'too-large';
    storage.setItem(AUTO_SAVED_GAME_KEY, serialized);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export function clearAutoSavedGame(storage: AutoSaveStorage | null = getDefaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(AUTO_SAVED_GAME_KEY);
  } catch {
    // Ignore unavailable or quota-limited storage.
  }
}

export type AutoSavedGame = {
  version: 1;
  savedAt: number;
  sgf: string;
};

type AutoSaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const AUTO_SAVED_GAME_KEY = 'web-katrain:auto_saved_game:v1';

const getDefaultStorage = (): AutoSaveStorage | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
};

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
): boolean {
  if (!storage || !sgf.trim()) return false;
  try {
    const snapshot: AutoSavedGame = { version: 1, savedAt, sgf };
    storage.setItem(AUTO_SAVED_GAME_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
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

import { readLocalStorage, writeLocalStorage } from './storage';

const STORAGE_KEY = 'web-katrain:library_positions:v1';
/** Enough for any real library's recent games, small enough to rewrite freely. */
const MAX_ENTRIES = 200;

/**
 * Where each Library game was left, as the child-index path from the root.
 *
 * Reopening a game put it back at move 0 -- a review stopped at move 140 had
 * to be found again by hand. A path rather than a move number, so a position
 * in a variation comes back to that variation; one that no longer resolves
 * (the game was edited elsewhere) simply opens at the start, as before.
 */
type PositionMap = Record<string, number[]>;

const readMap = (): PositionMap => {
  const raw = readLocalStorage(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const map: PositionMap = {};
    for (const [id, path] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(path) && path.every((step) => Number.isInteger(step) && step >= 0)) map[id] = path as number[];
    }
    return map;
  } catch {
    return {};
  }
};

export const readLibraryPosition = (id: string): number[] | null => readMap()[id] ?? null;

export const writeLibraryPosition = (id: string, path: number[]): void => {
  const map = readMap();
  const previous = map[id];
  if (previous && previous.length === path.length && previous.every((step, i) => step === path[i])) return;
  // Most recent last, so trimming drops the games left longest ago.
  delete map[id];
  map[id] = path;
  const ids = Object.keys(map);
  for (const stale of ids.slice(0, Math.max(0, ids.length - MAX_ENTRIES))) delete map[stale];
  writeLocalStorage(STORAGE_KEY, JSON.stringify(map));
};

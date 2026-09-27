import { getLocalStorage, getSessionStorage } from './storage';

export type AutoSavedGame = {
  version: 1;
  savedAt: number;
  sgf: string;
};

/** A recovery copy the startup prompt can offer, with the slot it lives in. */
export type RecoverableAutoSave = AutoSavedGame & { id: string };

export type AutoSaveWriteResult = 'saved' | 'too-large' | 'failed';

type AutoSaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type SessionIdStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The one slot every tab shared before recovery copies were kept per tab.
 * Two tabs overwrote each other's copy there, and either one saving or
 * starting a new game cleared the other's. It is still read -- a copy left
 * from before the change is offered like any other -- but never written.
 */
export const AUTO_SAVED_GAME_KEY = 'web-katrain:auto_saved_game:v1';
export const LEGACY_AUTO_SAVE_ID = 'legacy';
/** Which per-tab copies exist, with their time and size, so none has to be read to be counted. */
export const AUTO_SAVE_INDEX_KEY = 'web-katrain:auto_saved_games:v2';
export const AUTO_SAVE_ENTRY_KEY_PREFIX = 'web-katrain:auto_saved_game:v2:';
/** Last-seen times of the tabs that are open, so one tab never offers another's live copy. */
export const AUTO_SAVE_HEARTBEAT_KEY = 'web-katrain:auto_save_heartbeats:v2';
/** In sessionStorage: survives a reload of the same tab, and no other tab sees it. */
export const AUTO_SAVE_SESSION_KEY = 'web-katrain:auto_save_session:v1';
export const AUTO_SAVE_MAX_BYTES = 5 * 1024 * 1024;
export const AUTO_SAVE_MAX_LABEL = '5 MB';
/** Copies kept across all tabs; the oldest goes first. */
export const AUTO_SAVE_MAX_ENTRIES = 5;
export const AUTO_SAVE_MAX_TOTAL_BYTES = 6 * 1024 * 1024;
export const AUTO_SAVE_HEARTBEAT_MS = 15_000;
/** A tab not heard from for this long is taken to be closed. Three missed beats. */
export const AUTO_SAVE_LIVE_MS = 45_000;

type IndexEntry = { id: string; savedAt: number; bytes: number };

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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

const entryKey = (id: string): string =>
  id === LEGACY_AUTO_SAVE_ID ? AUTO_SAVED_GAME_KEY : `${AUTO_SAVE_ENTRY_KEY_PREFIX}${id}`;

function parseSnapshot(raw: string | null): AutoSavedGame | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AutoSavedGame> | null;
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.sgf !== 'string' || !parsed.sgf.trim()) return null;
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null;
    return { version: 1, savedAt: parsed.savedAt, sgf: parsed.sgf };
  } catch {
    return null;
  }
}

function readIndex(storage: AutoSaveStorage): IndexEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(AUTO_SAVE_INDEX_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const entries: IndexEntry[] = [];
    for (const item of parsed as Array<Partial<IndexEntry> | null>) {
      if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
      if (item.id !== LEGACY_AUTO_SAVE_ID && !SESSION_ID_PATTERN.test(item.id)) continue;
      if (typeof item.savedAt !== 'number' || !Number.isFinite(item.savedAt)) continue;
      const bytes = typeof item.bytes === 'number' && Number.isFinite(item.bytes) ? Math.max(0, item.bytes) : 0;
      seen.add(item.id);
      entries.push({ id: item.id, savedAt: item.savedAt, bytes });
    }
    return entries;
  } catch {
    return [];
  }
}

function writeIndex(storage: AutoSaveStorage, entries: IndexEntry[]): void {
  try {
    if (entries.length === 0) storage.removeItem(AUTO_SAVE_INDEX_KEY);
    else storage.setItem(AUTO_SAVE_INDEX_KEY, JSON.stringify(entries));
  } catch {
    // The copies themselves are what matter; the writer re-adds its own entry
    // on its next save.
  }
}

function readHeartbeats(storage: AutoSaveStorage): Record<string, number> {
  try {
    const parsed = JSON.parse(storage.getItem(AUTO_SAVE_HEARTBEAT_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const beats: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) beats[id] = at;
    }
    return beats;
  } catch {
    return {};
  }
}

function isLive(beats: Record<string, number>, id: string, now: number): boolean {
  const at = beats[id];
  return typeof at === 'number' && at > 0 && now - at < AUTO_SAVE_LIVE_MS;
}

function updateHeartbeat(storage: AutoSaveStorage, sessionId: string, now: number, alive: boolean): void {
  try {
    const beats = readHeartbeats(storage);
    const next: Record<string, number> = {};
    // Drop every tab gone quiet, so tabs that crashed do not pile up here.
    for (const [id, at] of Object.entries(beats)) {
      if (id !== sessionId && now - at < AUTO_SAVE_LIVE_MS) next[id] = at;
    }
    if (alive) next[sessionId] = now;
    if (Object.keys(next).length === 0) storage.removeItem(AUTO_SAVE_HEARTBEAT_KEY);
    else storage.setItem(AUTO_SAVE_HEARTBEAT_KEY, JSON.stringify(next));
  } catch {
    // Without heartbeats every other tab's copy just looks recoverable.
  }
}

function createSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // Fall through to a non-cryptographic id; it only has to be unique per origin.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isReloadNavigation(): boolean {
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return entry?.type === 'reload';
  } catch {
    return false;
  }
}

/**
 * The id this tab's recovery copy is kept under. It lives in sessionStorage so
 * a reload keeps its own copy, and no other tab can reach it.
 *
 * Browsers copy sessionStorage into a duplicated tab, so an id that is still
 * beating somewhere else belongs to the tab this one was copied from: take a
 * fresh one rather than share a slot. A reload is let through, since a tab
 * that crashed and reloaded within the live window would otherwise lose track
 * of its own copy.
 */
export function resolveAutoSaveSessionId(
  storage: AutoSaveStorage | null,
  sessionStore: SessionIdStorage | null,
  now = Date.now(),
  isReload = isReloadNavigation(),
): string {
  let id: string | null = null;
  try {
    const stored = sessionStore?.getItem(AUTO_SAVE_SESSION_KEY) ?? null;
    if (stored && SESSION_ID_PATTERN.test(stored)) id = stored;
  } catch {
    id = null;
  }
  if (id && !isReload && storage && isLive(readHeartbeats(storage), id, now)) id = null;
  if (!id) {
    id = createSessionId();
    try {
      sessionStore?.setItem(AUTO_SAVE_SESSION_KEY, id);
    } catch {
      // A per-page-load id still keeps tabs apart; only reload recovery suffers.
    }
  }
  return id;
}

let activeSessionId: string | null = null;

export function getAutoSaveSessionId(): string {
  if (!activeSessionId) {
    activeSessionId = resolveAutoSaveSessionId(getDefaultStorage(), getSessionStorage());
  }
  return activeSessionId;
}

type SessionOptions = { sessionId?: string; now?: number };

function removeEntry(storage: AutoSaveStorage, id: string): void {
  try {
    storage.removeItem(entryKey(id));
  } catch {
    // Ignore unavailable storage.
  }
}

/** Oldest copy of a closed tab first; a live tab's copy only once none of those is left. */
function pickEvictionVictim(others: IndexEntry[], beats: Record<string, number>, now: number): IndexEntry | null {
  const byAge = [...others].sort((a, b) => a.savedAt - b.savedAt);
  return byAge.find((entry) => !isLive(beats, entry.id, now)) ?? byAge[0] ?? null;
}

export function readAutoSavedGameById(
  id: string,
  storage: AutoSaveStorage | null = getDefaultStorage(),
): AutoSavedGame | null {
  if (!storage) return null;
  try {
    return parseSnapshot(storage.getItem(entryKey(id)));
  } catch {
    return null;
  }
}

/** This tab's own recovery copy. */
export function readAutoSavedGame(
  storage: AutoSaveStorage | null = getDefaultStorage(),
  sessionId = getAutoSaveSessionId(),
): AutoSavedGame | null {
  return readAutoSavedGameById(sessionId, storage);
}

/** When this tab's recovery copy was written, from the index rather than the copy itself. */
export function getAutoSavedAt(
  storage: AutoSaveStorage | null = getDefaultStorage(),
  sessionId = getAutoSaveSessionId(),
): number | undefined {
  if (!storage) return undefined;
  return readIndex(storage).find((entry) => entry.id === sessionId)?.savedAt;
}

export function writeAutoSavedGame(
  sgf: string,
  storage: AutoSaveStorage | null = getDefaultStorage(),
  savedAt = Date.now(),
  { sessionId = getAutoSaveSessionId(), now = Date.now() }: SessionOptions = {},
): AutoSaveWriteResult {
  if (!storage || !sgf.trim()) return 'failed';
  try {
    const snapshot: AutoSavedGame = { version: 1, savedAt, sgf };
    const serialized = JSON.stringify(snapshot);
    const bytes = getSerializedByteLength(serialized);
    // Too large to keep: leave the last copy that fit where it is. It is
    // older than the game on the board, but it is the only copy there is --
    // removing it turned "the newest changes are unprotected" into "nothing
    // is", one keystroke past the limit.
    if (bytes > AUTO_SAVE_MAX_BYTES) return 'too-large';

    const index = readIndex(storage);
    const previous = index.find((entry) => entry.id === sessionId);
    let others = index.filter((entry) => entry.id !== sessionId);
    const beats = readHeartbeats(storage);
    const evict = (): boolean => {
      const victim = pickEvictionVictim(others, beats, now);
      if (!victim) return false;
      removeEntry(storage, victim.id);
      others = others.filter((entry) => entry !== victim);
      return true;
    };
    const othersBytes = () => others.reduce((sum, entry) => sum + entry.bytes, 0);
    while (others.length + 1 > AUTO_SAVE_MAX_ENTRIES || othersBytes() + bytes > AUTO_SAVE_MAX_TOTAL_BYTES) {
      if (!evict()) break;
    }

    for (;;) {
      try {
        storage.setItem(entryKey(sessionId), serialized);
        break;
      } catch {
        // Storage full: make room from other copies, oldest first. This
        // tab's previous copy is left alone -- a refused write keeps it.
        if (!evict()) {
          writeIndex(storage, previous ? [previous, ...others] : others);
          return 'failed';
        }
      }
    }
    writeIndex(storage, [{ id: sessionId, savedAt, bytes }, ...others]);
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** Remove one recovery copy, by id. Only for this tab's own, or one the player chose to discard. */
export function discardAutoSavedGame(id: string, storage: AutoSaveStorage | null = getDefaultStorage()): void {
  if (!storage) return;
  removeEntry(storage, id);
  const index = readIndex(storage);
  if (index.some((entry) => entry.id === id)) {
    writeIndex(storage, index.filter((entry) => entry.id !== id));
  }
}

/** Clear this tab's recovery copy. Other tabs' copies are theirs. */
export function clearAutoSavedGame(
  storage: AutoSaveStorage | null = getDefaultStorage(),
  sessionId = getAutoSaveSessionId(),
): void {
  discardAutoSavedGame(sessionId, storage);
}

/**
 * The copies a new page may offer to restore, newest first: this tab's own
 * (from before a reload), and those of tabs that are no longer open. A copy
 * another open tab is still keeping is not offered -- that game is not lost.
 * A copy left in the old shared slot is listed too, and indexed as it goes.
 */
export function listRecoverableAutoSaves(
  storage: AutoSaveStorage | null = getDefaultStorage(),
  sessionId = getAutoSaveSessionId(),
  now = Date.now(),
): RecoverableAutoSave[] {
  if (!storage) return [];
  let index = readIndex(storage);
  let indexChanged = false;
  if (!index.some((entry) => entry.id === LEGACY_AUTO_SAVE_ID)) {
    try {
      const raw = storage.getItem(AUTO_SAVED_GAME_KEY);
      const legacy = parseSnapshot(raw);
      if (raw && legacy) {
        index = [...index, { id: LEGACY_AUTO_SAVE_ID, savedAt: legacy.savedAt, bytes: getSerializedByteLength(raw) }];
        indexChanged = true;
      }
    } catch {
      // Unreadable legacy slot: nothing to offer from it.
    }
  }

  const beats = readHeartbeats(storage);
  const recoverable: RecoverableAutoSave[] = [];
  const kept: IndexEntry[] = [];
  for (const entry of index) {
    if (entry.id !== sessionId && isLive(beats, entry.id, now)) {
      kept.push(entry);
      continue;
    }
    const snapshot = readAutoSavedGameById(entry.id, storage);
    if (!snapshot) {
      // The copy is gone or unreadable; stop counting it.
      removeEntry(storage, entry.id);
      indexChanged = true;
      continue;
    }
    kept.push(entry);
    recoverable.push({ ...snapshot, id: entry.id });
  }
  if (indexChanged) writeIndex(storage, kept);
  return recoverable.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Take over a restored copy: it becomes this tab's own, and its old slot is
 * freed. If this tab already holds a different copy (a reload that restored
 * another tab's game instead), that one is moved aside rather than
 * overwritten -- the player did not discard it. Returns whether the copy is
 * now this tab's; on failure the original slot is left untouched.
 */
export function claimAutoSavedGame(
  id: string,
  storage: AutoSaveStorage | null = getDefaultStorage(),
  { sessionId = getAutoSaveSessionId(), now = Date.now() }: SessionOptions = {},
): boolean {
  if (!storage) return false;
  if (id === sessionId) return true;
  const snapshot = readAutoSavedGameById(id, storage);
  if (!snapshot) return false;
  try {
    const own = storage.getItem(entryKey(sessionId));
    const ownSnapshot = parseSnapshot(own);
    if (own && ownSnapshot && ownSnapshot.sgf !== snapshot.sgf) {
      const asideId = createSessionId();
      storage.setItem(entryKey(asideId), own);
      writeIndex(storage, [
        { id: asideId, savedAt: ownSnapshot.savedAt, bytes: getSerializedByteLength(own) },
        ...readIndex(storage).filter((entry) => entry.id !== sessionId),
      ]);
    }
  } catch {
    return false;
  }
  if (writeAutoSavedGame(snapshot.sgf, storage, snapshot.savedAt, { sessionId, now }) !== 'saved') return false;
  discardAutoSavedGame(id, storage);
  return true;
}

export function touchAutoSaveHeartbeat(
  storage: AutoSaveStorage | null = getDefaultStorage(),
  sessionId = getAutoSaveSessionId(),
  now = Date.now(),
): void {
  if (storage) updateHeartbeat(storage, sessionId, now, true);
}

/** Leaving the page: this tab's copy becomes recoverable at once, including by its own reload. */
export function releaseAutoSaveHeartbeat(
  storage: AutoSaveStorage | null = getDefaultStorage(),
  sessionId = getAutoSaveSessionId(),
  now = Date.now(),
): void {
  if (storage) updateHeartbeat(storage, sessionId, now, false);
}

/** Keep this tab marked as open while it is. Returns the cleanup. */
export function startAutoSaveHeartbeat(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const touch = () => touchAutoSaveHeartbeat();
  const release = () => releaseAutoSaveHeartbeat();
  touch();
  const interval = window.setInterval(touch, AUTO_SAVE_HEARTBEAT_MS);
  window.addEventListener('pagehide', release);
  window.addEventListener('pageshow', touch);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener('pagehide', release);
    window.removeEventListener('pageshow', touch);
  };
}

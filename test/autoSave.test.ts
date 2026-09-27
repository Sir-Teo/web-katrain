import { describe, expect, it } from 'vitest';
import {
  AUTO_SAVE_ENTRY_KEY_PREFIX,
  AUTO_SAVE_HEARTBEAT_KEY,
  AUTO_SAVE_INDEX_KEY,
  AUTO_SAVE_LIVE_MS,
  AUTO_SAVE_MAX_BYTES,
  AUTO_SAVE_MAX_ENTRIES,
  AUTO_SAVE_MAX_TOTAL_BYTES,
  AUTO_SAVE_SESSION_KEY,
  AUTO_SAVED_GAME_KEY,
  LEGACY_AUTO_SAVE_ID,
  claimAutoSavedGame,
  clearAutoSavedGame,
  discardAutoSavedGame,
  getAutoSavedAt,
  listRecoverableAutoSaves,
  readAutoSavedGame,
  releaseAutoSaveHeartbeat,
  resolveAutoSaveSessionId,
  touchAutoSaveHeartbeat,
  writeAutoSavedGame,
} from '../src/utils/autoSave';

const makeStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

const A = 'tab-a';
const B = 'tab-b';

describe('auto-save helpers', () => {
  it('round trips an SGF snapshot', () => {
    const storage = makeStorage();

    expect(writeAutoSavedGame('(;GM[1]SZ[19];B[pd])', storage, 123, { sessionId: A })).toBe('saved');
    expect(readAutoSavedGame(storage, A)).toEqual({
      version: 1,
      savedAt: 123,
      sgf: '(;GM[1]SZ[19];B[pd])',
    });
    expect(getAutoSavedAt(storage, A)).toBe(123);
  });

  it('ignores malformed snapshots and blank games', () => {
    const storage = makeStorage();

    expect(writeAutoSavedGame('   ', storage, 123, { sessionId: A })).toBe('failed');
    storage.setItem(`${AUTO_SAVE_ENTRY_KEY_PREFIX}${A}`, '{"version":1,"savedAt":123,"sgf":"   "}');
    expect(readAutoSavedGame(storage, A)).toBeNull();
    storage.setItem(`${AUTO_SAVE_ENTRY_KEY_PREFIX}${A}`, '{not json');
    expect(readAutoSavedGame(storage, A)).toBeNull();
    storage.setItem(AUTO_SAVE_INDEX_KEY, '{not json');
    expect(listRecoverableAutoSaves(storage, A, 0)).toEqual([]);
  });

  it('skips an oversized snapshot but keeps the last copy that fit', () => {
    // Crossing the limit used to delete the previous checkpoint, so one long
    // comment left the game with no recovery copy at all.
    const storage = makeStorage();

    expect(writeAutoSavedGame('(;GM[1]SZ[19];B[pd])', storage, 123, { sessionId: A })).toBe('saved');

    const oversizedSgf = `(;GM[1]SZ[19]C[${'x'.repeat(AUTO_SAVE_MAX_BYTES)}])`;

    expect(writeAutoSavedGame(oversizedSgf, storage, 124, { sessionId: A })).toBe('too-large');
    expect(readAutoSavedGame(storage, A)).toEqual({
      version: 1,
      savedAt: 123,
      sgf: '(;GM[1]SZ[19];B[pd])',
    });
    // The time the UI shows for the copy still protecting the game.
    expect(getAutoSavedAt(storage, A)).toBe(123);
  });

  it('clears only the calling tab’s snapshot', () => {
    const storage = makeStorage();

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 1, { sessionId: A });
    writeAutoSavedGame('(;GM[1]SZ[19];B[bb])', storage, 2, { sessionId: B });
    clearAutoSavedGame(storage, A);

    expect(readAutoSavedGame(storage, A)).toBeNull();
    expect(readAutoSavedGame(storage, B)?.sgf).toBe('(;GM[1]SZ[19];B[bb])');
  });
});

/**
 * Every tab used to write the same key, so the last tab to save overwrote the
 * others, and any tab saving to the Library or starting a new game cleared the
 * copy another tab was relying on.
 */
describe('recovery copies are kept per tab', () => {
  it('keeps one tab’s copy when another tab saves', () => {
    const storage = makeStorage();

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 1, { sessionId: A });
    writeAutoSavedGame('(;GM[1]SZ[19];B[bb])', storage, 2, { sessionId: B });

    expect(readAutoSavedGame(storage, A)?.sgf).toBe('(;GM[1]SZ[19];B[aa])');
    expect(readAutoSavedGame(storage, B)?.sgf).toBe('(;GM[1]SZ[19];B[bb])');
  });

  it('offers closed tabs’ copies newest first, but not a copy another open tab is keeping', () => {
    const storage = makeStorage();
    const now = 1_000_000;

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 10, { sessionId: A, now });
    writeAutoSavedGame('(;GM[1]SZ[19];B[bb])', storage, 20, { sessionId: B, now });
    writeAutoSavedGame('(;GM[1]SZ[19];B[cc])', storage, 30, { sessionId: 'tab-c', now });
    // B is still open in another tab.
    touchAutoSaveHeartbeat(storage, B, now - 1000);

    const offered = listRecoverableAutoSaves(storage, 'new-tab', now);
    expect(offered.map((snapshot) => snapshot.id)).toEqual(['tab-c', A]);
    expect(offered[0]).toMatchObject({ savedAt: 30, sgf: '(;GM[1]SZ[19];B[cc])' });

    // Once B stops beating it is offered too.
    expect(listRecoverableAutoSaves(storage, 'new-tab', now + AUTO_SAVE_LIVE_MS).map((s) => s.id)).toContain(B);
  });

  it('always offers the tab its own copy after a reload', () => {
    const storage = makeStorage();

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 10, { sessionId: A });
    touchAutoSaveHeartbeat(storage, A, 100);

    expect(listRecoverableAutoSaves(storage, A, 101).map((snapshot) => snapshot.id)).toEqual([A]);
  });

  it('makes a closed tab’s copy recoverable at once when the page is left', () => {
    const storage = makeStorage();

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 10, { sessionId: A });
    touchAutoSaveHeartbeat(storage, A, 100);
    expect(listRecoverableAutoSaves(storage, B, 101)).toEqual([]);

    releaseAutoSaveHeartbeat(storage, A, 102);
    expect(listRecoverableAutoSaves(storage, B, 103).map((snapshot) => snapshot.id)).toEqual([A]);
  });

  it('discards only the copy that was chosen', () => {
    const storage = makeStorage();

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 10, { sessionId: A });
    writeAutoSavedGame('(;GM[1]SZ[19];B[bb])', storage, 20, { sessionId: B });
    discardAutoSavedGame(A, storage);

    expect(listRecoverableAutoSaves(storage, 'new-tab', 0).map((snapshot) => snapshot.id)).toEqual([B]);
  });

  it('moves a restored copy into the restoring tab, keeping that tab’s own different copy', () => {
    const storage = makeStorage();

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 10, { sessionId: A });
    writeAutoSavedGame('(;GM[1]SZ[19];B[bb])', storage, 20, { sessionId: B });

    expect(claimAutoSavedGame(A, storage, { sessionId: B })).toBe(true);

    expect(readAutoSavedGame(storage, B)).toEqual({ version: 1, savedAt: 10, sgf: '(;GM[1]SZ[19];B[aa])' });
    expect(readAutoSavedGame(storage, A)).toBeNull();
    const offered = listRecoverableAutoSaves(storage, 'new-tab', 0);
    // B's previous game was not discarded, so it is still on offer.
    expect(offered.map((snapshot) => snapshot.sgf).sort()).toEqual(['(;GM[1]SZ[19];B[aa])', '(;GM[1]SZ[19];B[bb])']);
  });

  it('reads the old shared slot, and deletes it only when asked', () => {
    const storage = makeStorage();
    storage.setItem(AUTO_SAVED_GAME_KEY, JSON.stringify({ version: 1, savedAt: 5, sgf: '(;GM[1]SZ[9];B[ee])' }));

    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 10, { sessionId: A });
    clearAutoSavedGame(storage, A);

    const offered = listRecoverableAutoSaves(storage, A, 0);
    expect(offered).toEqual([{ id: LEGACY_AUTO_SAVE_ID, version: 1, savedAt: 5, sgf: '(;GM[1]SZ[9];B[ee])' }]);
    // Listing it again does not duplicate it.
    expect(listRecoverableAutoSaves(storage, A, 0)).toHaveLength(1);

    expect(claimAutoSavedGame(LEGACY_AUTO_SAVE_ID, storage, { sessionId: A })).toBe(true);
    expect(storage.getItem(AUTO_SAVED_GAME_KEY)).toBeNull();
    expect(readAutoSavedGame(storage, A)?.sgf).toBe('(;GM[1]SZ[9];B[ee])');
  });

  it('keeps at most the configured number of copies, dropping the oldest closed tab’s first', () => {
    const storage = makeStorage();
    const now = 1_000_000;
    for (let i = 0; i < AUTO_SAVE_MAX_ENTRIES; i += 1) {
      writeAutoSavedGame(`(;GM[1]SZ[19]C[${i}])`, storage, i, { sessionId: `tab-${i}`, now });
    }
    // The oldest is still open elsewhere, so the next oldest goes instead.
    touchAutoSaveHeartbeat(storage, 'tab-0', now);

    writeAutoSavedGame('(;GM[1]SZ[19]C[new])', storage, 99, { sessionId: 'tab-new', now });

    const ids = listRecoverableAutoSaves(storage, 'tab-new', now + AUTO_SAVE_LIVE_MS).map((snapshot) => snapshot.id);
    expect(ids).toHaveLength(AUTO_SAVE_MAX_ENTRIES);
    expect(ids).toContain('tab-0');
    expect(ids).not.toContain('tab-1');
    expect(storage.getItem(`${AUTO_SAVE_ENTRY_KEY_PREFIX}tab-1`)).toBeNull();
  });

  it('bounds the total size of the copies kept', () => {
    const storage = makeStorage();
    const big = (tag: string) => `(;GM[1]SZ[19]C[${tag}${'x'.repeat(Math.floor(AUTO_SAVE_MAX_TOTAL_BYTES / 3))}])`;

    writeAutoSavedGame(big('a'), storage, 1, { sessionId: A });
    writeAutoSavedGame(big('b'), storage, 2, { sessionId: B });
    writeAutoSavedGame(big('c'), storage, 3, { sessionId: 'tab-c' });

    expect(readAutoSavedGame(storage, A)).toBeNull();
    expect(readAutoSavedGame(storage, B)).not.toBeNull();
    expect(readAutoSavedGame(storage, 'tab-c')).not.toBeNull();
  });

  it('makes room from other copies when storage is full, keeping its own last copy if it cannot', () => {
    const storage = makeStorage();
    writeAutoSavedGame('(;GM[1]SZ[19];B[aa])', storage, 1, { sessionId: A });
    writeAutoSavedGame('(;GM[1]SZ[19];B[bb])', storage, 2, { sessionId: B });

    // Quota: refuse any write while another tab's copy is still stored.
    const setItem = storage.setItem;
    storage.setItem = (key: string, value: string) => {
      if (key.startsWith(AUTO_SAVE_ENTRY_KEY_PREFIX) && storage.values.has(`${AUTO_SAVE_ENTRY_KEY_PREFIX}${A}`)) {
        throw new Error('QuotaExceededError');
      }
      setItem(key, value);
    };
    expect(writeAutoSavedGame('(;GM[1]SZ[19];B[cc])', storage, 3, { sessionId: B })).toBe('saved');
    expect(readAutoSavedGame(storage, A)).toBeNull();
    expect(readAutoSavedGame(storage, B)?.sgf).toBe('(;GM[1]SZ[19];B[cc])');

    // Nothing left to evict: the write fails and the previous copy survives.
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(writeAutoSavedGame('(;GM[1]SZ[19];B[dd])', storage, 4, { sessionId: B })).toBe('failed');
    storage.setItem = setItem;
    expect(readAutoSavedGame(storage, B)?.sgf).toBe('(;GM[1]SZ[19];B[cc])');
    expect(getAutoSavedAt(storage, B)).toBe(3);
  });

  it('prunes heartbeats of tabs that went quiet', () => {
    const storage = makeStorage();
    touchAutoSaveHeartbeat(storage, A, 0);
    touchAutoSaveHeartbeat(storage, B, AUTO_SAVE_LIVE_MS + 1);

    expect(Object.keys(JSON.parse(storage.getItem(AUTO_SAVE_HEARTBEAT_KEY) ?? '{}'))).toEqual([B]);
  });
});

describe('the per-tab session id', () => {
  const makeSession = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
  };

  it('is kept across a reload of the same tab', () => {
    const storage = makeStorage();
    const session = makeSession();

    const first = resolveAutoSaveSessionId(storage, session, 0, false);
    expect(session.getItem(AUTO_SAVE_SESSION_KEY)).toBe(first);
    expect(resolveAutoSaveSessionId(storage, session, 1, true)).toBe(first);
  });

  it('is replaced in a duplicated tab while the original is still open', () => {
    // Browsers copy sessionStorage into a duplicated tab.
    const storage = makeStorage();
    const session = makeSession();
    const original = resolveAutoSaveSessionId(storage, session, 0, false);
    touchAutoSaveHeartbeat(storage, original, 1000);

    const duplicate = resolveAutoSaveSessionId(storage, session, 2000, false);
    expect(duplicate).not.toBe(original);

    // After the original released its heartbeat (closed), the id is reusable.
    const later = makeSession();
    later.setItem(AUTO_SAVE_SESSION_KEY, original);
    releaseAutoSaveHeartbeat(storage, original, 3000);
    expect(resolveAutoSaveSessionId(storage, later, 3001, false)).toBe(original);
  });
});

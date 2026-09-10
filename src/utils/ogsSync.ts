import type { LibraryItem } from './library';
import { downloadOgsSgf } from './ogs';
import { fetchOgsResource, isOgsCancelledError, readBoundedResponseText } from './ogsQueue';

export type OgsPlayer = {
  id: number;
  username: string;
};

export type OgsGameSummary = {
  id: number;
  name: string;
  black: string;
  white: string;
  boardSize: number;
  ended: string;
};

export type OgsSyncProgress = {
  downloaded: number;
  total: number;
  current: OgsGameSummary | null;
};

export type OgsSyncedGame = {
  summary: OgsGameSummary;
  sgf: string;
};

const OGS_API_BASE = 'https://online-go.com/api/v1';
const SUPPORTED_BOARD_SIZES = new Set([9, 13, 19]);
export const OGS_SYNC_USERNAME_STORAGE_KEY = 'web-katrain:ogs_sync_username:v1';
export const OGS_SYNC_GAME_ID_MARKER = /\(ogs-(\d+)\)/;

export const ogsSyncFolderName = (username: string): string => `OGS - ${username}`;

export type OgsSyncOutcome = {
  added: number;
  skipped: number;
  failed: number;
  username: string;
};

/**
 * What to tell someone after a sync.
 *
 * It lives here rather than in the dialog because it has to agree with
 * `ogsSyncFolderName`, and it did not: the dialog spelled the folder out a
 * second time, so a change to the naming above would have left the summary
 * pointing at a folder that does not exist.
 *
 * It also named that folder unconditionally. Running a sync twice is the normal
 * way to use this — that is what "safe to run again" in the dialog invites —
 * and the second run skips everything, so the usual sentence was "Added 0 games
 * to "OGS - alice". 25 already in your library.", which claims a destination
 * nothing was written to. Nothing is added, so no folder is created.
 */
export const formatOgsSyncSummary = (result: OgsSyncOutcome): string => {
  const parts: string[] = [];
  if (result.added > 0) {
    const games = `${result.added} game${result.added === 1 ? '' : 's'}`;
    parts.push(`Added ${games} to "${ogsSyncFolderName(result.username)}".`);
    if (result.skipped > 0) parts.push(`${result.skipped} already in your library.`);
  } else if (result.skipped > 0) {
    parts.push(
      result.skipped === 1
        ? 'No new games. The one OGS listed is already in your library.'
        : `No new games. All ${result.skipped} are already in your library.`,
    );
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} failed to download.`);
  }
  return parts.join(' ');
};

export const ogsSyncFileName = (game: OgsGameSummary): string => {
  const date = game.ended.slice(0, 10);
  const base = `${game.black} vs ${game.white}`;
  return date ? `${base} ${date} (ogs-${game.id})` : `${base} (ogs-${game.id})`;
};

/**
 * Collects the OGS game ids already present anywhere in the library, based on
 * the "(ogs-<id>)" marker that synced files carry in their names.
 */
export const collectExistingOgsGameIds = (items: LibraryItem[]): Set<number> => {
  const ids = new Set<number>();
  for (const item of items) {
    if (item.type !== 'file') continue;
    const match = OGS_SYNC_GAME_ID_MARKER.exec(item.name);
    if (match) ids.add(Number(match[1]));
  }
  return ids;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const readUsername = (player: unknown): string => {
  const record = asRecord(player);
  const username = record?.username;
  return typeof username === 'string' && username.trim() ? username : 'Unknown';
};

export const parseOgsPlayerSearch = (payload: unknown, username: string): OgsPlayer | null => {
  const results = asRecord(payload)?.results;
  if (!Array.isArray(results)) return null;
  const wanted = username.trim().toLowerCase();
  for (const entry of results) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = record.id;
    const name = record.username;
    if (typeof id !== 'number' || typeof name !== 'string') continue;
    if (name.toLowerCase() === wanted) return { id, username: name };
  }
  return null;
};

/**
 * Parses one page of the OGS player-games endpoint into finished, square,
 * supported-size games (annulled and live games are skipped).
 */
export const parseOgsGameList = (payload: unknown): OgsGameSummary[] => {
  const results = asRecord(payload)?.results;
  if (!Array.isArray(results)) return [];
  const games: OgsGameSummary[] = [];
  for (const entry of results) {
    const record = asRecord(entry);
    if (!record) continue;
    const { id, ended, width, height, annulled } = record;
    if (typeof id !== 'number') continue;
    if (typeof ended !== 'string' || !ended) continue;
    if (annulled === true) continue;
    if (typeof width !== 'number' || width !== height || !SUPPORTED_BOARD_SIZES.has(width)) continue;
    const players = asRecord(record.players);
    games.push({
      id,
      name: typeof record.name === 'string' ? record.name : '',
      black: readUsername(players?.black),
      white: readUsername(players?.white),
      boardSize: width,
      ended,
    });
  }
  return games;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetchOgsResource(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`OGS request failed (${response.status} ${response.statusText})`);
  }
  // A game list for fifty games is a few hundred kilobytes; this is a ceiling
  // on what the other end may send, not a limit on anything real.
  return JSON.parse(await readBoundedResponseText(response, 4 * 1024 * 1024));
};

export const resolveOgsPlayer = async (username: string): Promise<OgsPlayer> => {
  const trimmed = username.trim();
  if (!trimmed) throw new Error('Enter an OGS username.');
  const payload = await fetchJson(
    `${OGS_API_BASE}/players/?username=${encodeURIComponent(trimmed)}`
  );
  const player = parseOgsPlayerSearch(payload, trimmed);
  if (!player) throw new Error(`No OGS player named "${trimmed}" was found.`);
  return player;
};

/**
 * Lists a player's most recently finished games, newest first, walking pages
 * until `limit` supported games are collected or the listing runs out.
 */
export const listOgsFinishedGames = async (
  playerId: number,
  limit: number
): Promise<OgsGameSummary[]> => {
  const games: OgsGameSummary[] = [];
  let url: string | null =
    `${OGS_API_BASE}/players/${playerId}/games/?ordering=-ended&page_size=50`;
  // "-ended" sorts games still in progress (null ended) first, so allow a few
  // pages of ongoing correspondence games before the finished ones appear.
  let pagesLeft = 10;
  while (url && games.length < limit && pagesLeft > 0) {
    pagesLeft -= 1;
    const payload = await fetchJson(url);
    games.push(...parseOgsGameList(payload));
    const next = asRecord(payload)?.next;
    url = typeof next === 'string' && next.startsWith('https://') ? next : null;
  }
  return games.slice(0, limit);
};

/**
 * Downloads the SGFs for `games`, skipping ids in `existingIds`. Games whose
 * SGF download fails are reported in `failed` without aborting the rest.
 */
export const downloadNewOgsGames = async (
  games: OgsGameSummary[],
  existingIds: Set<number>,
  onProgress?: (progress: OgsSyncProgress) => void,
  isCancelled?: () => boolean
): Promise<{ synced: OgsSyncedGame[]; skipped: number; failed: OgsGameSummary[] }> => {
  const fresh = games.filter((game) => !existingIds.has(game.id));
  const synced: OgsSyncedGame[] = [];
  const failed: OgsGameSummary[] = [];
  for (const game of fresh) {
    if (isCancelled?.()) break;
    onProgress?.({ downloaded: synced.length, total: fresh.length, current: game });
    try {
      const sgf = await downloadOgsSgf(String(game.id), { isCancelled });
      synced.push({ summary: game, sgf });
    } catch (error) {
      // A cancel is not a download failure; reporting it as one would tell the
      // reader their game was broken when they were the one who stopped.
      if (isOgsCancelledError(error)) break;
      failed.push(game);
    }
  }
  onProgress?.({ downloaded: synced.length, total: fresh.length, current: null });
  return { synced, skipped: games.length - fresh.length, failed };
};

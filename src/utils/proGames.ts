import { PRELOADED_GAMES } from '../data/preloadedGames';
import { PRO_GAME_CORPUS } from '../data/proGameCorpus';
import { parseSgf } from './sgf';
import { applyCapturesInPlace } from './gameLogic';
import type { BoardState, Player } from '../types';

export interface ProGameMeta {
  id: string;
  name: string;
  source: string;
  sgf: string;
  black: string;
  white: string;
  blackRank?: string;
  whiteRank?: string;
  event?: string;
  date?: string;
  result?: string;
  boardSize: number;
}

/** Read a single SGF property value from the root-node header. */
const readHeaderProp = (header: string, key: string): string | undefined => {
  const match = header.match(new RegExp(`(?:^|[;\\s])${key}\\[([^\\]]*)\\]`));
  return match ? match[1]!.trim() || undefined : undefined;
};

const parseProGameMeta = (game: { name: string; source: string; sgf: string }, index: number): ProGameMeta => {
  const firstMove = game.sgf.search(/;[BW]\[/);
  const header = firstMove >= 0 ? game.sgf.slice(0, firstMove) : game.sgf;
  const size = Number(readHeaderProp(header, 'SZ') ?? '19');
  return {
    id: `pro-${index}`,
    name: game.name,
    source: game.source,
    sgf: game.sgf,
    black: readHeaderProp(header, 'PB') ?? 'Black',
    white: readHeaderProp(header, 'PW') ?? 'White',
    blackRank: readHeaderProp(header, 'BR'),
    whiteRank: readHeaderProp(header, 'WR'),
    event: readHeaderProp(header, 'EV'),
    date: readHeaderProp(header, 'DT'),
    result: readHeaderProp(header, 'RE'),
    boardSize: Number.isFinite(size) ? size : 19,
  };
};

export const PRO_GAMES: ProGameMeta[] = [...PRELOADED_GAMES, ...PRO_GAME_CORPUS].map(parseProGameMeta);

/** Free-text filter across players, event, date, and result. */
export const filterProGames = (games: ProGameMeta[], query: string): ProGameMeta[] => {
  const q = query.trim().toLowerCase();
  if (!q) return games;
  return games.filter((g) =>
    [g.black, g.white, g.event, g.date, g.result, g.name].filter(Boolean).join(' ').toLowerCase().includes(q),
  );
};

/** Replay every move to produce the final board position (for previews). */
export const buildFinalBoard = (sgf: string): { board: BoardState; moveCount: number } => {
  const parsed = parseSgf(sgf);
  const board = parsed.initialBoard.map((row) => [...row]);
  for (const mv of parsed.moves) {
    if (mv.x < 0 || mv.y < 0) continue; // pass
    board[mv.y]![mv.x] = mv.player;
    applyCapturesInPlace(board, mv.x, mv.y, mv.player);
  }
  return { board, moveCount: parsed.moves.length };
};

// ---------------------------------------------------------------------------
// Aggregations powering the player-profile and opening-explorer views.
// These mirror the way database sites (Kifubara, GoGoD) let you browse a
// corpus by player, event, and opening rather than as a flat list.
// ---------------------------------------------------------------------------

export type WinnerColor = 'B' | 'W' | null;

/** Derive the winning colour from an SGF RE[] result string. */
export const winnerColor = (result?: string): WinnerColor => {
  if (!result) return null;
  const head = result.trim().charAt(0).toUpperCase();
  if (head === 'B') return 'B';
  if (head === 'W') return 'W';
  return null; // Draw / Void / Unknown
};

const isRealPlayer = (name: string): boolean =>
  name.length > 0 && name !== 'Black' && name !== 'White' && name.toLowerCase() !== 'unknown';

export interface PlayerProfile {
  name: string;
  games: ProGameMeta[];
  wins: number;
  losses: number;
  decided: number;
  asBlack: number;
  asWhite: number;
  ranks: string[];
  /** Opponent name -> games played against them, most frequent first. */
  opponents: { name: string; count: number }[];
  events: string[];
}

/** Group the corpus into per-player profiles, ordered by games played. */
export const buildPlayerProfiles = (games: ProGameMeta[]): PlayerProfile[] => {
  interface Acc extends Omit<PlayerProfile, 'opponents' | 'events' | 'ranks'> {
    opponentCounts: Map<string, number>;
    eventSet: Set<string>;
    rankSet: Set<string>;
  }
  const map = new Map<string, Acc>();
  const get = (name: string): Acc => {
    let p = map.get(name);
    if (!p) {
      p = {
        name,
        games: [],
        wins: 0,
        losses: 0,
        decided: 0,
        asBlack: 0,
        asWhite: 0,
        opponentCounts: new Map(),
        eventSet: new Set(),
        rankSet: new Set(),
      };
      map.set(name, p);
    }
    return p;
  };

  for (const g of games) {
    const wc = winnerColor(g.result);
    for (const color of ['B', 'W'] as const) {
      const name = color === 'B' ? g.black : g.white;
      if (!isRealPlayer(name)) continue;
      const p = get(name);
      p.games.push(g);
      if (color === 'B') p.asBlack += 1;
      else p.asWhite += 1;
      const opponent = color === 'B' ? g.white : g.black;
      if (isRealPlayer(opponent)) p.opponentCounts.set(opponent, (p.opponentCounts.get(opponent) ?? 0) + 1);
      if (g.event) p.eventSet.add(g.event);
      const rank = color === 'B' ? g.blackRank : g.whiteRank;
      if (rank) p.rankSet.add(rank);
      if (wc) {
        p.decided += 1;
        if (wc === color) p.wins += 1;
        else p.losses += 1;
      }
    }
  }

  return [...map.values()]
    .map(({ opponentCounts, eventSet, rankSet, ...rest }) => ({
      ...rest,
      opponents: [...opponentCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      events: [...eventSet].sort(),
      ranks: [...rankSet].sort(),
    }))
    .sort((a, b) => b.games.length - a.games.length || a.name.localeCompare(b.name));
};

export interface EventGroup {
  name: string;
  count: number;
}

/** Distinct events (tournaments) with game counts, most games first. */
export const buildEventGroups = (games: ProGameMeta[]): EventGroup[] => {
  const counts = new Map<string, number>();
  for (const g of games) {
    if (!g.event) continue;
    counts.set(g.event, (counts.get(g.event) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

export interface OpeningMove {
  x: number;
  y: number;
  player: Player;
}

/** First `maxMoves` non-pass moves of a game, used to index openings. */
export const getOpeningSequence = (sgf: string, maxMoves = 30): OpeningMove[] => {
  const parsed = parseSgf(sgf);
  const seq: OpeningMove[] = [];
  for (const mv of parsed.moves) {
    if (mv.x < 0 || mv.y < 0) continue; // skip passes
    seq.push({ x: mv.x, y: mv.y, player: mv.player });
    if (seq.length >= maxMoves) break;
  }
  return seq;
};

/** A game paired with its precomputed opening sequence, for the explorer. */
export interface IndexedGame {
  game: ProGameMeta;
  opening: OpeningMove[];
}

export const indexOpenings = (games: ProGameMeta[], maxMoves = 30): IndexedGame[] =>
  games
    .filter((g) => g.boardSize === 19)
    .map((game) => {
      try {
        return { game, opening: getOpeningSequence(game.sgf, maxMoves) };
      } catch {
        return { game, opening: [] as OpeningMove[] };
      }
    });

export interface OpeningContinuation {
  x: number;
  y: number;
  player: Player;
  count: number;
  games: ProGameMeta[];
}

const sameMove = (a: OpeningMove, b: { x: number; y: number }): boolean => a.x === b.x && a.y === b.y;

/**
 * Given a played `path`, return the distinct next moves across the corpus that
 * followed that exact sequence, with how many games chose each. This is the
 * core of an opening explorer.
 */
export const getOpeningContinuations = (
  indexed: IndexedGame[],
  path: { x: number; y: number }[],
): OpeningContinuation[] => {
  const buckets = new Map<string, OpeningContinuation>();
  for (const { game, opening } of indexed) {
    if (opening.length <= path.length) continue;
    let matches = true;
    for (let i = 0; i < path.length; i += 1) {
      if (!sameMove(opening[i]!, path[i]!)) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const next = opening[path.length]!;
    const key = `${next.x},${next.y}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { x: next.x, y: next.y, player: next.player, count: 0, games: [] };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.games.push(game);
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count);
};

/** Replay an explicit move list to a board position (for the opening explorer). */
export const buildBoardFromMoves = (moves: OpeningMove[], boardSize = 19): BoardState => {
  const board: BoardState = Array.from({ length: boardSize }, () => Array<Player | null>(boardSize).fill(null));
  for (const mv of moves) {
    board[mv.y]![mv.x] = mv.player;
    applyCapturesInPlace(board, mv.x, mv.y, mv.player);
  }
  return board;
};

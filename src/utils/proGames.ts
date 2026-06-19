import { PRELOADED_GAMES } from '../data/preloadedGames';
import { parseSgf } from './sgf';
import { applyCapturesInPlace } from './gameLogic';
import type { BoardState } from '../types';

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

export const PRO_GAMES: ProGameMeta[] = PRELOADED_GAMES.map(parseProGameMeta);

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

import { PRELOADED_GAMES } from '../data/preloadedGames';
import { parseSgf } from './sgf';
import { applyCapturesInPlace } from './gameLogic';
import type { BoardState } from '../types';
import { toSearchTerms } from './searchTerms';

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
  editorial?: string;
}

// Short editorial write-ups keyed by the preloaded game's name. Kept next to
// the catalog (rather than in the SGF) so they can be edited freely.
const PRO_GAME_EDITORIALS: Record<string, string> = {
  'Lee Sedol vs Hong Jansik - 3rd Korean KAT Cup (2003-04-23)':
    'A young Lee Sedol in the middle of his early-2000s breakout, when his ferocious fighting style was tearing through the Korean scene. Playing Black, he steers the game into complications and closes it out by resignation — a compact showcase of why the go world had started talking about him.',
  'Choi Cheolhan vs Lee Changho - 48th Korean Kuksu, title match #3 (2005-02-19)':
    'The marquee Korean rivalry of the mid-2000s: Choi Cheolhan, the young attacker nicknamed "the Viper", challenging Lee Changho, the calm endgame master who had ruled the previous decade. In this Kuksu title-match game Choi takes Black and forces a resignation — the new generation biting back.',
  'Cho Chikun vs O Rissei - 43rd Japanese Judan, title match #5 (2005-04-27)':
    'A deciding fifth game between two stalwarts of the Japanese title scene. Cho Chikun — holder of the all-time Japanese title record — grinds out a 5.5-point win with Black over O Rissei. A patient, counting-driven game that rewards studying the endgame move by move.',
  'Gu Li vs Lee Sedol - 10th LG Cup, semi-final (2005-10-19)':
    'One chapter of the defining rivalry of the decade. Gu Li and Lee Sedol met across every major international stage, and their games rarely stayed quiet for long. Here Gu Li takes Black in an LG Cup semi-final and wins by resignation — trademark head-on fighting from both.',
  'Lee Sedol vs Gu Li - 7th Chinese League A, round 20 (2005-12-10)':
    'The rematch, weeks later, with colors reversed: Lee Sedol takes Black in a Chinese League A round, and Gu Li answers with a resignation win as White. Compare it with their LG Cup meeting the same year to see how each adapts to the other.',
  'Choi Cheolhan vs Luo Xihe - 10th Samsung Cup, semi-final 3 (2005-12-16)':
    'The deciding third game of a Samsung Cup semi-final. Luo Xihe — renowned for raw reading strength and fearless ko fighting — beats Choi Cheolhan by 7.5 points as White, booking his place in the final he went on to win. Heavy, committed fighting from the opening on.',
  'Shin Jinseo vs Kang Yootaek - 2015 Korean League (2015-09-20)':
    'A curiosity from the Korean League: Shin Jinseo as a 15-year-old 3-dan, years before he became the world\'s top player. The record ends with a rare "Void" result — the game itself is a snapshot of a prodigy already playing well beyond his rank.',
};

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
    editorial: PRO_GAME_EDITORIALS[game.name],
  };
};

export const PRO_GAMES: ProGameMeta[] = PRELOADED_GAMES.map(parseProGameMeta);

const proGameSearchText = (game: ProGameMeta): string =>
  [game.black, game.white, game.event, game.date, game.result, game.name, game.editorial]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/**
 * Free-text filter across players, event, date, result, and editorial.
 *
 * Every whitespace-separated term has to appear somewhere, rather than the
 * whole query having to appear as one run of characters. Matching the phrase
 * meant "sedol 2005" found nothing, because the player and the date sit in
 * different fields and never end up adjacent.
 */
export const filterProGames = (games: ProGameMeta[], query: string): ProGameMeta[] => {
  const terms = toSearchTerms(query);
  if (terms.length === 0) return games;
  return games.filter((game) => {
    const haystack = proGameSearchText(game);
    return terms.every((term) => haystack.includes(term));
  });
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

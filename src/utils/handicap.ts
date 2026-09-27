import { handicapBonusForWhite } from './goRules';
import type { BoardState, GameNode, GameRules } from '../types';

/**
 * KataGo's handicap compensation, ported from `numHandicapStonesOnBoardHelper` and
 * `BoardHistory::computeWhiteHandicapBonus` (cpp/game/boardhistory.cpp) with the
 * per-ruleset `whiteHandicapBonusRule` from cpp/game/rules.cpp.
 *
 * Chinese rules compensate white for the stones black started with; Japanese and
 * Korean do not. The compensation is part of the komi as far as the network and the
 * scoring are concerned, which is why it has to reach the engine rather than only
 * the scoreboard.
 */

/**
 * The number of handicap stones the starting position shows. KataGo's analysis
 * engine reads this from the setup stones alone: it does not treat a run of black
 * moves at the start of a game as handicap unless told to, and this app always
 * places handicap as setup stones anyway.
 */
export function countHandicapStones(rootBoard: BoardState): number {
  let black = 0;
  let white = 0;
  for (const row of rootBoard) {
    for (const stone of row) {
      if (stone === 'black') black += 1;
      else if (stone === 'white') white += 1;
    }
  }
  // A position that starts with white stones on it is somebody's problem diagram,
  // not a handicap game.
  if (white !== 0) return 0;
  // One stone is just a normal opening move.
  if (black <= 1) return 0;
  return black;
}

/**
 * KataGo whiteHandicapBonusRule: `N` under Chinese rules, `N-1` under AGA,
 * `0` under Japanese. One table, in goRules, decides: this used to say
 * "Chinese or nothing" while the scorer read the table, so a 4-stone AGA game
 * was scored 3 points apart by the engine and by the app's own count.
 */
export function whiteHandicapBonus(rules: GameRules, handicapStones: number): number {
  return handicapBonusForWhite(rules, handicapStones);
}

/**
 * The handicap the file declares in `HA`, or null when it declares none (or
 * something that is not a count). HA[0] and HA[1] are declarations too: both
 * mean an even game with no compensation.
 */
export function declaredHandicap(properties: Record<string, string[]> | undefined): number | null {
  const raw = properties?.HA?.[0];
  if (raw === undefined) return null;
  const declared = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(declared) && declared >= 0 ? declared : null;
}

type RootLike = Pick<GameNode, 'properties'> & { gameState?: Pick<GameNode['gameState'], 'board'> };

/**
 * How many handicap stones the game gives Black: the one answer the engine's
 * komi, the scorer and the handicap AI all use. They used to ask different
 * questions -- the engine counted the stones on the root board, the scorer
 * read `HA` first -- so HA[0] with two black setup stones was scored as an
 * even game while the engine gave White two points for it.
 *
 * `HA` is the file's own answer and wins whenever it has one; below two it
 * means no handicap (HA[1] is an even game without komi). The stones may not
 * be on the root board at all -- Tygem and others put them in the first node --
 * so a declared handicap has to win over whatever setup is present.
 *
 * Without `HA` the count is read off the starting position the way KataGo
 * does (countHandicapStones): black stones alone, at least two of them.
 * White setup stones mean the position was arranged -- a tsumego, a pasted
 * diagram -- not handicapped.
 */
export function countRootHandicapStones(root: RootLike): number {
  const declared = declaredHandicap(root.properties);
  if (declared !== null) return declared >= 2 ? declared : 0;
  if (root.gameState?.board) return countHandicapStones(root.gameState.board);
  // A bare node without a position: fall back to its setup properties.
  const black = root.properties?.AB?.length ?? 0;
  const white = root.properties?.AW?.length ?? 0;
  return white === 0 && black >= 2 ? black : 0;
}

/**
 * The komi to hand the engine: the game's komi plus whatever the rules award white
 * for the handicap. Komi is counted in white's favour, so the bonus adds.
 */
export function komiWithHandicapBonus(root: RootLike, rules: GameRules, komi: number): number {
  return komi + whiteHandicapBonus(rules, countRootHandicapStones(root));
}

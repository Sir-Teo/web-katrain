import type { BoardState, GameRules } from '../types';

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

/** KataGo whiteHandicapBonusRule: `N` under Chinese rules, `0` under Japanese. */
export function whiteHandicapBonus(rules: GameRules, handicapStones: number): number {
  if (handicapStones <= 0) return 0;
  return rules === 'chinese' ? handicapStones : 0;
}

/**
 * The komi to hand the engine: the game's komi plus whatever the rules award white
 * for the handicap. Komi is counted in white's favour, so the bonus adds.
 */
export function komiWithHandicapBonus(rootBoard: BoardState, rules: GameRules, komi: number): number {
  return komi + whiteHandicapBonus(rules, countHandicapStones(rootBoard));
}

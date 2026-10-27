import { handicapBonusForWhite, rulesOf } from './goRules';
import type { BoardState, GameRules, Move } from '../types';

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
 * KataGo's initial Black turn advantage: isolated White passes do not end
 * placement, while consecutive White turns indicate an arranged position.
 */
export function countStartingBlackHandicapMoves(moves: readonly Move[]): number {
  let count = 0;
  for (let index = 0; index < moves.length; index++) {
    const move = moves[index]!;
    if (move.player === 'white') {
      if (moves[index + 1]?.player === 'white') return 0;
      if (move.x < 0 || move.y < 0) continue;
      break;
    }
    if (move.x >= 0 && move.y >= 0) count++;
  }
  return count;
}

/** Count setup stones and, when supplied, the position's starting move history. */
export function countHandicapStones(rootBoard: BoardState, moves: readonly Move[] = []): number {
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
  const total = black + countStartingBlackHandicapMoves(moves);
  // One stone is just a normal opening move.
  return total > 1 ? total : 0;
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
 * The komi to hand the engine: the game's komi plus whatever the rules award white
 * for the handicap. Komi is counted in white's favour, so the bonus adds.
 */
export function komiWithHandicapBonus(rootBoard: BoardState, rules: GameRules, komi: number, moves: readonly Move[] = []): number {
  if (rulesOf(rules).handicapBonus === 'zero') return komi;
  return komi + whiteHandicapBonus(rules, countHandicapStones(rootBoard, moves));
}

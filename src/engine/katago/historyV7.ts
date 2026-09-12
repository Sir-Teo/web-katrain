import type { GameRules, Player } from '../../types';
import { rulesOf } from '../../utils/goRules';
import { PASS_MOVE } from './fastBoard';
import type { RecentMove } from './featuresV7Fast';

export type HistoryFeaturesV7 = {
  turnsIncluded: number;
  passWouldEndPhase: boolean;
};

/** KataGo v7 history for ordinary consecutive-pass endings with encore disabled.
 * Move planes, pass globals, and previous ladder positions must use the same cap.
 * A repeated-position (Spight-like) ending needs board history beyond these moves;
 * this function does not infer that condition from a five-move tail.
 */
export function historyFeaturesV7(args: {
  recentMoves: readonly RecentMove[];
  currentPlayer: Player;
  rules: GameRules;
  conservativePassAndIsRoot?: boolean;
  enablePassingHacks?: boolean;
  maxHistory?: number;
  areaMap?: Uint8Array;
  /** Komi including draw adjustment, signed for the player to move. */
  selfKomi?: number;
}): HistoryFeaturesV7 {
  const { recentMoves, currentPlayer } = args;
  const rules = rulesOf(args.rules);
  const last = recentMoves.length - 1;
  const afterPass = recentMoves[last]?.move === PASS_MOVE;
  const afterTwoPasses = afterPass && recentMoves[last - 1]?.move === PASS_MOVE;
  const passWouldEndGame = rules.scoring === 'area' && afterPass;
  let losingOrDraw = false;
  if (passWouldEndGame && args.enablePassingHacks && args.areaMap) {
    const own = currentPlayer === 'black' ? 1 : 2;
    const opponent = 3 - own;
    let score = args.selfKomi ?? 0;
    for (const point of args.areaMap) score += point === own ? 1 : point === opponent ? -1 : 0;
    losingOrDraw = score <= 0;
  }
  const suppress = passWouldEndGame && (args.conservativePassAndIsRoot === true
    || (rules.friendlyPassOk && !afterTwoPasses) || losingOrDraw);
  if (suppress) return { turnsIncluded: 0, passWouldEndPhase: false };

  let cap = Math.max(0, Math.min(5, args.maxHistory ?? 5));
  // After an ending, retain its final pass and only the moves played since it.
  // Five recent moves suffice: any earlier boundary cannot lower a five-move cap.
  for (let offset = 0; offset < cap && last - offset > 0; offset++) {
    if (recentMoves[last - offset]!.move === PASS_MOVE && recentMoves[last - offset - 1]!.move === PASS_MOVE) {
      cap = Math.min(cap, offset + 1);
      break;
    }
  }
  let turnsIncluded = 0;
  let expected: Player = currentPlayer === 'black' ? 'white' : 'black';
  for (let offset = 0; offset < cap; offset++) {
    const move = recentMoves[last - offset];
    if (!move || move.player !== expected) break;
    turnsIncluded++;
    expected = expected === 'black' ? 'white' : 'black';
  }
  return { turnsIncluded, passWouldEndPhase: afterPass };
}

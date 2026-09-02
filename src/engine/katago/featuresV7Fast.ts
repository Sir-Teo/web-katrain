import type { GameRules, Player } from '../../types';
import { getOpponent } from '../../utils/gameLogic';
import { areaFeatureModeForRules, rulesOf } from '../../utils/goRules';
import { BLACK, WHITE, EMPTY, PASS_MOVE, BOARD_SIZE, computeLibertyMap, computeAreaMapV7KataGo, computeIndependentLifeArea, type StoneColor } from './fastBoard';

const INPUT_SPATIAL_CHANNELS_V7 = 22;
// KataGo NNPos::KOMI_CLIP_RADIUS.
const KOMI_CLIP_RADIUS = 20;
const INPUT_GLOBAL_CHANNELS_V7 = 19;

export type KataGoInputsV7 = {
  spatial: Float32Array; // [19,19,22] NHWC
  global: Float32Array; // [19]
};

export type RecentMove = {
  move: number; // 0..360 or PASS_MOVE
  player: Player;
};

const idxNHWC = (x: number, y: number, c: number) => ((y * BOARD_SIZE + x) * INPUT_SPATIAL_CHANNELS_V7 + c);

function playerToColor(p: Player): StoneColor {
  return p === 'black' ? BLACK : WHITE;
}

export function fillInputsV7Fast(args: {
  stones: Uint8Array; // 0 empty, 1 black, 2 white
  koPoint: number; // 0..360 or -1
  currentPlayer: Player;
  recentMoves: RecentMove[]; // chronological order, last item is most recent
  komi: number;
  rules?: GameRules;
  conservativePassAndIsRoot?: boolean;
  /**
   * KataGo MiscNNInputParams::maxHistory: how many of the recent moves may reach the
   * history planes. Defaults to KataGo's cap of 5. It does not hide the fact that a
   * pass would end the phase, which KataGo reads from the real history either way.
   */
  maxHistory?: number;
  /**
   * KataGo enablePassingHacks, on by default for its analysis and GTP setups: when a
   * pass would end the game and ending it now would not be a win, tell the net that
   * passing does not end anything, so it looks for a better result than conceding.
   * Only area scoring can price the board that way without agreeing dead stones.
   */
  enablePassingHacks?: boolean;
  /**
   * KataGo drawEquivalentWinsForWhite: what a draw is worth to white, folded into
   * the komi the net is shown. Defaults to KataGo's own 0.5, at which it does
   * nothing; it only bites on a komi that could produce a jigo in the first place.
   */
  drawEquivalentWinsForWhite?: number;
  /** Signed for the side to move; 0 disables the feature. */
  playoutDoublingAdvantage?: number;
  libertyMap?: Uint8Array; // per-point liberties capped to 3, for stones only
  areaMap?: Uint8Array; // KataGo-style area map for planes 18/19
  ladderedStones?: Uint8Array; // V7 plane 14, 1 where stones are ladder-capturable
  prevLadderedStones?: Uint8Array; // V7 plane 15
  prevPrevLadderedStones?: Uint8Array; // V7 plane 16
  ladderWorkingMoves?: Uint8Array; // V7 plane 17, 1 where moves are ladder-capturing
  outSpatial: Float32Array; // len 19*19*22
  outGlobal: Float32Array; // len 19
}): void {
  const { stones, koPoint, currentPlayer, recentMoves, komi } = args;
  const rules: GameRules = args.rules ?? 'japanese';
  const playoutDoublingAdvantage = args.playoutDoublingAdvantage ?? 0;
  const pla = currentPlayer;
  const opp = getOpponent(pla);
  const plaColor = playerToColor(pla);
  const oppColor = playerToColor(opp);

  const spatial = args.outSpatial;
  const global = args.outGlobal;
  spatial.fill(0);
  global.fill(0);

  for (let pos = 0; pos < BOARD_SIZE * BOARD_SIZE; pos++) spatial[pos * INPUT_SPATIAL_CHANNELS_V7 + 0] = 1.0;

  if (koPoint >= 0 && koPoint < BOARD_SIZE * BOARD_SIZE) {
    const x = koPoint % BOARD_SIZE;
    const y = (koPoint / BOARD_SIZE) | 0;
    spatial[idxNHWC(x, y, 6)] = 1.0;
  }

  const libs = args.libertyMap ?? computeLibertyMap(stones);

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const pos = y * BOARD_SIZE + x;
      const v = stones[pos] as StoneColor;
      if (v === EMPTY) continue;
      if (v === plaColor) spatial[idxNHWC(x, y, 1)] = 1.0;
      else if (v === oppColor) spatial[idxNHWC(x, y, 2)] = 1.0;

      const l = libs[pos]!;
      if (l === 1) spatial[idxNHWC(x, y, 3)] = 1.0;
      else if (l === 2) spatial[idxNHWC(x, y, 4)] = 1.0;
      else if (l === 3) spatial[idxNHWC(x, y, 5)] = 1.0;
    }
  }

  if (args.ladderedStones || args.prevLadderedStones || args.prevPrevLadderedStones || args.ladderWorkingMoves) {
    const l0 = args.ladderedStones;
    const l1 = args.prevLadderedStones;
    const l2 = args.prevPrevLadderedStones;
    const lm = args.ladderWorkingMoves;

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const pos = y * BOARD_SIZE + x;
        if (l0 && l0[pos]) spatial[idxNHWC(x, y, 14)] = 1.0;
        if (l1 && l1[pos]) spatial[idxNHWC(x, y, 15)] = 1.0;
        if (l2 && l2[pos]) spatial[idxNHWC(x, y, 16)] = 1.0;
        if (lm && lm[pos]) spatial[idxNHWC(x, y, 17)] = 1.0;
      }
    }
  }

  // KataGo BoardHistory::whiteKomiAdjustmentForDraws: the draw utility is folded
  // into the komi, so a komi that can produce a jigo is shifted by how much a draw
  // is worth. At the default of 0.5 -- a draw being half a win -- this is zero.
  const drawEquivalentWinsForWhite = args.drawEquivalentWinsForWhite ?? 0.5;
  // Rules::gameResultWillBeInteger, with hasButton false for every ruleset here.
  const gameResultWillBeInteger = Math.trunc(komi) === komi;
  const drawAdjustment = gameResultWillBeInteger ? drawEquivalentWinsForWhite - 0.5 : 0;
  const whiteKomiAdjusted = komi + drawAdjustment;
  const selfKomi = pla === 'white' ? whiteKomiAdjusted : -whiteKomiAdjusted;

  // KataGo counts the score this feature implies while it fills it in, so that the
  // passing hacks below can ask whether ending the game right now would be a win.
  // Note it uses the unclamped komi here, and the clamped one for the komi plane.
  const areaMode = areaFeatureModeForRules(rules);
  const hasAreaFeature = areaMode !== 'none';
  let boardScoreForPla = 0;
  if (hasAreaFeature) {
    // Callers pass the map in; the fallback keeps this usable standalone.
    const area =
      args.areaMap ??
      (areaMode === 'independent-life'
        ? computeIndependentLifeArea(stones, { keepStones: true }).area
        : computeAreaMapV7KataGo(stones));
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const pos = y * BOARD_SIZE + x;
        const v = area[pos] as StoneColor;
        if (v === plaColor) {
          spatial[idxNHWC(x, y, 18)] = 1.0;
          boardScoreForPla += 1;
        } else if (v === oppColor) {
          spatial[idxNHWC(x, y, 19)] = 1.0;
          boardScoreForPla -= 1;
        }
      }
    }
  }
  const finalPhaseAndGameEndWouldNotBeWin = hasAreaFeature && boardScoreForPla + selfKomi <= 0;

  // If a pass now would end the game, KataGo sometimes tells the net it would not:
  // at the root under conservativePass, and anywhere under enablePassingHacks when
  // the player to move is not winning, so that a losing side keeps looking rather
  // than settling for the score it would concede by passing. Both the history
  // features and the passWouldEndPhase global are suppressed together.
  const lastMove = recentMoves.length > 0 ? recentMoves[recentMoves.length - 1] : null;
  const passWouldEndGame = lastMove?.move === PASS_MOVE;
  // KataGo BoardHistory::shouldSuppressEndGameFromFriendlyPass: under area scoring
  // where passing is friendly -- which is every area ruleset KataGo ships, Chinese
  // included -- a pass that would end the game is hidden from the net at every node,
  // not just at the root. Territory rules set friendlyPassOk false and are untouched.
  const friendlyPassOk = rules === 'chinese';
  const suppressFromFriendlyPass = friendlyPassOk && hasAreaFeature && passWouldEndGame;
  const suppressHistory =
    passWouldEndGame &&
    (args.conservativePassAndIsRoot === true ||
      suppressFromFriendlyPass ||
      (args.enablePassingHacks === true && finalPhaseAndGameEndWouldNotBeWin));

  const historyPlanes = [9, 10, 11, 12, 13] as const;
  const passGlobals = [0, 1, 2, 3, 4] as const;
  const expectedPlayers: Player[] = [opp, pla, opp, pla, opp];
  const maxTurnsOfHistoryToInclude = Math.max(0, Math.min(5, args.maxHistory ?? 5));
  if (!suppressHistory) {
    for (let i = 0; i < maxTurnsOfHistoryToInclude; i++) {
      const m = recentMoves[recentMoves.length - 1 - i];
      if (!m) break;
      if (m.player !== expectedPlayers[i]) break;
      if (m.move === PASS_MOVE) {
        global[passGlobals[i]] = 1.0;
      } else {
        const x = m.move % BOARD_SIZE;
        const y = (m.move / BOARD_SIZE) | 0;
        spatial[idxNHWC(x, y, historyPlanes[i])] = 1.0;
      }
    }
  }

  // KataGo bounds the komi it shows the net, and uses the bounded value for the
  // parity wave below as well (NNPos::KOMI_CLIP_RADIUS).
  const komiClipBound = BOARD_SIZE * BOARD_SIZE + KOMI_CLIP_RADIUS;
  const clampedSelfKomi = Math.max(-komiClipBound, Math.min(komiClipBound, selfKomi));
  global[5] = clampedSelfKomi / 20.0;

  // KataGo fillRowV7 rule inputs, straight from the ruleset table.
  const ruleset = rulesOf(rules);
  if (ruleset.ko === 'positional') {
    global[6] = 1.0;
    global[7] = 0.5;
  } else if (ruleset.ko === 'situational') {
    global[6] = 1.0;
    global[7] = -0.5;
  }
  if (ruleset.multiStoneSuicideLegal) global[8] = 1.0;
  if (ruleset.scoring === 'territory') global[9] = 1.0;
  if (ruleset.tax === 'seki') {
    global[10] = 1.0;
  } else if (ruleset.tax === 'all') {
    global[10] = 1.0;
    global[11] = 1.0;
  }
  if (ruleset.hasButton) global[17] = 1.0;

  global[14] = !suppressHistory && passWouldEndGame ? 1.0 : 0.0;

  // KataGo fillRowV7: playoutDoublingAdvantage, already signed for the side to
  // move. Tells the net to evaluate as if this side had that many doublings of
  // search over the opponent.
  if (playoutDoublingAdvantage !== 0) {
    global[15] = 1.0;
    global[16] = 0.5 * playoutDoublingAdvantage;
  }

  // KataGo applies the komi parity wave under any area scoring.
  if (ruleset.scoring === 'area') {
    const boardAreaIsEven = (BOARD_SIZE * BOARD_SIZE) % 2 === 0;
    const drawableKomisAreEven = boardAreaIsEven;

    let komiFloor: number;
    if (drawableKomisAreEven) komiFloor = Math.floor(clampedSelfKomi / 2.0) * 2.0;
    else komiFloor = Math.floor((clampedSelfKomi - 1.0) / 2.0) * 2.0 + 1.0;

    let delta = clampedSelfKomi - komiFloor;
    if (delta < 0.0) delta = 0.0;
    if (delta > 2.0) delta = 2.0;

    let wave: number;
    if (delta < 0.5) wave = delta;
    else if (delta < 1.5) wave = 1.0 - delta;
    else wave = delta - 2.0;
    global[18] = wave;
  }
}

export function extractInputsV7Fast(args: {
  stones: Uint8Array; // 0 empty, 1 black, 2 white
  koPoint: number; // 0..360 or -1
  currentPlayer: Player;
  recentMoves: RecentMove[]; // chronological order, last item is most recent
  komi: number;
  rules?: GameRules;
  conservativePassAndIsRoot?: boolean;
  /**
   * KataGo MiscNNInputParams::maxHistory: how many of the recent moves may reach the
   * history planes. Defaults to KataGo's cap of 5. It does not hide the fact that a
   * pass would end the phase, which KataGo reads from the real history either way.
   */
  maxHistory?: number;
  /**
   * KataGo enablePassingHacks, on by default for its analysis and GTP setups: when a
   * pass would end the game and ending it now would not be a win, tell the net that
   * passing does not end anything, so it looks for a better result than conceding.
   * Only area scoring can price the board that way without agreeing dead stones.
   */
  enablePassingHacks?: boolean;
  /**
   * KataGo drawEquivalentWinsForWhite: what a draw is worth to white, folded into
   * the komi the net is shown. Defaults to KataGo's own 0.5, at which it does
   * nothing; it only bites on a komi that could produce a jigo in the first place.
   */
  drawEquivalentWinsForWhite?: number;
  /** Signed for the side to move; 0 disables the feature. */
  playoutDoublingAdvantage?: number;
  libertyMap?: Uint8Array; // per-point liberties capped to 3, for stones only
  areaMap?: Uint8Array; // KataGo-style area map for planes 18/19
  ladderedStones?: Uint8Array; // V7 plane 14, 1 where stones are ladder-capturable
  prevLadderedStones?: Uint8Array; // V7 plane 15
  prevPrevLadderedStones?: Uint8Array; // V7 plane 16
  ladderWorkingMoves?: Uint8Array; // V7 plane 17, 1 where moves are ladder-capturing
}): KataGoInputsV7 {
  const spatial = new Float32Array(BOARD_SIZE * BOARD_SIZE * INPUT_SPATIAL_CHANNELS_V7);
  const global = new Float32Array(INPUT_GLOBAL_CHANNELS_V7);
  fillInputsV7Fast({ ...args, outSpatial: spatial, outGlobal: global });
  return { spatial, global };
}

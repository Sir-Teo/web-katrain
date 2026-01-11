import { BOARD_SIZE, type GameRules, type Player } from '../../types';
import { getOpponent } from '../../utils/gameLogic';
import { BLACK, WHITE, EMPTY, PASS_MOVE, computeLibertyMap, computeAreaMapV7KataGo, type StoneColor } from './fastBoard';

const INPUT_SPATIAL_CHANNELS_V7 = 22;
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

export function extractInputsV7Fast(args: {
  stones: Uint8Array; // 0 empty, 1 black, 2 white
  koPoint: number; // 0..360 or -1
  currentPlayer: Player;
  recentMoves: RecentMove[]; // chronological order, last item is most recent
  komi: number;
  rules?: GameRules;
  libertyMap?: Uint8Array; // per-point liberties capped to 3, for stones only
  areaMap?: Uint8Array; // KataGo-style area map for planes 18/19
  ladderedStones?: Uint8Array; // V7 plane 14, 1 where stones are ladder-capturable
  prevLadderedStones?: Uint8Array; // V7 plane 15
  prevPrevLadderedStones?: Uint8Array; // V7 plane 16
  ladderWorkingMoves?: Uint8Array; // V7 plane 17, 1 where moves are ladder-capturing
}): KataGoInputsV7 {
  const { stones, koPoint, currentPlayer, recentMoves, komi } = args;
  const rules: GameRules = args.rules ?? 'japanese';
  const pla = currentPlayer;
  const opp = getOpponent(pla);
  const plaColor = playerToColor(pla);
  const oppColor = playerToColor(opp);

  const spatial = new Float32Array(BOARD_SIZE * BOARD_SIZE * INPUT_SPATIAL_CHANNELS_V7);
  const global = new Float32Array(INPUT_GLOBAL_CHANNELS_V7);

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      spatial[idxNHWC(x, y, 0)] = 1.0;
    }
  }

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

  if (rules === 'chinese') {
    const area = args.areaMap ?? computeAreaMapV7KataGo(stones);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const pos = y * BOARD_SIZE + x;
        const v = area[pos] as StoneColor;
        if (v === plaColor) spatial[idxNHWC(x, y, 18)] = 1.0;
        else if (v === oppColor) spatial[idxNHWC(x, y, 19)] = 1.0;
      }
    }
  }

  const historyPlanes = [9, 10, 11, 12, 13] as const;
  const passGlobals = [0, 1, 2, 3, 4] as const;
  const expectedPlayers: Player[] = [opp, pla, opp, pla, opp];
  for (let i = 0; i < 5; i++) {
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

  const selfKomi = pla === 'white' ? komi : -komi;
  global[5] = selfKomi / 20.0;

  if (rules === 'japanese') {
    // KataGo "Japanese": territory scoring + seki tax.
    global[9] = 1.0; // scoring: territory
    global[10] = 1.0; // tax: seki
  }

  const lastMove = recentMoves.length > 0 ? recentMoves[recentMoves.length - 1] : null;
  global[14] = lastMove && lastMove.move === PASS_MOVE ? 1.0 : 0.0;

  if (rules === 'chinese') {
    const boardAreaIsEven = (BOARD_SIZE * BOARD_SIZE) % 2 === 0;
    const drawableKomisAreEven = boardAreaIsEven;

    let komiFloor: number;
    if (drawableKomisAreEven) komiFloor = Math.floor(selfKomi / 2.0) * 2.0;
    else komiFloor = Math.floor((selfKomi - 1.0) / 2.0) * 2.0 + 1.0;

    let delta = selfKomi - komiFloor;
    if (delta < 0.0) delta = 0.0;
    if (delta > 2.0) delta = 2.0;

    let wave: number;
    if (delta < 0.5) wave = delta;
    else if (delta < 1.5) wave = 1.0 - delta;
    else wave = delta - 2.0;
    global[18] = wave;
  }

  return { spatial, global };
}

import type { BoardState, GameRules, Move, Player } from '../../types';
import { BOARD_SIZE } from './fastBoard';
import { getOpponent } from '../../utils/gameLogic';
import { rulesOf } from '../../utils/goRules';

const INPUT_SPATIAL_CHANNELS_V7 = 22;
const INPUT_GLOBAL_CHANNELS_V7 = 19;

export type KataGoInputsV7 = {
  spatial: Float32Array; // [19,19,22] NHWC
  global: Float32Array; // [19]
};

export type KataGoInputsV7Scratch = {
  // 0 empty, 1 black, 2 white.
  stones: Uint8Array;
  visited: Uint8Array;
  libertyMarked: Uint8Array;
  stack: number[];
  group: number[];
  touchedLibs: number[];
};

export function createKataGoInputsV7Scratch(): KataGoInputsV7Scratch {
  const n = BOARD_SIZE * BOARD_SIZE;
  return {
    stones: new Uint8Array(n),
    visited: new Uint8Array(n),
    libertyMarked: new Uint8Array(n),
    stack: [],
    group: [],
    touchedLibs: [],
  };
}

const idxNHWC = (x: number, y: number, c: number) => ((y * BOARD_SIZE + x) * INPUT_SPATIAL_CHANNELS_V7 + c);

export function fillInputsV7(args: {
  board: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  rules?: GameRules;
  conservativePassAndIsRoot?: boolean;
  /** Signed for the side to move; 0 disables the feature. */
  playoutDoublingAdvantage?: number;
  outSpatial: Float32Array; // len 19*19*22
  outGlobal: Float32Array; // len 19
  scratch?: KataGoInputsV7Scratch;
}): void {
  const { board, currentPlayer, moveHistory, komi } = args;
  const rules: GameRules = args.rules ?? 'japanese';
  const pla = currentPlayer;
  const opp = getOpponent(pla);

  const spatial = args.outSpatial;
  const global = args.outGlobal;
  spatial.fill(0);
  global.fill(0);

  // 0: on board
  for (let pos = 0; pos < BOARD_SIZE * BOARD_SIZE; pos++) spatial[pos * INPUT_SPATIAL_CHANNELS_V7 + 0] = 1.0;

  // Stone planes + build compact board representation for liberty computation.
  // 0 empty, 1 black, 2 white.
  const scratch = args.scratch ?? createKataGoInputsV7Scratch();
  const stones = scratch.stones;
  stones.fill(0);
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const v = board[y][x];
      if (v === null) continue;
      stones[y * BOARD_SIZE + x] = v === 'black' ? 1 : 2;
      if (v === pla) spatial[idxNHWC(x, y, 1)] = 1.0;
      else spatial[idxNHWC(x, y, 2)] = 1.0;
    }
  }

  // Liberty planes 3,4,5 - 1,2,3 liberties (for either color stones).
  const visited = scratch.visited;
  const libertyMarked = scratch.libertyMarked;
  const stack = scratch.stack;
  const group = scratch.group;
  const touchedLibs = scratch.touchedLibs;
  visited.fill(0);
  libertyMarked.fill(0);

  for (let pos = 0; pos < stones.length; pos++) {
    const color = stones[pos];
    if (color === 0) continue;
    if (visited[pos]) continue;

    visited[pos] = 1;
    stack.length = 0;
    group.length = 0;
    touchedLibs.length = 0;
    stack.push(pos);
    group.push(pos);

    let liberties = 0;

    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % BOARD_SIZE;
      const y = (p / BOARD_SIZE) | 0;

      if (x + 1 < BOARD_SIZE) {
        const npos = p + 1;
        const ncolor = stones[npos];
        if (ncolor === 0) {
          if (!libertyMarked[npos]) {
            libertyMarked[npos] = 1;
            touchedLibs.push(npos);
            liberties++;
          }
        } else if (ncolor === color && !visited[npos]) {
          visited[npos] = 1;
          stack.push(npos);
          group.push(npos);
        }
      }
      if (x > 0) {
        const npos = p - 1;
        const ncolor = stones[npos];
        if (ncolor === 0) {
          if (!libertyMarked[npos]) {
            libertyMarked[npos] = 1;
            touchedLibs.push(npos);
            liberties++;
          }
        } else if (ncolor === color && !visited[npos]) {
          visited[npos] = 1;
          stack.push(npos);
          group.push(npos);
        }
      }
      if (y + 1 < BOARD_SIZE) {
        const npos = p + BOARD_SIZE;
        const ncolor = stones[npos];
        if (ncolor === 0) {
          if (!libertyMarked[npos]) {
            libertyMarked[npos] = 1;
            touchedLibs.push(npos);
            liberties++;
          }
        } else if (ncolor === color && !visited[npos]) {
          visited[npos] = 1;
          stack.push(npos);
          group.push(npos);
        }
      }
      if (y > 0) {
        const npos = p - BOARD_SIZE;
        const ncolor = stones[npos];
        if (ncolor === 0) {
          if (!libertyMarked[npos]) {
            libertyMarked[npos] = 1;
            touchedLibs.push(npos);
            liberties++;
          }
        } else if (ncolor === color && !visited[npos]) {
          visited[npos] = 1;
          stack.push(npos);
          group.push(npos);
        }
      }
    }

    for (const npos of touchedLibs) libertyMarked[npos] = 0;

    const plane = liberties === 1 ? 3 : liberties === 2 ? 4 : liberties === 3 ? 5 : -1;
    if (plane >= 0) {
      for (const gpos of group) {
        const gx = gpos % BOARD_SIZE;
        const gy = (gpos / BOARD_SIZE) | 0;
        spatial[idxNHWC(gx, gy, plane)] = 1.0;
      }
    }
  }

  const lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
  const passWouldEndGame = !!lastMove && (lastMove.x === -1 || lastMove.y === -1);
  const suppressHistory = args.conservativePassAndIsRoot === true && passWouldEndGame;

  // History planes 9-13 and pass globals 0-4.
  // Match KataGo v7 behavior: only include if players alternate correctly from perspective of current player.
  const historyPlanes = [9, 10, 11, 12, 13] as const;
  const passGlobals = [0, 1, 2, 3, 4] as const;
  const expectedPlayers: Player[] = [opp, pla, opp, pla, opp];
  if (!suppressHistory) {
    for (let i = 0; i < 5; i++) {
      const m = moveHistory[moveHistory.length - 1 - i];
      if (!m) break;
      if (m.player !== expectedPlayers[i]) break;
      if (m.x === -1 || m.y === -1) {
        global[passGlobals[i]] = 1.0;
      } else {
        spatial[idxNHWC(m.x, m.y, historyPlanes[i])] = 1.0;
      }
    }
  }

  // Global features.
  const selfKomi = pla === 'white' ? komi : -komi;
  global[5] = selfKomi / 20.0;

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

  // passWouldEndPhase: in simple rules, if previous move was pass, another pass ends the game.
  // KataGo conservativePassAndIsRoot suppresses this signal at the root.
  global[14] = !suppressHistory && passWouldEndGame ? 1.0 : 0.0;

  // KataGo fillRowV7: playoutDoublingAdvantage, already signed for the side to move.
  const playoutDoublingAdvantage = args.playoutDoublingAdvantage ?? 0;
  if (playoutDoublingAdvantage !== 0) {
    global[15] = 1.0;
    global[16] = 0.5 * playoutDoublingAdvantage;
  }

  // KataGo applies the komi parity wave under any area scoring.
  if (ruleset.scoring === 'area') {
    // Komi parity wave (area scoring, 19x19).
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
}

export function extractInputsV7(args: {
  board: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  rules?: GameRules;
  conservativePassAndIsRoot?: boolean;
  playoutDoublingAdvantage?: number;
}): KataGoInputsV7 {
  const spatial = new Float32Array(BOARD_SIZE * BOARD_SIZE * INPUT_SPATIAL_CHANNELS_V7);
  const global = new Float32Array(INPUT_GLOBAL_CHANNELS_V7);
  fillInputsV7({ ...args, outSpatial: spatial, outGlobal: global });
  return { spatial, global };
}

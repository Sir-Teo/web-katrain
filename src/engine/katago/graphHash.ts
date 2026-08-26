import { BOARD_AREA, EMPTY, NEIGHBOR_COUNTS, NEIGHBOR_LIST, NEIGHBOR_STARTS, PASS_MOVE, type StoneColor } from './fastBoard';

/**
 * Position hashing for graph search, ported from cpp/game/graphhash.cpp and
 * `Board::simpleRepetitionBoundGt` (cpp/game/board.cpp).
 *
 * The idea is KataGo's: a position whose last move could not possibly be part of a
 * short repetition gets a hash that depends on the position alone, so two move
 * orders reaching it share a node. A position that could repeat instead mixes in
 * the hash of the path that reached it, so cycles can never close.
 *
 * The hash values themselves are not bit-for-bit KataGo's -- they are internal, and
 * only which positions collide matters. Rules and komi are left out because they
 * are fixed for the length of a search. Superko bans are left out too, because this
 * port only tracks the simple ko point and so cannot tell those positions apart in
 * the first place.
 */

/** KataGo graphSearchRepBound. */
export const GRAPH_SEARCH_REP_BOUND = 11;

let zobristBoardArea = -1;
let ZOBRIST_STONE_0 = new Int32Array(0);
let ZOBRIST_STONE_1 = new Int32Array(0);
let ZOBRIST_KO_0 = new Int32Array(0);
let ZOBRIST_KO_1 = new Int32Array(0);
const ZOBRIST_PLAYER_0 = new Int32Array(3);
const ZOBRIST_PLAYER_1 = new Int32Array(3);

/** xorshift128, so the tables are the same on every machine and every run. */
function makeRandom(): () => number {
  let x = 0x9e3779b9;
  let y = 0x243f6a88;
  let z = 0xb7e15162;
  let w = 0x85ebca6b;
  return () => {
    const t = x ^ (x << 11);
    x = y;
    y = z;
    z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) | 0;
    return w;
  };
}

function ensureZobrist(): void {
  if (zobristBoardArea === BOARD_AREA) return;
  zobristBoardArea = BOARD_AREA;
  const random = makeRandom();
  const stoneCount = BOARD_AREA * 3;
  ZOBRIST_STONE_0 = new Int32Array(stoneCount);
  ZOBRIST_STONE_1 = new Int32Array(stoneCount);
  for (let i = 0; i < stoneCount; i++) {
    ZOBRIST_STONE_0[i] = random();
    ZOBRIST_STONE_1[i] = random();
  }
  // One extra entry for "no ko point".
  ZOBRIST_KO_0 = new Int32Array(BOARD_AREA + 1);
  ZOBRIST_KO_1 = new Int32Array(BOARD_AREA + 1);
  for (let i = 0; i <= BOARD_AREA; i++) {
    ZOBRIST_KO_0[i] = random();
    ZOBRIST_KO_1[i] = random();
  }
  for (let i = 0; i < 3; i++) {
    ZOBRIST_PLAYER_0[i] = random();
    ZOBRIST_PLAYER_1[i] = random();
  }
}

/**
 * KataGo GraphHash::getStateHash: everything that decides what is legal here and
 * what passing would do. Writes the two halves into `out`.
 */
export function computeStateHash(
  stones: Uint8Array,
  koPoint: number,
  playerToMove: StoneColor,
  consecutiveEndingPasses: number,
  out: Int32Array
): void {
  ensureZobrist();
  let h0 = 0;
  let h1 = 0;
  for (let p = 0; p < BOARD_AREA; p++) {
    const color = stones[p]!;
    if (color === EMPTY) continue;
    const idx = p * 3 + color;
    h0 ^= ZOBRIST_STONE_0[idx]!;
    h1 ^= ZOBRIST_STONE_1[idx]!;
  }
  const koIdx = koPoint >= 0 && koPoint < BOARD_AREA ? koPoint : BOARD_AREA;
  h0 ^= ZOBRIST_KO_0[koIdx]!;
  h1 ^= ZOBRIST_KO_1[koIdx]!;
  h0 ^= ZOBRIST_PLAYER_0[playerToMove]!;
  h1 ^= ZOBRIST_PLAYER_1[playerToMove]!;
  // KataGo folds the consecutive pass count in with a plain LCG step. That count
  // also decides passWouldEndPhase and whether the game is already over, which
  // KataGo folds in separately; here they are functions of it.
  const passes = consecutiveEndingPasses | 0;
  h0 = (h0 + Math.imul(passes, 0x9e3779b1)) | 0;
  h1 = (h1 + Math.imul(passes, 0x85ebca77)) | 0;
  out[0] = h0;
  out[1] = h1;
}

/**
 * KataGo GraphHash::getGraphHash's chaining branch: scramble the path's hash and
 * add the state hash, so a position that could repeat is only ever equal to itself
 * along the same path.
 */
export function mixGraphHash(prevH0: number, prevH1: number, stateH0: number, stateH1: number, out: Int32Array): void {
  let h0 = prevH0 ^ prevH1;
  h0 = Math.imul(h0 ^ (h0 >>> 16), 0x85ebca6b) | 0;
  h0 = Math.imul(h0 ^ (h0 >>> 13), 0xc2b2ae35) | 0;
  h0 = (h0 ^ (h0 >>> 16)) | 0;
  let h1 = Math.imul(prevH1 ^ (prevH1 >>> 15), 0x2545f491) | 0;
  h1 = (h1 ^ (h1 >>> 13)) | 0;
  h1 = (h1 + h0) | 0;
  out[0] = (h0 + stateH0) | 0;
  out[1] = (h1 + stateH1) | 0;
}

/** A Map key for a hash pair. Two 32-bit halves do not fit exactly, which costs a
 * few of the low bits and is far more precision than the few thousand nodes of a
 * browser-sized search need. */
export function packHashKey(h0: number, h1: number): number {
  return (h0 >>> 0) * 4294967296 + (h1 >>> 0);
}

const emptyCounted = { mark: new Int32Array(0), epoch: 0, area: -1 };
const expandQueue = { buf: new Int32Array(0), area: -1 };

function countEmptyHelper(stones: Uint8Array, initialLoc: number, count: number, bound: number): number {
  const mark = emptyCounted.mark;
  const epoch = emptyCounted.epoch;
  if (mark[initialLoc] === epoch) return count;
  count += 1;
  mark[initialLoc] = epoch;
  if (count > bound) return count;

  const queue = expandQueue.buf;
  let numLeft = 0;
  let numExpanded = 0;
  queue[numLeft++] = initialLoc;
  while (numExpanded < numLeft) {
    const loc = queue[numExpanded++]!;
    const nStart = NEIGHBOR_STARTS[loc]!;
    const nCount = NEIGHBOR_COUNTS[loc]!;
    for (let i = 0; i < nCount; i++) {
      const adj = NEIGHBOR_LIST[nStart + i]!;
      if (stones[adj] === EMPTY && mark[adj] !== epoch) {
        count += 1;
        mark[adj] = epoch;
        if (count > bound) return count;
        queue[numLeft++] = adj;
      }
    }
  }
  return count;
}

/**
 * KataGo Board::simpleRepetitionBoundGt, called on the board after `loc` was
 * played: is the local region around that move bigger than `bound`? If it is, no
 * repetition can come back through here in fewer than `bound` moves, so the
 * position is safe to identify by itself alone.
 */
export function simpleRepetitionBoundGt(stones: Uint8Array, loc: number, bound: number): boolean {
  if (loc < 0 || loc === PASS_MOVE || loc >= BOARD_AREA) return false;

  if (emptyCounted.area !== BOARD_AREA) {
    emptyCounted.mark = new Int32Array(BOARD_AREA);
    emptyCounted.area = BOARD_AREA;
    emptyCounted.epoch = 0;
    expandQueue.buf = new Int32Array(BOARD_AREA);
    expandQueue.area = BOARD_AREA;
  }
  emptyCounted.epoch += 1;

  let count = 0;
  const color = stones[loc]! as StoneColor;

  if (color === EMPTY) {
    // The move was a suicide, so the region it left behind is what matters.
    return countEmptyHelper(stones, loc, count, bound) > bound;
  }

  // The chain the move belongs to, and everything it can breathe into.
  const chain: number[] = [];
  const seen = new Set<number>();
  chain.push(loc);
  seen.add(loc);
  for (let i = 0; i < chain.length; i++) {
    const cur = chain[i]!;
    const nStart = NEIGHBOR_STARTS[cur]!;
    const nCount = NEIGHBOR_COUNTS[cur]!;
    for (let j = 0; j < nCount; j++) {
      const adj = NEIGHBOR_LIST[nStart + j]!;
      if (stones[adj] === color && !seen.has(adj)) {
        seen.add(adj);
        chain.push(adj);
      }
    }
  }
  count += chain.length;

  // KataGo's fast quitout uses the chain's liberty count before walking regions.
  let liberties = 0;
  const libertySeen = new Set<number>();
  for (const cur of chain) {
    const nStart = NEIGHBOR_STARTS[cur]!;
    const nCount = NEIGHBOR_COUNTS[cur]!;
    for (let j = 0; j < nCount; j++) {
      const adj = NEIGHBOR_LIST[nStart + j]!;
      if (stones[adj] === EMPTY && !libertySeen.has(adj)) {
        libertySeen.add(adj);
        liberties += 1;
      }
    }
  }
  if (count + liberties > bound) return true;

  for (const cur of chain) {
    const nStart = NEIGHBOR_STARTS[cur]!;
    const nCount = NEIGHBOR_COUNTS[cur]!;
    for (let j = 0; j < nCount; j++) {
      const adj = NEIGHBOR_LIST[nStart + j]!;
      if (stones[adj] === EMPTY) {
        count = countEmptyHelper(stones, adj, count, bound);
        if (count > bound) return true;
      }
    }
  }
  return false;
}

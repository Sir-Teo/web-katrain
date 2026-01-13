export const BOARD_SIZE = 19;
export const BOARD_AREA = BOARD_SIZE * BOARD_SIZE;
export const PASS_MOVE = BOARD_AREA;

export type StoneColor = 0 | 1 | 2; // 0 empty, 1 black, 2 white

export const EMPTY: StoneColor = 0;
export const BLACK: StoneColor = 1;
export const WHITE: StoneColor = 2;

export function opponentOf(color: StoneColor): StoneColor {
  return (3 - color) as StoneColor;
}

const NEIGHBOR_START = new Int16Array(BOARD_AREA);
const NEIGHBOR_COUNT = new Int8Array(BOARD_AREA);
const NEIGHBORS = new Int16Array(BOARD_AREA * 4);

let neighOffset = 0;
for (let y = 0; y < BOARD_SIZE; y++) {
  for (let x = 0; x < BOARD_SIZE; x++) {
    const pos = y * BOARD_SIZE + x;
    NEIGHBOR_START[pos] = neighOffset;
    let count = 0;
    if (x > 0) {
      NEIGHBORS[neighOffset++] = pos - 1;
      count++;
    }
    if (x + 1 < BOARD_SIZE) {
      NEIGHBORS[neighOffset++] = pos + 1;
      count++;
    }
    if (y > 0) {
      NEIGHBORS[neighOffset++] = pos - BOARD_SIZE;
      count++;
    }
    if (y + 1 < BOARD_SIZE) {
      NEIGHBORS[neighOffset++] = pos + BOARD_SIZE;
      count++;
    }
    NEIGHBOR_COUNT[pos] = count;
  }
}

export const NEIGHBOR_STARTS = NEIGHBOR_START;
export const NEIGHBOR_COUNTS = NEIGHBOR_COUNT;
export const NEIGHBOR_LIST = NEIGHBORS;

const VISITED = new Int32Array(BOARD_AREA);
const LIB_VISITED = new Int32Array(BOARD_AREA);
let bfsStamp = 0;

const GROUP_BUF = new Int16Array(BOARD_AREA);
const STACK_BUF = new Int16Array(BOARD_AREA);

function collectGroupAndLiberties(
  stones: Uint8Array,
  start: number,
  color: StoneColor,
  maxLibertiesToCount: number
): { groupLen: number; liberties: number } {
  bfsStamp++;
  const stamp = bfsStamp;
  let groupLen = 0;
  let stackLen = 0;
  let liberties = 0;

  VISITED[start] = stamp;
  STACK_BUF[stackLen++] = start;

  while (stackLen > 0) {
    const p = STACK_BUF[--stackLen]!;
    GROUP_BUF[groupLen++] = p;

    const nStart = NEIGHBOR_START[p]!;
    const nCount = NEIGHBOR_COUNT[p]!;
    for (let i = 0; i < nCount; i++) {
      const n = NEIGHBORS[nStart + i]!;
      const c = stones[n] as StoneColor;
      if (c === EMPTY) {
        if (liberties < maxLibertiesToCount && LIB_VISITED[n] !== stamp) {
          LIB_VISITED[n] = stamp;
          liberties++;
        }
      } else if (c === color) {
        if (VISITED[n] !== stamp) {
          VISITED[n] = stamp;
          STACK_BUF[stackLen++] = n;
        }
      }
    }
  }

  return { groupLen, liberties };
}

const PROCESSED_GROUP = new Int32Array(BOARD_AREA);
let processedStamp = 0;
const GROUP_SEEN = new Int32Array(BOARD_AREA);
let groupSeenStamp = 0;

export type UndoSnapshot = {
  readonly koPointBefore: number;
  readonly captureStart: number;
};

export type SimPosition = {
  readonly stones: Uint8Array; // length BOARD_AREA
  koPoint: number; // 0..360 or -1
};

export function playMove(
  pos: SimPosition,
  move: number,
  player: StoneColor,
  captureStack: number[]
): UndoSnapshot {
  const koPointBefore = pos.koPoint;
  const captureStart = captureStack.length;

  if (move === PASS_MOVE) {
    pos.koPoint = -1;
    return { koPointBefore, captureStart };
  }

  if (move < 0 || move >= BOARD_AREA) throw new Error(`Invalid move index ${move}`);
  if (pos.stones[move] !== EMPTY) throw new Error('Move on occupied point');
  if (pos.koPoint === move) throw new Error('Move violates simple ko');

  const opp = opponentOf(player);
  pos.stones[move] = player;

  let totalCaptured = 0;
  let capturedSinglePos = -1;

  processedStamp++;
  const pStamp = processedStamp;

  const mStart = NEIGHBOR_START[move]!;
  const mCount = NEIGHBOR_COUNT[move]!;
  for (let i = 0; i < mCount; i++) {
    const n = NEIGHBORS[mStart + i]!;
    if ((pos.stones[n] as StoneColor) !== opp) continue;
    if (PROCESSED_GROUP[n] === pStamp) continue;

    const { groupLen, liberties } = collectGroupAndLiberties(pos.stones, n, opp, 1);
    for (let j = 0; j < groupLen; j++) PROCESSED_GROUP[GROUP_BUF[j]!] = pStamp;

    if (liberties !== 0) continue;

    for (let j = 0; j < groupLen; j++) {
      const gp = GROUP_BUF[j]!;
      pos.stones[gp] = EMPTY;
      captureStack.push(gp);
    }

    totalCaptured += groupLen;
    if (totalCaptured === 1 && groupLen === 1) capturedSinglePos = GROUP_BUF[0]!;
    if (totalCaptured > 1) capturedSinglePos = -1;
  }

  const selfGroup = collectGroupAndLiberties(pos.stones, move, player, 2);
  if (selfGroup.liberties === 0) {
    throw new Error('Illegal suicide move');
  }

  if (totalCaptured === 1 && capturedSinglePos >= 0 && selfGroup.groupLen === 1 && selfGroup.liberties === 1) {
    pos.koPoint = capturedSinglePos;
  } else {
    pos.koPoint = -1;
  }

  return { koPointBefore, captureStart };
}

export function undoMove(pos: SimPosition, move: number, player: StoneColor, snapshot: UndoSnapshot, captureStack: number[]): void {
  const captureEnd = captureStack.length;
  const opp = opponentOf(player);

  if (move !== PASS_MOVE) {
    pos.stones[move] = EMPTY;
  }

  for (let i = snapshot.captureStart; i < captureEnd; i++) {
    const p = captureStack[i]!;
    pos.stones[p] = opp;
  }
  captureStack.length = snapshot.captureStart;
  pos.koPoint = snapshot.koPointBefore;
}

export function computeLibertyMapInto(stones: Uint8Array, out: Uint8Array): Uint8Array {
  if (out.length !== BOARD_AREA) throw new Error(`computeLibertyMapInto: expected out length ${BOARD_AREA}, got ${out.length}`);
  out.fill(0);
  groupSeenStamp++;
  const stamp = groupSeenStamp;

  for (let p = 0; p < BOARD_AREA; p++) {
    const c = stones[p] as StoneColor;
    if (c === EMPTY) continue;
    if (GROUP_SEEN[p] === stamp) continue;

    const { groupLen, liberties } = collectGroupAndLiberties(stones, p, c, 4);
    const capLibs = liberties >= 4 ? 4 : liberties;
    for (let i = 0; i < groupLen; i++) {
      const gp = GROUP_BUF[i]!;
      out[gp] = capLibs;
      GROUP_SEEN[gp] = stamp;
    }
  }

  return out;
}

export function computeLibertyMap(stones: Uint8Array): Uint8Array {
  return computeLibertyMapInto(stones, new Uint8Array(BOARD_AREA));
}

// KataGo-style "area" for V7 inputs, following `Board::calculateArea` and `Board::calculateAreaForPla`:
// - Uses Benson pass-alive groups/territory.
// - Includes large territories via safe/unsafe big territory marking.
// - Fills remaining stones when `nonPassAliveStones` is true.
const REGION_IDX_BY_POS = new Int16Array(BOARD_AREA);
const NEXT_EMPTY_OR_OPP = new Int16Array(BOARD_AREA);
const BORDERS_NONPASSALIVE_BY_HEADPOS = new Uint8Array(BOARD_AREA);
const GROUP_INDEX_BY_POS = new Int16Array(BOARD_AREA);
const GROUP_COLOR_BY_GROUP = new Uint8Array(BOARD_AREA);
const GROUP_START_BY_GROUP = new Int16Array(BOARD_AREA);
const GROUP_LEN_BY_GROUP = new Int16Array(BOARD_AREA);
const GROUP_STONES_FLAT = new Int16Array(BOARD_AREA);

const MAX_REGIONS = ((BOARD_AREA + 1) / 2 + 1) | 0;
const REGION_HEADS = new Int16Array(MAX_REGIONS);
const VITAL_START = new Uint16Array(MAX_REGIONS);
const VITAL_LEN = new Uint8Array(MAX_REGIONS);
const NUM_INTERNAL_SPACES_MAX2 = new Uint8Array(MAX_REGIONS);
const CONTAINS_OPP = new Uint8Array(MAX_REGIONS);
const VITAL_LIST = new Int16Array(MAX_REGIONS * 4);
const REGION_QUEUE = new Int16Array(BOARD_AREA);

const PLA_GROUPS = new Int16Array(BOARD_AREA);
const PLA_GROUP_KILLED = new Uint8Array(BOARD_AREA);
const VITAL_COUNT_BY_GROUP = new Int16Array(BOARD_AREA);

function buildGroups(stones: Uint8Array): number {
  GROUP_INDEX_BY_POS.fill(-1);
  let numGroups = 0;
  let flat = 0;

  for (let p = 0; p < BOARD_AREA; p++) {
    const c = stones[p] as StoneColor;
    if (c === EMPTY) continue;
    if (GROUP_INDEX_BY_POS[p] !== -1) continue;

    const groupIdx = numGroups++;
    GROUP_COLOR_BY_GROUP[groupIdx] = c;
    GROUP_START_BY_GROUP[groupIdx] = flat;

    let stackLen = 0;
    STACK_BUF[stackLen++] = p;
    GROUP_INDEX_BY_POS[p] = groupIdx;

    let groupLen = 0;
    while (stackLen > 0) {
      const cur = STACK_BUF[--stackLen]!;
      GROUP_STONES_FLAT[flat++] = cur;
      groupLen++;

      const nStart = NEIGHBOR_START[cur]!;
      const nCount = NEIGHBOR_COUNT[cur]!;
      for (let i = 0; i < nCount; i++) {
        const n = NEIGHBORS[nStart + i]!;
        if ((stones[n] as StoneColor) !== c) continue;
        if (GROUP_INDEX_BY_POS[n] !== -1) continue;
        GROUP_INDEX_BY_POS[n] = groupIdx;
        STACK_BUF[stackLen++] = n;
      }
    }

    GROUP_LEN_BY_GROUP[groupIdx] = groupLen;
  }

  return numGroups;
}

function isAdjacentToColor(stones: Uint8Array, pos: number, color: StoneColor): boolean {
  const nStart = NEIGHBOR_START[pos]!;
  const nCount = NEIGHBOR_COUNT[pos]!;
  for (let i = 0; i < nCount; i++) {
    const n = NEIGHBORS[nStart + i]!;
    if ((stones[n] as StoneColor) === color) return true;
  }
  return false;
}

function isAdjacentToPlaGroup(stones: Uint8Array, pos: number, plaColor: StoneColor, plaGroup: number): boolean {
  const nStart = NEIGHBOR_START[pos]!;
  const nCount = NEIGHBOR_COUNT[pos]!;
  for (let i = 0; i < nCount; i++) {
    const n = NEIGHBORS[nStart + i]!;
    if ((stones[n] as StoneColor) !== plaColor) continue;
    if (GROUP_INDEX_BY_POS[n] === plaGroup) return true;
  }
  return false;
}

function calculateAreaForPla(args: {
  stones: Uint8Array;
  numGroups: number;
  plaColor: StoneColor;
  safeBigTerritories: boolean;
  unsafeBigTerritories: boolean;
  isMultiStoneSuicideLegal: boolean;
  result: Uint8Array;
}): void {
  const { stones, numGroups, plaColor, safeBigTerritories, unsafeBigTerritories, isMultiStoneSuicideLegal, result } = args;
  const oppColor = opponentOf(plaColor);

  REGION_IDX_BY_POS.fill(-1);
  BORDERS_NONPASSALIVE_BY_HEADPOS.fill(0);

  let numRegions = 0;
  let vitalTotal = 0;
  let atLeastOnePla = false;

  const buildRegion = (initialPos: number, regionIdx: number): number => {
    let tailTarget = initialPos;

    let qh = 0;
    let qt = 1;
    REGION_QUEUE[0] = initialPos;
    REGION_IDX_BY_POS[initialPos] = regionIdx;

    let hasVital = VITAL_LEN[regionIdx]! > 0;

    while (qh !== qt) {
      const pos = REGION_QUEUE[qh++]!;

      if (hasVital && (isMultiStoneSuicideLegal || (stones[pos] as StoneColor) === EMPTY)) {
        const vStart = VITAL_START[regionIdx]!;
        const oldLen = VITAL_LEN[regionIdx]!;
        let newLen = 0;
        for (let i = 0; i < oldLen; i++) {
          const g = VITAL_LIST[vStart + i]!;
          if (isAdjacentToPlaGroup(stones, pos, plaColor, g)) {
            VITAL_LIST[vStart + newLen] = g;
            newLen++;
          }
        }
        VITAL_LEN[regionIdx] = newLen;
        hasVital = newLen > 0;
      }

      if (NUM_INTERNAL_SPACES_MAX2[regionIdx]! < 2 && !isAdjacentToColor(stones, pos, plaColor)) {
        NUM_INTERNAL_SPACES_MAX2[regionIdx] = (NUM_INTERNAL_SPACES_MAX2[regionIdx]! + 1) as number;
      }

      if ((stones[pos] as StoneColor) === oppColor) CONTAINS_OPP[regionIdx] = 1;

      NEXT_EMPTY_OR_OPP[pos] = tailTarget;
      tailTarget = pos;

      const nStart = NEIGHBOR_START[pos]!;
      const nCount = NEIGHBOR_COUNT[pos]!;
      for (let i = 0; i < nCount; i++) {
        const n = NEIGHBORS[nStart + i]!;
        const c = stones[n] as StoneColor;
        if (c !== EMPTY && c !== oppColor) continue;
        if (REGION_IDX_BY_POS[n] !== -1) continue;
        REGION_IDX_BY_POS[n] = regionIdx;
        REGION_QUEUE[qt++] = n;
      }
    }

    return tailTarget;
  };

  for (let p = 0; p < BOARD_AREA; p++) {
    if (REGION_IDX_BY_POS[p] !== -1) continue;
    const c = stones[p] as StoneColor;
    if (c !== EMPTY) {
      if (c === plaColor) atLeastOnePla = true;
      continue;
    }

    const regionIdx = numRegions++;
    REGION_HEADS[regionIdx] = p;
    VITAL_START[regionIdx] = vitalTotal;
    VITAL_LEN[regionIdx] = 0;
    NUM_INTERNAL_SPACES_MAX2[regionIdx] = 0;
    CONTAINS_OPP[regionIdx] = 0;

    let initialVLen = 0;
    {
      const nStart = NEIGHBOR_START[p]!;
      const nCount = NEIGHBOR_COUNT[p]!;
      for (let i = 0; i < nCount; i++) {
        const adj = NEIGHBORS[nStart + i]!;
        if ((stones[adj] as StoneColor) !== plaColor) continue;
        const g = GROUP_INDEX_BY_POS[adj]!;
        let alreadyPresent = false;
        for (let j = 0; j < initialVLen; j++) {
          if (VITAL_LIST[vitalTotal + j] === g) {
            alreadyPresent = true;
            break;
          }
        }
        if (!alreadyPresent) {
          VITAL_LIST[vitalTotal + initialVLen] = g;
          initialVLen++;
          if (initialVLen >= 4) break;
        }
      }
    }
    VITAL_LEN[regionIdx] = initialVLen;

    const tail = buildRegion(p, regionIdx);
    NEXT_EMPTY_OR_OPP[p] = tail;

    vitalTotal += VITAL_LEN[regionIdx]!;
  }

  let numPlaGroups = 0;
  for (let g = 0; g < numGroups; g++) {
    if ((GROUP_COLOR_BY_GROUP[g] as StoneColor) === plaColor) {
      PLA_GROUPS[numPlaGroups++] = g;
      PLA_GROUP_KILLED[g] = 0;
      VITAL_COUNT_BY_GROUP[g] = 0;
    }
  }

  for (let i = 0; i < numRegions; i++) {
    const vStart = VITAL_START[i]!;
    const vLen = VITAL_LEN[i]!;
    for (let j = 0; j < vLen; j++) {
      const g = VITAL_LIST[vStart + j]!;
      VITAL_COUNT_BY_GROUP[g] = (VITAL_COUNT_BY_GROUP[g]! + 1) as number;
    }
  }

  while (true) {
    let killedAnything = false;

    for (let i = 0; i < numPlaGroups; i++) {
      const g = PLA_GROUPS[i]!;
      if (PLA_GROUP_KILLED[g]) continue;
      if (VITAL_COUNT_BY_GROUP[g]! >= 2) continue;

      PLA_GROUP_KILLED[g] = 1;
      killedAnything = true;

      const start = GROUP_START_BY_GROUP[g]!;
      const len = GROUP_LEN_BY_GROUP[g]!;
      for (let t = 0; t < len; t++) {
        const cur = GROUP_STONES_FLAT[start + t]!;
        const nStart = NEIGHBOR_START[cur]!;
        const nCount = NEIGHBOR_COUNT[cur]!;
        for (let k = 0; k < nCount; k++) {
          const adj = NEIGHBORS[nStart + k]!;
          const regionIdx = REGION_IDX_BY_POS[adj]!;
          if (regionIdx < 0) continue;

          const headPos = REGION_HEADS[regionIdx]!;
          if (BORDERS_NONPASSALIVE_BY_HEADPOS[headPos]) continue;
          const ac = stones[adj] as StoneColor;
          if (ac !== EMPTY && ac !== oppColor) continue;

          BORDERS_NONPASSALIVE_BY_HEADPOS[headPos] = 1;

          const vs = VITAL_START[regionIdx]!;
          const vl = VITAL_LEN[regionIdx]!;
          for (let u = 0; u < vl; u++) {
            const gg = VITAL_LIST[vs + u]!;
            VITAL_COUNT_BY_GROUP[gg] = (VITAL_COUNT_BY_GROUP[gg]! - 1) as number;
          }
        }
      }
    }

    if (!killedAnything) break;
  }

  for (let i = 0; i < numPlaGroups; i++) {
    const g = PLA_GROUPS[i]!;
    if (PLA_GROUP_KILLED[g]) continue;
    const start = GROUP_START_BY_GROUP[g]!;
    const len = GROUP_LEN_BY_GROUP[g]!;
    for (let t = 0; t < len; t++) {
      result[GROUP_STONES_FLAT[start + t]!] = plaColor;
    }
  }

  for (let i = 0; i < numRegions; i++) {
    const headPos = REGION_HEADS[i]!;

    let shouldMark = NUM_INTERNAL_SPACES_MAX2[i]! <= 1 && !BORDERS_NONPASSALIVE_BY_HEADPOS[headPos] && atLeastOnePla;
    shouldMark = shouldMark || (safeBigTerritories && !CONTAINS_OPP[i] && !BORDERS_NONPASSALIVE_BY_HEADPOS[headPos] && atLeastOnePla);

    if (shouldMark) {
      let cur = headPos;
      do {
        result[cur] = plaColor;
        cur = NEXT_EMPTY_OR_OPP[cur]!;
      } while (cur !== headPos);
    } else {
      const shouldMarkIfEmpty = unsafeBigTerritories && !CONTAINS_OPP[i] && atLeastOnePla;
      if (shouldMarkIfEmpty) {
        let cur = headPos;
        do {
          if ((result[cur] as StoneColor) === EMPTY) result[cur] = plaColor;
          cur = NEXT_EMPTY_OR_OPP[cur]!;
        } while (cur !== headPos);
      }
    }
  }
}

export function computeAreaMapV7KataGo(stones: Uint8Array, isMultiStoneSuicideLegal = false): Uint8Array {
  return computeAreaMapV7KataGoInto(stones, new Uint8Array(BOARD_AREA), isMultiStoneSuicideLegal);
}

export function computeAreaMapV7KataGoInto(stones: Uint8Array, out: Uint8Array, isMultiStoneSuicideLegal = false): Uint8Array {
  if (out.length !== BOARD_AREA) throw new Error(`computeAreaMapV7KataGoInto: expected out length ${BOARD_AREA}, got ${out.length}`);
  out.fill(EMPTY);
  const numGroups = buildGroups(stones);

  calculateAreaForPla({
    stones,
    numGroups,
    plaColor: BLACK,
    safeBigTerritories: true,
    unsafeBigTerritories: true,
    isMultiStoneSuicideLegal,
    result: out,
  });
  calculateAreaForPla({
    stones,
    numGroups,
    plaColor: WHITE,
    safeBigTerritories: true,
    unsafeBigTerritories: true,
    isMultiStoneSuicideLegal,
    result: out,
  });

  // nonPassAliveStones = true
  for (let p = 0; p < BOARD_AREA; p++) {
    if ((out[p] as StoneColor) === EMPTY) out[p] = stones[p]!;
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// Ladder features for KataGo V7 inputs (spatial planes 14-17), following `iterLadders` in
// `cpp/neuralnet/nninputs.cpp` and ladder search in `cpp/game/board.cpp`.

type LadderSearchScratch = {
  bufMoves: Int16Array;
  moveListStarts: Int32Array;
  moveListLens: Int32Array;
  moveListCur: Int32Array;
  recordMoves: Int16Array;
  recordPlayers: Uint8Array;
  recordKoPointBefore: Int16Array;
  recordCaptureStart: Int32Array;
  tmpKoPointBefore: Int16Array;
  tmpCaptureStart: Int32Array;
  captureStack: number[];
};

const LADDER_STACK_SIZE = ((BOARD_AREA * 3) / 2 + 2) | 0;
const LADDER_BUF_SIZE = 8192;
const LADDER_SEARCH_NODE_BUDGET = 25_000;
const LADDER_SCRATCH: LadderSearchScratch = {
  bufMoves: new Int16Array(LADDER_BUF_SIZE),
  moveListStarts: new Int32Array(LADDER_STACK_SIZE),
  moveListLens: new Int32Array(LADDER_STACK_SIZE),
  moveListCur: new Int32Array(LADDER_STACK_SIZE),
  recordMoves: new Int16Array(LADDER_STACK_SIZE),
  recordPlayers: new Uint8Array(LADDER_STACK_SIZE),
  recordKoPointBefore: new Int16Array(LADDER_STACK_SIZE),
  recordCaptureStart: new Int32Array(LADDER_STACK_SIZE),
  tmpKoPointBefore: new Int16Array(1),
  tmpCaptureStart: new Int32Array(1),
  captureStack: [],
};

const LADDER_GROUP_SEEN = new Int32Array(BOARD_AREA);
let ladderGroupSeenStamp = 0;
const LADDER_OPP_GROUP_SEEN = new Int32Array(BOARD_AREA);
let ladderOppGroupSeenStamp = 0;
const LADDER_GROUP_COPY = new Int16Array(BOARD_AREA);
const LADDER_CONNECT_GROUP_SEEN = new Int32Array(BOARD_AREA);
let ladderConnectGroupSeenStamp = 0;
const LADDER_CAPTURED = new Int32Array(BOARD_AREA);
let ladderCapturedStamp = 0;

function isAdjacent(a: number, b: number): boolean {
  if (a === b) return false;
  const d = a - b;
  if (d === 1 || d === -1) return ((a / BOARD_SIZE) | 0) === ((b / BOARD_SIZE) | 0);
  return d === BOARD_SIZE || d === -BOARD_SIZE;
}

function getNumImmediateLiberties(stones: Uint8Array, pos: number): number {
  let num = 0;
  const nStart = NEIGHBOR_START[pos]!;
  const nCount = NEIGHBOR_COUNT[pos]!;
  for (let i = 0; i < nCount; i++) {
    const n = NEIGHBORS[nStart + i]!;
    if ((stones[n] as StoneColor) === EMPTY) num++;
  }
  return num;
}

function findLibertiesIntoBuf(stones: Uint8Array, start: number, color: StoneColor, buf: Int16Array, bufIdx: number, max: number): number {
  bfsStamp++;
  const stamp = bfsStamp;
  let stackLen = 0;
  let groupLen = 0;
  let liberties = 0;

  VISITED[start] = stamp;
  STACK_BUF[stackLen++] = start;

  while (stackLen > 0) {
    const p = STACK_BUF[--stackLen]!;
    GROUP_BUF[groupLen++] = p;

    const nStart = NEIGHBOR_START[p]!;
    const nCount = NEIGHBOR_COUNT[p]!;
    for (let i = 0; i < nCount; i++) {
      const n = NEIGHBORS[nStart + i]!;
      const c = stones[n] as StoneColor;
      if (c === EMPTY) {
        if (liberties < max && LIB_VISITED[n] !== stamp) {
          LIB_VISITED[n] = stamp;
          buf[bufIdx + liberties] = n;
          liberties++;
        }
      } else if (c === color) {
        if (VISITED[n] !== stamp) {
          VISITED[n] = stamp;
          STACK_BUF[stackLen++] = n;
        }
      }
    }
  }

  return liberties;
}

function getNumLibertiesCapped(stones: Uint8Array, loc: number, cap: number): number {
  const c = stones[loc] as StoneColor;
  if (c === EMPTY) return 0;
  return collectGroupAndLiberties(stones, loc, c, cap).liberties;
}

function wouldBeKoCapture(stones: Uint8Array, loc: number, pla: StoneColor): boolean {
  if ((stones[loc] as StoneColor) !== EMPTY) return false;
  const opp = opponentOf(pla);
  let oppCapturableLoc = -1;
  const nStart = NEIGHBOR_START[loc]!;
  const nCount = NEIGHBOR_COUNT[loc]!;
  if (nCount < 4) {
    // Walls are allowed; just treat missing neighbors as walls.
  }
  for (let i = 0; i < nCount; i++) {
    const adj = NEIGHBORS[nStart + i]!;
    const c = stones[adj] as StoneColor;
    if (c !== opp) return false;
    if (getNumLibertiesCapped(stones, adj, 2) === 1) {
      if (oppCapturableLoc !== -1) return false;
      oppCapturableLoc = adj;
    }
  }

  // Off-board neighbors act as walls, so we also need to ensure that all on-board neighbors were checked above.
  // If we have fewer than 4 on-board neighbors, that's fine - walls count as opponent/wall in KataGo.
  if (oppCapturableLoc === -1) return false;

  const oppGroup = collectGroupAndLiberties(stones, oppCapturableLoc, opp, 2);
  if (oppGroup.liberties !== 1) return false;
  return oppGroup.groupLen === 1;
}

function hasLibertyGainingCaptures(stones: Uint8Array, loc: number): boolean {
  const pla = stones[loc] as StoneColor;
  if (pla === EMPTY) return false;
  const opp = opponentOf(pla);

  const g = collectGroupAndLiberties(stones, loc, pla, 2);
  for (let i = 0; i < g.groupLen; i++) LADDER_GROUP_COPY[i] = GROUP_BUF[i]!;

  for (let i = 0; i < g.groupLen; i++) {
    const p = LADDER_GROUP_COPY[i]!;
    const nStart = NEIGHBOR_START[p]!;
    const nCount = NEIGHBOR_COUNT[p]!;
    for (let j = 0; j < nCount; j++) {
      const adj = NEIGHBORS[nStart + j]!;
      if ((stones[adj] as StoneColor) !== opp) continue;
      if (getNumLibertiesCapped(stones, adj, 2) === 1) return true;
    }
  }
  return false;
}

function countHeuristicConnectionLibertiesX2(stones: Uint8Array, loc: number, pla: StoneColor): number {
  let numLibsX2 = 0;
  const nStart = NEIGHBOR_START[loc]!;
  const nCount = NEIGHBOR_COUNT[loc]!;
  for (let i = 0; i < nCount; i++) {
    const adj = NEIGHBORS[nStart + i]!;
    if ((stones[adj] as StoneColor) !== pla) continue;
    const libs = getNumLibertiesCapped(stones, adj, 20);
    if (libs > 1) numLibsX2 += libs * 2 - 3;
  }
  return numLibsX2;
}

function getBoundNumLibertiesAfterPlay(stones: Uint8Array, loc: number, pla: StoneColor): { lowerBound: number; upperBound: number } {
  const opp = opponentOf(pla);

  let numImmediateLibs = 0;
  let numCaps = 0;
  let potentialLibsFromCaps = 0;
  let numConnectionLibs = 0;
  let maxConnectionLibs = 0;

  const nStart = NEIGHBOR_START[loc]!;
  const nCount = NEIGHBOR_COUNT[loc]!;
  for (let i = 0; i < nCount; i++) {
    const adj = NEIGHBORS[nStart + i]!;
    const c = stones[adj] as StoneColor;
    if (c === EMPTY) {
      numImmediateLibs++;
    } else if (c === opp) {
      const capInfo = collectGroupAndLiberties(stones, adj, opp, 2);
      if (capInfo.liberties === 1) {
        numCaps++;
        potentialLibsFromCaps += capInfo.groupLen;
      }
    } else if (c === pla) {
      const libs = getNumLibertiesCapped(stones, adj, 20);
      const connLibs = libs - 1;
      numConnectionLibs += connLibs;
      if (connLibs > maxConnectionLibs) maxConnectionLibs = connLibs;
    }
  }

  const lowerBound = numCaps + (maxConnectionLibs > numImmediateLibs ? maxConnectionLibs : numImmediateLibs);
  const upperBound = numImmediateLibs + potentialLibsFromCaps + numConnectionLibs;
  return { lowerBound, upperBound };
}

function getNumLibertiesAfterPlay(stones: Uint8Array, loc: number, pla: StoneColor, max: number): number {
  if ((stones[loc] as StoneColor) !== EMPTY) return 0;
  const opp = opponentOf(pla);

  // Mark captured opponent stones as empty.
  ladderCapturedStamp++;
  const capStamp = ladderCapturedStamp;

  // Collect initial liberties.
  const libs = new Int16Array(16);
  let numLibs = 0;

  const addLib = (p: number): boolean => {
    for (let i = 0; i < numLibs; i++) if (libs[i] === p) return false;
    libs[numLibs++] = p;
    return true;
  };

  const nStart = NEIGHBOR_START[loc]!;
  const nCount = NEIGHBOR_COUNT[loc]!;
  for (let i = 0; i < nCount; i++) {
    const adj = NEIGHBORS[nStart + i]!;
    const c = stones[adj] as StoneColor;
    if (c === EMPTY) {
      addLib(adj);
      if (numLibs >= max) return max;
    } else if (c === opp) {
      const oppInfo = collectGroupAndLiberties(stones, adj, opp, 2);
      if (oppInfo.liberties === 1) {
        // Captured stones become empty, so the adjacent stone location is a liberty.
        addLib(adj);
        if (numLibs >= max) return max;
        for (let j = 0; j < oppInfo.groupLen; j++) LADDER_CAPTURED[GROUP_BUF[j]!] = capStamp;
      }
    }
  }

  ladderConnectGroupSeenStamp++;
  const seenStamp = ladderConnectGroupSeenStamp;

  const wouldBeEmpty = (p: number): boolean => {
    const c = stones[p] as StoneColor;
    if (c === EMPTY) return true;
    return c === opp && LADDER_CAPTURED[p] === capStamp;
  };

  for (let i = 0; i < nCount; i++) {
    const adj = NEIGHBORS[nStart + i]!;
    if ((stones[adj] as StoneColor) !== pla) continue;
    if (LADDER_CONNECT_GROUP_SEEN[adj] === seenStamp) continue;

    const g = collectGroupAndLiberties(stones, adj, pla, max);
    for (let j = 0; j < g.groupLen; j++) LADDER_CONNECT_GROUP_SEEN[GROUP_BUF[j]!] = seenStamp;

    for (let j = 0; j < g.groupLen; j++) {
      const cur = GROUP_BUF[j]!;
      const cs = NEIGHBOR_START[cur]!;
      const cc = NEIGHBOR_COUNT[cur]!;
      for (let k = 0; k < cc; k++) {
        const possibleLib = NEIGHBORS[cs + k]!;
        if (possibleLib === loc) continue;
        if (!wouldBeEmpty(possibleLib)) continue;
        addLib(possibleLib);
        if (numLibs >= max) return max;
      }
    }
  }

  return numLibs;
}

function findLibertyGainingCaptures(stones: Uint8Array, loc: number, buf: Int16Array, bufStart: number): number {
  const pla = stones[loc] as StoneColor;
  if (pla === EMPTY) return 0;
  const opp = opponentOf(pla);

  ladderOppGroupSeenStamp++;
  const seenStamp = ladderOppGroupSeenStamp;

  const g = collectGroupAndLiberties(stones, loc, pla, 2);
  for (let i = 0; i < g.groupLen; i++) LADDER_GROUP_COPY[i] = GROUP_BUF[i]!;

  let numFound = 0;
  for (let i = 0; i < g.groupLen; i++) {
    const p = LADDER_GROUP_COPY[i]!;
    const nStart = NEIGHBOR_START[p]!;
    const nCount = NEIGHBOR_COUNT[p]!;
    for (let j = 0; j < nCount; j++) {
      const adj = NEIGHBORS[nStart + j]!;
      if ((stones[adj] as StoneColor) !== opp) continue;
      if (LADDER_OPP_GROUP_SEEN[adj] === seenStamp) continue;

      const libCount = findLibertiesIntoBuf(stones, adj, opp, buf, bufStart + numFound, 2);
      const groupLen = collectGroupAndLiberties(stones, adj, opp, 2).groupLen;
      for (let k = 0; k < groupLen; k++) LADDER_OPP_GROUP_SEEN[GROUP_BUF[k]!] = seenStamp;

      if (libCount === 1) {
        numFound += 1;
        if (bufStart + numFound >= buf.length) return numFound;
      }
    }
  }
  return numFound;
}

function undoMoveRaw(pos: SimPosition, move: number, player: StoneColor, koPointBefore: number, captureStart: number, captureStack: number[]): void {
  const captureEnd = captureStack.length;
  const opp = opponentOf(player);

  if (move !== PASS_MOVE) pos.stones[move] = EMPTY;

  for (let i = captureStart; i < captureEnd; i++) {
    const p = captureStack[i]!;
    pos.stones[p] = opp;
  }
  captureStack.length = captureStart;
  pos.koPoint = koPointBefore;
}

function tryPlayMoveNoThrow(
  pos: SimPosition,
  move: number,
  player: StoneColor,
  captureStack: number[],
  koPointBeforeOut: Int16Array,
  captureStartOut: Int32Array,
  recordIdx: number
): boolean {
  const koPointBefore = pos.koPoint;
  const captureStart = captureStack.length;
  koPointBeforeOut[recordIdx] = koPointBefore;
  captureStartOut[recordIdx] = captureStart;

  if (move === PASS_MOVE) {
    pos.koPoint = -1;
    return true;
  }

  if (move < 0 || move >= BOARD_AREA) return false;
  if ((pos.stones[move] as StoneColor) !== EMPTY) return false;
  if (pos.koPoint === move) return false;

  const opp = opponentOf(player);
  pos.stones[move] = player;

  let totalCaptured = 0;
  let capturedSinglePos = -1;

  processedStamp++;
  const pStamp = processedStamp;

  const mStart = NEIGHBOR_START[move]!;
  const mCount = NEIGHBOR_COUNT[move]!;
  for (let i = 0; i < mCount; i++) {
    const n = NEIGHBORS[mStart + i]!;
    if ((pos.stones[n] as StoneColor) !== opp) continue;
    if (PROCESSED_GROUP[n] === pStamp) continue;

    const { groupLen, liberties } = collectGroupAndLiberties(pos.stones, n, opp, 1);
    for (let j = 0; j < groupLen; j++) PROCESSED_GROUP[GROUP_BUF[j]!] = pStamp;
    if (liberties !== 0) continue;

    for (let j = 0; j < groupLen; j++) {
      const gp = GROUP_BUF[j]!;
      pos.stones[gp] = EMPTY;
      captureStack.push(gp);
    }

    totalCaptured += groupLen;
    if (totalCaptured === 1 && groupLen === 1) capturedSinglePos = GROUP_BUF[0]!;
    if (totalCaptured > 1) capturedSinglePos = -1;
  }

  const selfGroup = collectGroupAndLiberties(pos.stones, move, player, 2);
  if (selfGroup.liberties === 0) {
    undoMoveRaw(pos, move, player, koPointBefore, captureStart, captureStack);
    return false;
  }

  if (totalCaptured === 1 && capturedSinglePos >= 0 && selfGroup.groupLen === 1 && selfGroup.liberties === 1) {
    pos.koPoint = capturedSinglePos;
  } else {
    pos.koPoint = -1;
  }

  return true;
}

function searchIsLadderCaptured(pos: SimPosition, loc: number, defenderFirst: boolean, scratch: LadderSearchScratch): boolean {
  if (loc < 0 || loc >= BOARD_AREA) return false;
  const c = pos.stones[loc] as StoneColor;
  if (c !== BLACK && c !== WHITE) return false;

  const libs0 = getNumLibertiesCapped(pos.stones, loc, 3);
  if (libs0 > 2 || (defenderFirst && libs0 > 1)) return false;

  const pla = c;
  const opp = opponentOf(pla);

  const koSaved = pos.koPoint;
  if (defenderFirst) pos.koPoint = -1;

  const { bufMoves, moveListStarts, moveListLens, moveListCur, recordMoves, recordPlayers, recordKoPointBefore, recordCaptureStart, captureStack } = scratch;

  const stackSize = LADDER_STACK_SIZE;
  let stackIdx = 0;
  let searchNodeCount = 0;

  moveListCur[0] = -1;
  moveListStarts[0] = 0;
  moveListLens[0] = 0;

  let returnValue = false;
  let returnedFromDeeper = false;

  while (true) {
    if (stackIdx <= -1) {
      pos.koPoint = koSaved;
      return returnValue;
    }

    if (stackIdx >= stackSize - 1) {
      returnValue = true;
      returnedFromDeeper = true;
      stackIdx--;
      continue;
    }

    if (searchNodeCount >= LADDER_SEARCH_NODE_BUDGET) {
      for (let i = stackIdx - 1; i >= 0; i--) {
        undoMoveRaw(pos, recordMoves[i]!, recordPlayers[i]! as StoneColor, recordKoPointBefore[i]!, recordCaptureStart[i]!, captureStack);
      }
      pos.koPoint = koSaved;
      return false;
    }

    const isDefender = (defenderFirst && (stackIdx % 2) === 0) || (!defenderFirst && (stackIdx % 2) === 1);

    if (moveListCur[stackIdx] === -1) {
      const libs = getNumLibertiesCapped(pos.stones, loc, 3);

      if (!isDefender && libs <= 1) {
        returnValue = true;
        returnedFromDeeper = true;
        stackIdx--;
        continue;
      }
      if (!isDefender && libs >= 3) {
        returnValue = false;
        returnedFromDeeper = true;
        stackIdx--;
        continue;
      }
      if (isDefender && libs >= 2) {
        returnValue = false;
        returnedFromDeeper = true;
        stackIdx--;
        continue;
      }
      if (isDefender && pos.koPoint !== -1) {
        returnValue = false;
        returnedFromDeeper = true;
        stackIdx--;
        continue;
      }

      const start = moveListStarts[stackIdx]!;
      let moveListLen = 0;

      if (isDefender) {
        moveListLen = findLibertyGainingCaptures(pos.stones, loc, bufMoves, start);
        moveListLen += findLibertiesIntoBuf(pos.stones, loc, pla, bufMoves, start + moveListLen, 1);

        if (moveListLen <= 0) {
          returnValue = true;
          returnedFromDeeper = true;
          stackIdx--;
          continue;
        }

        const lastMove = bufMoves[start + moveListLen - 1]!;
        const bounds = getBoundNumLibertiesAfterPlay(pos.stones, lastMove, pla);
        if (bounds.lowerBound >= 3) {
          returnValue = false;
          returnedFromDeeper = true;
          stackIdx--;
          continue;
        }
        if (moveListLen === 1 && bounds.upperBound <= 1) {
          returnValue = true;
          returnedFromDeeper = true;
          stackIdx--;
          continue;
        }
      } else {
        moveListLen += findLibertiesIntoBuf(pos.stones, loc, pla, bufMoves, start, 2);
        if (moveListLen !== 2) {
          returnValue = false;
          returnedFromDeeper = true;
          stackIdx--;
          continue;
        }

        let libsA = getNumImmediateLiberties(pos.stones, bufMoves[start]!);
        let libsB = getNumImmediateLiberties(pos.stones, bufMoves[start + 1]!);

        if (libsA === 0 && libsB === 0 && wouldBeKoCapture(pos.stones, bufMoves[start]!, opp) && wouldBeKoCapture(pos.stones, bufMoves[start + 1]!, opp)) {
          if (getNumLibertiesAfterPlay(pos.stones, bufMoves[start]!, pla, 3) <= 2 && getNumLibertiesAfterPlay(pos.stones, bufMoves[start + 1]!, pla, 3) <= 2) {
            if (!hasLibertyGainingCaptures(pos.stones, loc)) {
              returnValue = true;
              returnedFromDeeper = true;
              stackIdx--;
              continue;
            }
          }
        }

        if (!isAdjacent(bufMoves[start]!, bufMoves[start + 1]!)) {
          if (libsA >= 3 && libsB >= 3) {
            returnValue = false;
            returnedFromDeeper = true;
            stackIdx--;
            continue;
          } else if (libsA >= 3) {
            moveListLen = 1;
          } else if (libsB >= 3) {
            bufMoves[start] = bufMoves[start + 1]!;
            moveListLen = 1;
          }
        }

        if (moveListLen > 1) {
          libsA = libsA * 2 + countHeuristicConnectionLibertiesX2(pos.stones, bufMoves[start]!, pla);
          libsB = libsB * 2 + countHeuristicConnectionLibertiesX2(pos.stones, bufMoves[start + 1]!, pla);
          if (libsB > libsA) {
            const tmp = bufMoves[start]!;
            bufMoves[start] = bufMoves[start + 1]!;
            bufMoves[start + 1] = tmp;
          }
        }
      }

      moveListLens[stackIdx] = moveListLen;
      moveListCur[stackIdx] = 0;
    } else {
      if (returnedFromDeeper) {
        undoMoveRaw(
          pos,
          recordMoves[stackIdx]!,
          recordPlayers[stackIdx]! as StoneColor,
          recordKoPointBefore[stackIdx]!,
          recordCaptureStart[stackIdx]!,
          captureStack
        );
      }

      if (isDefender && !returnValue) {
        returnedFromDeeper = true;
        stackIdx--;
        continue;
      }
      if (!isDefender && returnValue) {
        returnedFromDeeper = true;
        stackIdx--;
        continue;
      }

      moveListCur[stackIdx] = (moveListCur[stackIdx]! + 1) | 0;
    }

    if (moveListCur[stackIdx]! >= moveListLens[stackIdx]!) {
      returnValue = isDefender;
      returnedFromDeeper = true;
      stackIdx--;
      continue;
    }

    const move = bufMoves[moveListStarts[stackIdx]! + moveListCur[stackIdx]!]!;
    const p = isDefender ? pla : opp;

    recordMoves[stackIdx] = move;
    recordPlayers[stackIdx] = p;

    if (!tryPlayMoveNoThrow(pos, move, p, captureStack, recordKoPointBefore, recordCaptureStart, stackIdx)) {
      returnValue = isDefender;
      returnedFromDeeper = false;
      continue;
    }

    searchNodeCount++;

    stackIdx++;
    moveListCur[stackIdx] = -1;
    moveListStarts[stackIdx] = moveListStarts[stackIdx - 1]! + moveListLens[stackIdx - 1]!;
    moveListLens[stackIdx] = 0;
  }
}

function searchIsLadderCapturedAttackerFirst2Libs(
  pos: SimPosition,
  loc: number,
  scratch: LadderSearchScratch,
  outWorkingMoves: number[]
): boolean {
  if (loc < 0 || loc >= BOARD_AREA) return false;
  const c = pos.stones[loc] as StoneColor;
  if (c !== BLACK && c !== WHITE) return false;

  if (getNumLibertiesCapped(pos.stones, loc, 3) !== 2) return false;

  const pla = c;
  const opp = opponentOf(pla);

  // Find the two liberties.
  const tmpLibs = new Int16Array(2);
  const libCount = findLibertiesIntoBuf(pos.stones, loc, pla, tmpLibs, 0, 2);
  if (libCount !== 2) return false;
  const move0 = tmpLibs[0]!;
  const move1 = tmpLibs[1]!;

  let move0Works = false;
  let move1Works = false;

  outWorkingMoves.length = 0;
  scratch.captureStack.length = 0;

  if (tryPlayMoveNoThrow(pos, move0, opp, scratch.captureStack, scratch.tmpKoPointBefore, scratch.tmpCaptureStart, 0)) {
    move0Works = searchIsLadderCaptured(pos, loc, true, scratch);
    undoMoveRaw(pos, move0, opp, scratch.tmpKoPointBefore[0]!, scratch.tmpCaptureStart[0]!, scratch.captureStack);
  }

  if (tryPlayMoveNoThrow(pos, move1, opp, scratch.captureStack, scratch.tmpKoPointBefore, scratch.tmpCaptureStart, 0)) {
    move1Works = searchIsLadderCaptured(pos, loc, true, scratch);
    undoMoveRaw(pos, move1, opp, scratch.tmpKoPointBefore[0]!, scratch.tmpCaptureStart[0]!, scratch.captureStack);
  }

  if (move0Works || move1Works) {
    if (move0Works) outWorkingMoves.push(move0);
    if (move1Works) outWorkingMoves.push(move1);
    return true;
  }
  return false;
}

export type KataGoLadderFeaturesV7 = {
  ladderedStones: Uint8Array; // plane 14
  ladderWorkingMoves: Uint8Array; // plane 17
};

type KataGoLadderFeaturesScratchV7 = {
  copyPos: SimPosition;
  groupStones: Int16Array;
  workingMoves: number[];
};

const LADDER_FEATURES_SCRATCH_V7: KataGoLadderFeaturesScratchV7 = {
  copyPos: { stones: new Uint8Array(BOARD_AREA), koPoint: -1 },
  groupStones: new Int16Array(BOARD_AREA),
  workingMoves: [],
};

export function computeLadderFeaturesV7KataGoInto(args: {
  stones: Uint8Array;
  koPoint: number;
  currentPlayer: StoneColor;
  outLadderedStones: Uint8Array;
  outLadderWorkingMoves: Uint8Array;
}): void {
  const { stones, koPoint, currentPlayer, outLadderedStones, outLadderWorkingMoves } = args;
  outLadderedStones.fill(0);
  outLadderWorkingMoves.fill(0);

  const opp = opponentOf(currentPlayer);

  ladderGroupSeenStamp++;
  const seenStamp = ladderGroupSeenStamp;

  const copyPos = LADDER_FEATURES_SCRATCH_V7.copyPos;
  const groupStones = LADDER_FEATURES_SCRATCH_V7.groupStones;
  const workingMoves = LADDER_FEATURES_SCRATCH_V7.workingMoves;

  for (let p = 0; p < BOARD_AREA; p++) {
    const c = stones[p] as StoneColor;
    if (c === EMPTY) continue;
    if (LADDER_GROUP_SEEN[p] === seenStamp) continue;

    const g = collectGroupAndLiberties(stones, p, c, 3);
    for (let i = 0; i < g.groupLen; i++) LADDER_GROUP_SEEN[GROUP_BUF[i]!] = seenStamp;

    if (g.liberties !== 1 && g.liberties !== 2) continue;

    groupStones.set(GROUP_BUF.subarray(0, g.groupLen));

    copyPos.stones.set(stones);
    copyPos.koPoint = koPoint;
    LADDER_SCRATCH.captureStack.length = 0;

    let laddered = false;
    workingMoves.length = 0;
    if (g.liberties === 1) {
      laddered = searchIsLadderCaptured(copyPos, p, true, LADDER_SCRATCH);
    } else {
      laddered = searchIsLadderCapturedAttackerFirst2Libs(copyPos, p, LADDER_SCRATCH, workingMoves);
    }

    if (!laddered) continue;

    for (let i = 0; i < g.groupLen; i++) outLadderedStones[groupStones[i]!] = 1;
    if (g.liberties === 2 && c === opp && workingMoves.length > 0) {
      for (let i = 0; i < workingMoves.length; i++) outLadderWorkingMoves[workingMoves[i]!] = 1;
    }
  }
}

export function computeLadderFeaturesV7KataGo(args: { stones: Uint8Array; koPoint: number; currentPlayer: StoneColor }): KataGoLadderFeaturesV7 {
  const ladderedStones = new Uint8Array(BOARD_AREA);
  const ladderWorkingMoves = new Uint8Array(BOARD_AREA);
  computeLadderFeaturesV7KataGoInto({ ...args, outLadderedStones: ladderedStones, outLadderWorkingMoves: ladderWorkingMoves });

  return { ladderedStones, ladderWorkingMoves };
}

export function computeLadderedStonesV7KataGoInto(args: { stones: Uint8Array; koPoint: number; outLadderedStones: Uint8Array }): void {
  const { stones, koPoint, outLadderedStones } = args;
  outLadderedStones.fill(0);

  ladderGroupSeenStamp++;
  const seenStamp = ladderGroupSeenStamp;

  const copyPos = LADDER_FEATURES_SCRATCH_V7.copyPos;
  const groupStones = LADDER_FEATURES_SCRATCH_V7.groupStones;
  const workingMoves = LADDER_FEATURES_SCRATCH_V7.workingMoves;

  for (let p = 0; p < BOARD_AREA; p++) {
    const c = stones[p] as StoneColor;
    if (c === EMPTY) continue;
    if (LADDER_GROUP_SEEN[p] === seenStamp) continue;

    const g = collectGroupAndLiberties(stones, p, c, 3);
    for (let i = 0; i < g.groupLen; i++) LADDER_GROUP_SEEN[GROUP_BUF[i]!] = seenStamp;

    if (g.liberties !== 1 && g.liberties !== 2) continue;

    groupStones.set(GROUP_BUF.subarray(0, g.groupLen));

    copyPos.stones.set(stones);
    copyPos.koPoint = koPoint;
    LADDER_SCRATCH.captureStack.length = 0;

    workingMoves.length = 0;
    let ladderedGroup = false;
    if (g.liberties === 1) ladderedGroup = searchIsLadderCaptured(copyPos, p, true, LADDER_SCRATCH);
    else ladderedGroup = searchIsLadderCapturedAttackerFirst2Libs(copyPos, p, LADDER_SCRATCH, workingMoves);

    if (!ladderedGroup) continue;
    for (let i = 0; i < g.groupLen; i++) outLadderedStones[groupStones[i]!] = 1;
  }
}

export function computeLadderedStonesV7KataGo(args: { stones: Uint8Array; koPoint: number }): Uint8Array {
  const laddered = new Uint8Array(BOARD_AREA);
  computeLadderedStonesV7KataGoInto({ ...args, outLadderedStones: laddered });
  return laddered;
}

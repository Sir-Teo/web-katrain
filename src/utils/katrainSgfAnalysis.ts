import pako from 'pako';
import { BOARD_SIZE, type AnalysisResult, type CandidateMove, type Player } from '../types';

export const KATRAIN_ANALYSIS_FORMAT_VERSION = '1.0';

export type KaTrainSgfAnalysisMain = {
  moves: Record<string, Record<string, unknown>>;
  root: Record<string, unknown> | null;
  completed?: boolean;
};

export type KaTrainSgfAnalysis = KaTrainSgfAnalysisMain & {
  ownership: number[] | null;
  policy: number[] | null;
};

function xyToGtp(x: number, y: number, boardSize: number): string {
  if (x < 0 || y < 0) return 'pass';
  const col = x >= 8 ? x + 1 : x; // Skip 'I'
  const letter = String.fromCharCode(65 + col);
  return `${letter}${boardSize - y}`;
}

function gtpToXy(move: string, boardSize: number): { x: number; y: number } {
  const t = move.trim().toUpperCase();
  if (!t || t === 'PASS') return { x: -1, y: -1 };

  const m = /^([A-T])([1-9]|1[0-9])$/.exec(t);
  if (!m) return { x: -1, y: -1 };

  const colChar = m[1]!;
  if (colChar === 'I') return { x: -1, y: -1 };
  const rawCol = colChar.charCodeAt(0) - 65;
  const x = rawCol >= 9 ? rawCol - 1 : rawCol;

  const row = parseInt(m[2]!, 10);
  const y = boardSize - row;
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return { x: -1, y: -1 };
  return { x, y };
}

function encodeBase64(bytes: Uint8Array): string {
  const BufferLike = (globalThis as unknown as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } })
    .Buffer;
  if (BufferLike) return BufferLike.from(bytes).toString('base64');
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function decodeBase64(b64: string): Uint8Array {
  const BufferLike = (
    globalThis as unknown as { Buffer?: { from: (s: string, enc: string) => { [Symbol.iterator]?: unknown } } }
  ).Buffer as unknown as { from: (s: string, enc: string) => Uint8Array } | undefined;
  if (BufferLike) return new Uint8Array(BufferLike.from(b64, 'base64'));
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

function float32ToFloat16Bits(val: number): number {
  f32[0] = val;
  const x = u32[0]!;
  const sign = (x >>> 31) & 0x1;
  const exp = (x >>> 23) & 0xff;
  const mant = x & 0x7fffff;

  // NaN / Inf
  if (exp === 0xff) {
    if (mant !== 0) return (sign << 15) | 0x7e00;
    return (sign << 15) | 0x7c00;
  }

  // Denormals and zeros in f32 map to denormals/zeros in f16.
  const halfExp = exp - 127 + 15;
  if (halfExp >= 0x1f) return (sign << 15) | 0x7c00; // overflow -> inf
  if (halfExp <= 0) {
    if (halfExp < -10) return sign << 15; // underflow -> signed zero

    // Subnormal f16. Add implicit leading 1 to mantissa.
    const mantWithHidden = mant | 0x800000;
    const shift = 14 - halfExp; // 24-10-(halfExp-1)
    let halfMant = mantWithHidden >>> shift;

    // Round to nearest even.
    const roundMask = 1 << (shift - 1);
    const roundBits = mantWithHidden & (roundMask - 1);
    const roundBit = (mantWithHidden & roundMask) !== 0;
    if (roundBit && (roundBits !== 0 || (halfMant & 1))) halfMant += 1;

    return (sign << 15) | (halfMant & 0x3ff);
  }

  // Normalized f16.
  let halfMant = mant >>> 13;
  const roundBit = (mant >>> 12) & 1;
  const roundBits = mant & 0xfff;
  if (roundBit && (roundBits !== 0 || (halfMant & 1))) {
    halfMant += 1;
    if (halfMant === 0x400) {
      // Mantissa overflow increments exponent.
      halfMant = 0;
      const nextExp = halfExp + 1;
      if (nextExp >= 0x1f) return (sign << 15) | 0x7c00;
      return (sign << 15) | (nextExp << 10) | halfMant;
    }
  }

  return (sign << 15) | (halfExp << 10) | (halfMant & 0x3ff);
}

function float16BitsToFloat32(bits: number): number {
  const sign = (bits >>> 15) & 0x1;
  const exp = (bits >>> 10) & 0x1f;
  const mant = bits & 0x3ff;

  if (exp === 0) {
    if (mant === 0) return sign ? -0 : 0;
    const v = mant / 1024;
    return (sign ? -1 : 1) * v * Math.pow(2, -14);
  }
  if (exp === 0x1f) return mant ? NaN : sign ? -Infinity : Infinity;

  const v = 1 + mant / 1024;
  return (sign ? -1 : 1) * v * Math.pow(2, exp - 15);
}

function packFloat16(values: ArrayLike<number> | null): Uint8Array {
  if (!values || values.length === 0) return new Uint8Array(0);
  const out = new Uint8Array(values.length * 2);
  for (let i = 0; i < values.length; i++) {
    const bits = float32ToFloat16Bits(values[i]!);
    out[i * 2] = bits & 0xff;
    out[i * 2 + 1] = (bits >>> 8) & 0xff;
  }
  return out;
}

function unpackFloat16(bytes: Uint8Array, count: number): number[] | null {
  if (!bytes || bytes.length === 0) return null;
  if (bytes.length < count * 2) return null;
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const bits = bytes[i * 2]! | (bytes[i * 2 + 1]! << 8);
    out[i] = float16BitsToFloat32(bits);
  }
  return out;
}

function flattenTerritoryToOwnership(territory: number[][], boardSize: number): number[] {
  const out = new Array<number>(boardSize * boardSize);
  let k = 0;
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) out[k++] = territory[y]?.[x] ?? 0;
  }
  return out;
}

export function encodeKaTrainKtFromAnalysis(args: { analysis: AnalysisResult; boardSize?: number }): string[] {
  const boardSize = args.boardSize ?? BOARD_SIZE;
  const boardSquares = boardSize * boardSize;

  const ownership = flattenTerritoryToOwnership(args.analysis.territory, boardSize).slice(0, boardSquares);
  const policy = (args.analysis.policy ?? []).slice(0, boardSquares + 1);

  const moves: Record<string, Record<string, unknown>> = {};
  for (const m of args.analysis.moves) {
    const move = xyToGtp(m.x, m.y, boardSize);
    moves[move] = {
      move,
      order: m.order,
      visits: m.visits,
      winrate: m.winRate,
      scoreLead: m.scoreLead,
      scoreSelfplay: m.scoreSelfplay,
      scoreStdev: m.scoreStdev,
      prior: m.prior,
      pv: m.pv,
    };
  }

  const approxVisits = args.analysis.moves.reduce((acc, m) => acc + (m.visits || 0), 0);
  const root = {
    visits: approxVisits,
    winrate: args.analysis.rootWinRate,
    scoreLead: args.analysis.rootScoreLead,
    scoreSelfplay: args.analysis.rootScoreSelfplay,
    scoreStdev: args.analysis.rootScoreStdev,
  };

  const main: KaTrainSgfAnalysisMain = {
    moves,
    root,
    completed: true,
  };

  const ownershipPacked = packFloat16(ownership);
  const policyPacked = packFloat16(policy);
  const mainBytes = new TextEncoder().encode(JSON.stringify(main));

  return [ownershipPacked, policyPacked, mainBytes].map((b) => encodeBase64(pako.gzip(b)));
}

export function decodeKaTrainKt(args: { kt: string[]; boardSize?: number }): KaTrainSgfAnalysis | null {
  const boardSize = args.boardSize ?? BOARD_SIZE;
  const boardSquares = boardSize * boardSize;
  const kt = args.kt;
  if (!kt || kt.length < 3) return null;

  try {
    const ownershipBytes = pako.ungzip(decodeBase64(kt[0]!));
    const policyBytes = pako.ungzip(decodeBase64(kt[1]!));
    const mainBytes = pako.ungzip(decodeBase64(kt[2]!));

    const ownership = unpackFloat16(ownershipBytes, boardSquares);
    const policy = unpackFloat16(policyBytes, boardSquares + 1);

    const mainJson = new TextDecoder().decode(mainBytes);
    const main = JSON.parse(mainJson) as KaTrainSgfAnalysisMain;

    return {
      ...main,
      ownership,
      policy,
    };
  } catch {
    return null;
  }
}

function ownershipToGrid(ownership: ArrayLike<number> | null, boardSize: number): number[][] {
  const grid: number[][] = Array(boardSize)
    .fill(0)
    .map(() => Array(boardSize).fill(0));
  if (!ownership) return grid;
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) grid[y]![x] = ownership[y * boardSize + x] ?? 0;
  }
  return grid;
}

function bestScoreLeadForMoves(moves: CandidateMove[], rootScoreLead: number): number {
  const top = moves.find((m) => m.order === 0);
  if (top) return top.scoreLead;
  let best = rootScoreLead;
  for (const m of moves) {
    if (m.visits <= 0) continue;
    if (m.order === 0) return m.scoreLead;
    if (m.scoreLead > best) best = m.scoreLead;
  }
  return best;
}

function computePointsLost(args: { currentPlayer: Player; bestScoreLead: number; scoreLead: number }): number {
  return args.currentPlayer === 'black'
    ? args.bestScoreLead - args.scoreLead
    : args.scoreLead - args.bestScoreLead;
}

export function kaTrainAnalysisToAnalysisResult(args: {
  analysis: KaTrainSgfAnalysis;
  currentPlayer: Player;
  boardSize?: number;
}): AnalysisResult | null {
  const boardSize = args.boardSize ?? BOARD_SIZE;
  const a = args.analysis;
  const root = a.root as { winrate?: number; scoreLead?: number; scoreSelfplay?: number; scoreStdev?: number } | null;
  if (!root) return null;

  const rootWinRate = typeof root.winrate === 'number' ? root.winrate : 0.5;
  const rootScoreLead = typeof root.scoreLead === 'number' ? root.scoreLead : 0;
  const rootScoreSelfplay = typeof root.scoreSelfplay === 'number' ? root.scoreSelfplay : rootScoreLead;
  const rootScoreStdev = typeof root.scoreStdev === 'number' ? root.scoreStdev : 0;

  const moveRows = Object.values(a.moves ?? {}) as Array<{
    move?: string;
    order?: number;
    visits?: number;
    winrate?: number;
    scoreLead?: number;
    scoreSelfplay?: number;
    scoreStdev?: number;
    prior?: number;
    pv?: string[];
  }>;

  const moves: CandidateMove[] = moveRows
    .map((m) => {
      const move = typeof m.move === 'string' ? m.move : 'pass';
      const { x, y } = gtpToXy(move, boardSize);
      return {
        x,
        y,
        order: typeof m.order === 'number' ? m.order : 999,
        visits: typeof m.visits === 'number' ? m.visits : 0,
        winRate: typeof m.winrate === 'number' ? m.winrate : rootWinRate,
        scoreLead: typeof m.scoreLead === 'number' ? m.scoreLead : rootScoreLead,
        scoreSelfplay: typeof m.scoreSelfplay === 'number' ? m.scoreSelfplay : rootScoreSelfplay,
        scoreStdev: typeof m.scoreStdev === 'number' ? m.scoreStdev : rootScoreStdev,
        pointsLost: 0,
        prior: typeof m.prior === 'number' ? m.prior : undefined,
        pv: Array.isArray(m.pv) ? m.pv : undefined,
      };
    })
    .filter((m) => m.x === -1 || (m.x >= 0 && m.x < boardSize && m.y >= 0 && m.y < boardSize));

  moves.sort((x, y) => x.order - y.order || y.visits - x.visits);

  const bestScoreLead = bestScoreLeadForMoves(moves, rootScoreLead);
  for (const m of moves) {
    m.pointsLost = computePointsLost({ currentPlayer: args.currentPlayer, bestScoreLead, scoreLead: m.scoreLead });
  }

  return {
    rootWinRate,
    rootScoreLead,
    rootScoreSelfplay,
    rootScoreStdev,
    moves,
    territory: ownershipToGrid(a.ownership, boardSize),
    policy: a.policy ?? undefined,
    ownershipStdev: undefined,
  };
}

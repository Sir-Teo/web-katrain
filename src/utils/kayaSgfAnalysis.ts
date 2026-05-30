import { DEFAULT_BOARD_SIZE, type AnalysisResult, type BoardSize, type CandidateMove, type Player } from '../types';

export const KAYA_ANALYSIS_PROPERTY = 'KA';

export interface KayaSgfAnalysisMove {
  m: string;
  p: number;
  w?: number;
  s?: number;
  v?: number;
}

export interface KayaSgfAnalysisData {
  w: number;
  s: number;
  v?: number;
  m: KayaSgfAnalysisMove[];
  o?: string;
}

const OWNERSHIP_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+$';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function xyToGtp(x: number, y: number, boardSize: BoardSize): string {
  if (x < 0 || y < 0) return 'pass';
  const col = x >= 8 ? x + 1 : x;
  const letter = String.fromCharCode(65 + col);
  return `${letter}${boardSize - y}`;
}

function gtpToXy(move: string, boardSize: BoardSize): { x: number; y: number } {
  const t = move.trim().toUpperCase();
  if (!t || t === 'PASS') return { x: -1, y: -1 };

  const match = /^([A-T])([1-9]|1[0-9])$/.exec(t);
  if (!match) return { x: -1, y: -1 };

  const colChar = match[1]!;
  if (colChar === 'I') return { x: -1, y: -1 };
  const rawCol = colChar.charCodeAt(0) - 65;
  const x = rawCol >= 9 ? rawCol - 1 : rawCol;
  const y = boardSize - Number.parseInt(match[2]!, 10);
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return { x: -1, y: -1 };
  return { x, y };
}

function flattenTerritory(territory: number[][], boardSize: BoardSize): number[] {
  const out = new Array<number>(boardSize * boardSize);
  let i = 0;
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) out[i++] = territory[y]?.[x] ?? 0;
  }
  return out;
}

export function encodeKayaOwnership(ownership: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < ownership.length; i++) {
    const clamped = Math.max(-1, Math.min(1, ownership[i] ?? 0));
    const quantized = Math.floor((clamped + 1) * 31.5);
    out += OWNERSHIP_CHARS[quantized] ?? '0';
  }
  return out;
}

export function decodeKayaOwnership(encoded: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const idx = OWNERSHIP_CHARS.indexOf(encoded[i]!);
    out.push(idx < 0 ? 0 : idx / 31.5 - 1);
  }
  return out;
}

function ownershipToGrid(ownership: ArrayLike<number> | null, boardSize: BoardSize): number[][] {
  const grid = Array.from({ length: boardSize }, () => Array(boardSize).fill(0) as number[]);
  if (!ownership) return grid;
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) grid[y]![x] = ownership[y * boardSize + x] ?? 0;
  }
  return grid;
}

function candidatePrior(candidate: CandidateMove, policy: AnalysisResult['policy'], boardSize: BoardSize): number {
  if (typeof candidate.prior === 'number' && Number.isFinite(candidate.prior)) return clamp01(candidate.prior);
  if (policy) {
    const idx = candidate.x < 0 || candidate.y < 0 ? boardSize * boardSize : candidate.y * boardSize + candidate.x;
    const p = policy[idx];
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) return clamp01(p);
  }
  return 0;
}

export function encodeKayaKaFromAnalysis(args: { analysis: AnalysisResult; boardSize?: BoardSize }): string {
  const boardSize = args.boardSize ?? DEFAULT_BOARD_SIZE;
  const analysis = args.analysis;
  const data: KayaSgfAnalysisData = {
    w: round(clamp01(analysis.rootWinRate), 4),
    s: round(analysis.rootScoreLead, 2),
    m: analysis.moves.map((move) => ({
      m: xyToGtp(move.x, move.y, boardSize),
      p: round(candidatePrior(move, analysis.policy, boardSize), 4),
      w: round(clamp01(move.winRate), 4),
      s: round(move.scoreLead, 2),
      v: Math.max(0, Math.floor(move.visits || 0)),
    })),
  };
  if (typeof analysis.rootVisits === 'number' && Number.isFinite(analysis.rootVisits)) {
    data.v = Math.max(0, Math.floor(analysis.rootVisits));
  }
  if ((analysis.ownershipMode ?? 'root') !== 'none' && analysis.territory.length > 0) {
    data.o = encodeKayaOwnership(flattenTerritory(analysis.territory, boardSize));
  }
  return JSON.stringify(data);
}

export function decodeKayaKa(args: {
  ka: string[] | string | undefined;
  boardSize?: BoardSize;
  currentPlayer: Player;
}): AnalysisResult | null {
  const raw = Array.isArray(args.ka) ? args.ka[0] : args.ka;
  if (!raw) return null;

  const boardSize = args.boardSize ?? DEFAULT_BOARD_SIZE;
  try {
    const data = JSON.parse(raw) as KayaSgfAnalysisData;
    if (typeof data.w !== 'number' || typeof data.s !== 'number' || !Array.isArray(data.m)) return null;

    const rootWinRate = clamp01(data.w);
    const rootScoreLead = data.s;
    const sign = args.currentPlayer === 'black' ? 1 : -1;
    const policy = new Array<number>(boardSize * boardSize + 1).fill(-1);

    const moves: CandidateMove[] = data.m
      .map((item, order) => {
        const { x, y } = gtpToXy(item.m, boardSize);
        const idx = x < 0 || y < 0 ? boardSize * boardSize : y * boardSize + x;
        const prior = typeof item.p === 'number' && Number.isFinite(item.p) ? clamp01(item.p) : 0;
        policy[idx] = prior;
        const scoreLead = typeof item.s === 'number' && Number.isFinite(item.s) ? item.s : rootScoreLead;
        const winRate = typeof item.w === 'number' && Number.isFinite(item.w) ? clamp01(item.w) : rootWinRate;
        return {
          x,
          y,
          order,
          visits: typeof item.v === 'number' && Number.isFinite(item.v) ? Math.max(0, Math.floor(item.v)) : 0,
          winRate,
          winRateLost: sign * (rootWinRate - winRate),
          scoreLead,
          scoreSelfplay: scoreLead,
          scoreStdev: 0,
          pointsLost: sign * (rootScoreLead - scoreLead),
          relativePointsLost: 0,
          prior,
        };
      })
      .filter((move) => move.x === -1 || (move.x >= 0 && move.x < boardSize && move.y >= 0 && move.y < boardSize));

    const topScoreLead = moves[0]?.scoreLead ?? rootScoreLead;
    for (const move of moves) move.relativePointsLost = sign * (topScoreLead - move.scoreLead);

    const ownership = data.o ? decodeKayaOwnership(data.o).slice(0, boardSize * boardSize) : null;

    return {
      rootWinRate,
      rootScoreLead,
      rootScoreSelfplay: rootScoreLead,
      rootScoreStdev: 0,
      rootVisits: typeof data.v === 'number' && Number.isFinite(data.v) ? Math.max(0, Math.floor(data.v)) : undefined,
      moves,
      territory: ownershipToGrid(ownership, boardSize),
      policy,
      ownershipMode: ownership ? 'root' : 'none',
    };
  } catch {
    return null;
  }
}

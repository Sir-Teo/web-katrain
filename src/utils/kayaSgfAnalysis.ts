import { DEFAULT_BOARD_SIZE, type AnalysisResult, type BoardSize, type CandidateMove, type Player } from '../types';
import { formatGtpMove } from '../lib/gtp';
import { anyInvalidField, importedPrior, importedScore, importedVisits, importedWinRate } from './importedAnalysisValues';

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

function gtpToXy(move: unknown, boardSize: BoardSize): { x: number; y: number; valid: boolean } {
  if (typeof move !== 'string') return { x: -1, y: -1, valid: false };
  const t = move.trim().toUpperCase();
  if (t === 'PASS') return { x: -1, y: -1, valid: true };
  if (!t) return { x: -1, y: -1, valid: false };

  const match = /^([A-T])([1-9]|1[0-9])$/.exec(t);
  if (!match) return { x: -1, y: -1, valid: false };

  const colChar = match[1]!;
  if (colChar === 'I') return { x: -1, y: -1, valid: false };
  const rawCol = colChar.charCodeAt(0) - 65;
  const x = rawCol >= 9 ? rawCol - 1 : rawCol;
  const y = boardSize - Number.parseInt(match[2]!, 10);
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return { x: -1, y: -1, valid: false };
  return { x, y, valid: true };
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
      m: formatGtpMove(move.x, move.y, boardSize),
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
    const data = JSON.parse(raw) as Partial<KayaSgfAnalysisData> | null;
    if (!data || typeof data !== 'object' || !Array.isArray(data.m)) return null;
    // `JSON.parse('1e999')` is Infinity: root values must be finite and in range.
    const rootWinRate = importedWinRate(data.w);
    const rootScoreLead = importedScore(data.s, boardSize);
    if (rootWinRate === null || rootScoreLead === null) return null;
    const rootVisits = importedVisits(data.v);
    if (anyInvalidField([data.v, rootVisits])) return null;

    const sign = args.currentPlayer === 'black' ? 1 : -1;
    const policy = new Array<number>(boardSize * boardSize + 1).fill(-1);

    const moves: CandidateMove[] = [];
    for (const rawItem of data.m as unknown[]) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const item = rawItem as Record<string, unknown>;
      const { x, y, valid } = gtpToXy(item.m, boardSize);
      if (!valid) continue;
      const priorRaw = importedPrior(item.p);
      const scoreLeadRaw = importedScore(item.s, boardSize);
      const winRateRaw = importedWinRate(item.w);
      const visitsRaw = importedVisits(item.v);
      if (anyInvalidField([item.p, priorRaw], [item.s, scoreLeadRaw], [item.w, winRateRaw], [item.v, visitsRaw])) continue;
      const idx = x < 0 || y < 0 ? boardSize * boardSize : y * boardSize + x;
      const prior = priorRaw ?? 0;
      policy[idx] = prior;
      const scoreLead = scoreLeadRaw ?? rootScoreLead;
      const winRate = winRateRaw ?? rootWinRate;
      moves.push({
        x,
        y,
        order: moves.length,
        visits: visitsRaw ?? 0,
        winRate,
        winRateLost: sign * (rootWinRate - winRate),
        scoreLead,
        scoreSelfplay: scoreLead,
        scoreStdev: 0,
        pointsLost: sign * (rootScoreLead - scoreLead),
        relativePointsLost: 0,
        prior,
      });
    }

    const topScoreLead = moves[0]?.scoreLead ?? rootScoreLead;
    for (const move of moves) move.relativePointsLost = sign * (topScoreLead - move.scoreLead);

    const ownership = typeof data.o === 'string' && data.o ? decodeKayaOwnership(data.o).slice(0, boardSize * boardSize) : null;

    return {
      rootWinRate,
      rootScoreLead,
      rootScoreSelfplay: rootScoreLead,
      rootScoreStdev: 0,
      rootVisits: rootVisits ?? undefined,
      moves,
      territory: ownershipToGrid(ownership, boardSize),
      policy,
      ownershipMode: ownership ? 'root' : 'none',
    };
  } catch {
    return null;
  }
}

import type { BoardState, Player } from '../types';
import { applyCapturesInPlace, getLegalMoves, isEye } from './gameLogic';
import { formatResultScoreLead } from './manualScore';

export type ScoringOwner = -1 | 0 | 1;

export interface TerritoryScore {
  territory: ScoringOwner[][];
  blackTerritory: number;
  whiteTerritory: number;
  neutralPoints: number;
}

export interface ManualScoreEstimate extends TerritoryScore {
  blackDeadStones: number;
  whiteDeadStones: number;
  blackScore: number;
  whiteScore: number;
  scoreLead: number;
  result: string;
}

type Point = { x: number; y: number };

export interface PlayoutDeadStoneEstimateOptions {
  currentPlayer?: Player;
  iterations?: number;
  maxMoves?: number;
  seed?: number;
  threshold?: number;
}

export function scoringPointKey(x: number, y: number): string {
  return `${x},${y}`;
}

function opponent(player: Player): Player {
  return player === 'black' ? 'white' : 'black';
}

function ownerForPlayer(player: Player): ScoringOwner {
  return player === 'black' ? 1 : -1;
}

function playerForOwner(owner: ScoringOwner): Player | null {
  if (owner === 1) return 'black';
  if (owner === -1) return 'white';
  return null;
}

function isOnBoard(board: BoardState, x: number, y: number): boolean {
  return y >= 0 && y < board.length && x >= 0 && x < (board[y]?.length ?? 0);
}

function neighbors(board: BoardState, x: number, y: number): Point[] {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].filter((p) => isOnBoard(board, p.x, p.y));
}

export function getConnectedStoneChain(board: BoardState, x: number, y: number): Point[] {
  const color = board[y]?.[x] ?? null;
  if (!color) return [];

  const out: Point[] = [];
  const seen = new Set<string>();
  const stack: Point[] = [{ x, y }];

  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = scoringPointKey(point.x, point.y);
    if (seen.has(key)) continue;
    seen.add(key);
    if (board[point.y]?.[point.x] !== color) continue;
    out.push(point);

    for (const n of neighbors(board, point.x, point.y)) {
      if (!seen.has(scoringPointKey(n.x, n.y)) && board[n.y]?.[n.x] === color) {
        stack.push(n);
      }
    }
  }

  return out;
}

export function toggleDeadStoneChain(board: BoardState, deadStones: ReadonlySet<string>, x: number, y: number): Set<string> {
  const chain = getConnectedStoneChain(board, x, y);
  if (chain.length === 0) return new Set(deadStones);

  const next = new Set(deadStones);
  const shouldMarkDead = !deadStones.has(scoringPointKey(chain[0]!.x, chain[0]!.y));
  for (const point of chain) {
    const key = scoringPointKey(point.x, point.y);
    if (shouldMarkDead) next.add(key);
    else next.delete(key);
  }
  return next;
}

export function estimateDeadStonesFromOwnership(
  board: BoardState,
  ownership: readonly (readonly number[])[],
  threshold = 0.6
): Set<string> {
  const deadStones = new Set<string>();
  const visitedChains = new Set<string>();
  const safeThreshold = Number.isFinite(threshold) ? Math.max(0, Math.min(1, threshold)) : 0.6;

  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < (board[y]?.length ?? 0); x++) {
      const stone = board[y]?.[x] ?? null;
      if (!stone) continue;

      const key = scoringPointKey(x, y);
      if (visitedChains.has(key)) continue;

      const chain = getConnectedStoneChain(board, x, y);
      let opponentOwnership = 0;
      for (const point of chain) {
        const owner = ownership[point.y]?.[point.x] ?? 0;
        opponentOwnership += stone === 'black' ? -owner : owner;
      }
      opponentOwnership /= Math.max(1, chain.length);

      for (const point of chain) visitedChains.add(scoringPointKey(point.x, point.y));
      if (opponentOwnership < safeThreshold) continue;

      for (const point of chain) deadStones.add(scoringPointKey(point.x, point.y));
    }
  }

  return deadStones;
}

function cloneBoard(board: BoardState): BoardState {
  return board.map((row) => [...row]);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function boardShapeSeed(board: BoardState): number {
  let seed = 0x9e3779b9 ^ board.length;
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < (board[y]?.length ?? 0); x++) {
      const stone = board[y]?.[x] ?? null;
      if (!stone) continue;
      const value = stone === 'black' ? 0x45d9f3b : 0x119de1f3;
      seed = Math.imul(seed ^ value ^ ((x + 1) * 73856093) ^ ((y + 1) * 19349663), 2654435761);
    }
  }
  return seed >>> 0;
}

function collectOriginalStoneKeys(board: BoardState): Map<string, Player> {
  const stones = new Map<string, Player>();
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < (board[y]?.length ?? 0); x++) {
      const stone = board[y]?.[x] ?? null;
      if (stone) stones.set(scoringPointKey(x, y), stone);
    }
  }
  return stones;
}

function choosePlayoutMove(
  board: BoardState,
  player: Player,
  previousBoard: BoardState | undefined,
  random: () => number
): Point | null {
  const moves = getLegalMoves(board, player, previousBoard)
    .filter((move) => !isEye(board, move.x, move.y, player));
  if (moves.length === 0) return null;

  const captures: Point[] = [];
  for (const move of moves) {
    const tentative = cloneBoard(board);
    tentative[move.y]![move.x] = player;
    if (applyCapturesInPlace(tentative, move.x, move.y, player).length > 0) {
      captures.push(move);
    }
  }

  const pool = captures.length > 0 ? captures : moves;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

export function estimateDeadStonesByPlayout(
  board: BoardState,
  options: PlayoutDeadStoneEstimateOptions = {}
): Set<string> {
  const originalStones = collectOriginalStoneKeys(board);
  if (originalStones.size === 0) return new Set();

  const boardArea = board.reduce((sum, row) => sum + row.length, 0);
  const iterations = Math.max(1, Math.min(96, Math.floor(options.iterations ?? (board.length <= 9 ? 48 : board.length <= 13 ? 32 : 20))));
  const defaultMaxMoves = board.length <= 9 ? 4 : board.length <= 13 ? 6 : 8;
  const maxMoves = Math.max(1, Math.min(boardArea, Math.floor(options.maxMoves ?? defaultMaxMoves)));
  const threshold = Math.max(0.05, Math.min(0.95, options.threshold ?? 0.55));
  const random = createSeededRandom(options.seed ?? boardShapeSeed(board));
  const capturedCounts = new Map<string, number>();

  for (let i = 0; i < iterations; i++) {
    const playoutBoard = cloneBoard(board);
    const capturedOriginals = new Set<string>();
    let player = options.currentPlayer ?? (i % 2 === 0 ? 'black' : 'white');
    let previousBoard: BoardState | undefined;
    let consecutivePasses = 0;

    for (let moveIndex = 0; moveIndex < maxMoves && consecutivePasses < 2; moveIndex++) {
      const move = choosePlayoutMove(playoutBoard, player, previousBoard, random);
      if (!move) {
        consecutivePasses++;
        player = opponent(player);
        previousBoard = undefined;
        continue;
      }

      const beforeMove = cloneBoard(playoutBoard);
      playoutBoard[move.y]![move.x] = player;
      const captured = applyCapturesInPlace(playoutBoard, move.x, move.y, player);
      for (const point of captured) {
        const key = scoringPointKey(point.x, point.y);
        if (originalStones.has(key)) capturedOriginals.add(key);
      }

      consecutivePasses = 0;
      previousBoard = beforeMove;
      player = opponent(player);
    }

    for (const key of capturedOriginals) {
      const [xRaw, yRaw] = key.split(',');
      const x = Number.parseInt(xRaw ?? '', 10);
      const y = Number.parseInt(yRaw ?? '', 10);
      const originalStone = originalStones.get(key);
      if (!originalStone || playoutBoard[y]?.[x] === originalStone) continue;
      capturedCounts.set(key, (capturedCounts.get(key) ?? 0) + 1);
    }
  }

  const deadStones = new Set<string>();
  for (const [key] of originalStones) {
    if ((capturedCounts.get(key) ?? 0) / iterations >= threshold) deadStones.add(key);
  }
  return deadStones;
}

function floodEmptyRegion(board: BoardState, deadStones: ReadonlySet<string>, start: Point, visited: Set<string>): Point[] {
  const region: Point[] = [];
  const stack: Point[] = [start];

  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = scoringPointKey(point.x, point.y);
    if (visited.has(key)) continue;
    visited.add(key);

    const stone = board[point.y]?.[point.x] ?? null;
    if (stone && !deadStones.has(key)) continue;

    region.push(point);
    for (const n of neighbors(board, point.x, point.y)) {
      const nKey = scoringPointKey(n.x, n.y);
      const nStone = board[n.y]?.[n.x] ?? null;
      if (!visited.has(nKey) && (!nStone || deadStones.has(nKey))) {
        stack.push(n);
      }
    }
  }

  return region;
}

function determineRegionOwner(board: BoardState, deadStones: ReadonlySet<string>, region: Point[]): ScoringOwner {
  let touchesBlack = false;
  let touchesWhite = false;

  for (const point of region) {
    for (const n of neighbors(board, point.x, point.y)) {
      const key = scoringPointKey(n.x, n.y);
      const stone = board[n.y]?.[n.x] ?? null;
      if (!stone || deadStones.has(key)) continue;
      if (stone === 'black') touchesBlack = true;
      else touchesWhite = true;
    }
  }

  if (touchesBlack && !touchesWhite) return 1;
  if (touchesWhite && !touchesBlack) return -1;
  return 0;
}

export function calculateTerritoryScore(board: BoardState, deadStones: ReadonlySet<string>): TerritoryScore {
  const territory: ScoringOwner[][] = board.map((row) => row.map(() => 0));
  const visited = new Set<string>();
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let neutralPoints = 0;

  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < (board[y]?.length ?? 0); x++) {
      const key = scoringPointKey(x, y);
      const stone = board[y]?.[x] ?? null;
      if ((stone && !deadStones.has(key)) || visited.has(key)) continue;

      const region = floodEmptyRegion(board, deadStones, { x, y }, visited);
      const owner = determineRegionOwner(board, deadStones, region);
      for (const point of region) {
        territory[point.y]![point.x] = owner;
      }

      if (owner === 1) blackTerritory += region.length;
      else if (owner === -1) whiteTerritory += region.length;
      else neutralPoints += region.length;
    }
  }

  return { territory, blackTerritory, whiteTerritory, neutralPoints };
}

export function countDeadStones(board: BoardState, deadStones: ReadonlySet<string>): { blackDeadStones: number; whiteDeadStones: number } {
  let blackDeadStones = 0;
  let whiteDeadStones = 0;

  for (const key of deadStones) {
    const [xRaw, yRaw] = key.split(',');
    const x = Number.parseInt(xRaw ?? '', 10);
    const y = Number.parseInt(yRaw ?? '', 10);
    const stone = Number.isFinite(x) && Number.isFinite(y) ? board[y]?.[x] ?? null : null;
    if (stone === 'black') blackDeadStones++;
    else if (stone === 'white') whiteDeadStones++;
  }

  return { blackDeadStones, whiteDeadStones };
}

export function computeManualScoreEstimate(args: {
  board: BoardState;
  komi: number;
  capturedBlack: number;
  capturedWhite: number;
  deadStones: ReadonlySet<string>;
}): ManualScoreEstimate {
  const territoryScore = calculateTerritoryScore(args.board, args.deadStones);
  const deadCounts = countDeadStones(args.board, args.deadStones);

  const blackScore = territoryScore.blackTerritory + args.capturedWhite + deadCounts.whiteDeadStones;
  const whiteScore = territoryScore.whiteTerritory + args.capturedBlack + deadCounts.blackDeadStones + args.komi;
  const scoreLead = Math.round((blackScore - whiteScore) * 10) / 10;

  return {
    ...territoryScore,
    ...deadCounts,
    blackScore,
    whiteScore,
    scoreLead,
    result: formatResultScoreLead(scoreLead),
  };
}

export function getTerritoryOwnerForDeadStone(stone: Player): ScoringOwner {
  return ownerForPlayer(opponent(stone));
}

export function getTerritoryOwnerPlayer(owner: ScoringOwner): Player | null {
  return playerForOwner(owner);
}

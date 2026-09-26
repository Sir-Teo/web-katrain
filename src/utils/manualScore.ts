import type { BoardState } from '../types';

const LO_THRESHOLD = 0.15;
const HI_THRESHOLD = 0.85;
const MAX_UNKNOWN = 10;
const maxDame = (boardSize: number) => 4 * (boardSize + boardSize);

/**
 * Nearest half point, rounding the margin rather than the signed lead:
 * Math.round takes halves toward +infinity, so a lead of 0.75 was B+1.0 while
 * the same lead for White was W+0.5, and -0.25 was Jigo where +0.25 was B+0.5.
 */
export function roundToHalf(x: number): number {
  const rounded = Math.sign(x) * (Math.round(Math.abs(x) * 2) / 2);
  return rounded === 0 ? 0 : rounded;
}

export function formatResultScoreLead(scoreLead: number): string {
  // Round the margin, not the signed lead: Math.round takes halves toward
  // +infinity, so the same lead read B+0.2 for Black and W+0.1 for White,
  // and -0.05 was Jigo while +0.05 was B+0.1.
  const roundedScoreLead = Math.sign(scoreLead) * (Math.round(Math.abs(scoreLead) * 10) / 10);
  if (Object.is(roundedScoreLead, 0) || Object.is(roundedScoreLead, -0)) return 'Jigo';

  const leadingPlayer = roundedScoreLead > 0 ? 'B' : 'W';
  return `${leadingPlayer}+${Math.abs(roundedScoreLead).toFixed(1)}`;
}

/** SGF writes a draw as RE[0] (or RE[Draw]); 'Jigo' is only how we say it. */
export function toSgfResult(result: string): string {
  return /^\s*jigo\s*$/i.test(result) ? '0' : result;
}

/**
 * A result the game records, as the result chip should show it, or null for
 * no result. A draw -- RE[0], RE[Draw], or the Jigo a count once stored -- is
 * a result too; accepting only strings with a '+' showed the engine's guess
 * with a question mark over a recorded draw.
 */
export function readRecordedResult(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.includes('+')) return trimmed;
  if (/^(0|draw|jigo)$/i.test(trimmed)) return 'Jigo';
  return null;
}

export function computeJapaneseManualScoreFromOwnership(args: {
  board: BoardState;
  komi: number;
  capturedBlack: number; // prisoners of black (captured by white)
  capturedWhite: number; // prisoners of white (captured by black)
  currentOwnership: number[][];
  previousOwnership: number[][];
}): string | null {
  const { board, komi, capturedBlack, capturedWhite, currentOwnership, previousOwnership } = args;
  const boardSize = board.length;

  let countNeg2 = 0;
  let countNeg1 = 0;
  let count0 = 0;
  let count1 = 0;
  let count2 = 0;
  let unknown = 0;
  let numStones = 0;

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const stone = board[y]?.[x] ?? null;
      if (stone) numStones++;

      const c = currentOwnership[y]?.[x];
      const p = previousOwnership[y]?.[x];
      if (!Number.isFinite(c) || !Number.isFinite(p)) {
        unknown++;
        continue;
      }
      const owner = (c + p) / 2;

      let t: number;
      if (
        (stone === 'black' && owner > HI_THRESHOLD) ||
        (stone === 'white' && owner < -HI_THRESHOLD) ||
        Math.abs(owner) < LO_THRESHOLD
      ) {
        t = 0;
      } else if (!stone && Math.abs(owner) >= HI_THRESHOLD) {
        t = Math.round(owner);
      } else if (
        (stone === 'black' && owner < -HI_THRESHOLD) ||
        (stone === 'white' && owner > HI_THRESHOLD)
      ) {
        t = 2 * Math.round(owner);
      } else {
        t = Number.NaN;
      }

      if (!Number.isFinite(t)) {
        unknown++;
      } else if (t === -2) {
        countNeg2++;
      } else if (t === -1) {
        countNeg1++;
      } else if (t === 0) {
        count0++;
      } else if (t === 1) {
        count1++;
      } else if (t === 2) {
        count2++;
      } else {
        unknown++;
      }
    }
  }

  const dame = count0 - numStones;
  if (unknown > MAX_UNKNOWN) return null;
  if (dame > maxDame(boardSize)) return null;

  const scoreLead =
    -2 * countNeg2 +
    -1 * countNeg1 +
    0 * count0 +
    1 * count1 +
    2 * count2 +
    capturedWhite -
    capturedBlack -
    komi;

  return formatResultScoreLead(scoreLead);
}

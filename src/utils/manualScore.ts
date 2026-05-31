import type { BoardState } from '../types';

const LO_THRESHOLD = 0.15;
const HI_THRESHOLD = 0.85;
const MAX_UNKNOWN = 10;
const maxDame = (boardSize: number) => 4 * (boardSize + boardSize);

export function roundToHalf(x: number): number {
  return Math.round(x * 2) / 2;
}

export function formatResultScoreLead(scoreLead: number): string {
  const roundedScoreLead = Math.round(scoreLead * 10) / 10;
  if (Object.is(roundedScoreLead, 0) || Object.is(roundedScoreLead, -0)) return 'Jigo';

  const leadingPlayer = roundedScoreLead > 0 ? 'B' : 'W';
  return `${leadingPlayer}+${Math.abs(roundedScoreLead).toFixed(1)}`;
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

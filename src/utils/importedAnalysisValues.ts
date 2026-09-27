import { MAX_KOMI } from './komiInput';

/**
 * Checks for numbers read out of analysis another program stored in an SGF
 * (KaTrain's KT, Kaya's KA). `JSON.parse('1e999')` is Infinity and a float16
 * tensor can hold NaN or Inf, and either one, once stored as a node's score,
 * turns the graph, the points-lost figures and every later export into
 * nonsense. Each check returns the value when it is finite and in range, and
 * null otherwise, so callers decide whether to drop the row or fall back.
 */

/** A lead can be no larger than the whole board plus the largest komi a file may declare. */
export function maxImportedScore(boardSize: number): number {
  return boardSize * boardSize + MAX_KOMI;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function importedWinRate(value: unknown): number | null {
  const v = finite(value);
  return v !== null && v >= 0 && v <= 1 ? v : null;
}

export function importedScore(value: unknown, boardSize: number): number | null {
  const v = finite(value);
  return v !== null && Math.abs(v) <= maxImportedScore(boardSize) ? v : null;
}

export function importedScoreStdev(value: unknown, boardSize: number): number | null {
  const v = finite(value);
  return v !== null && v >= 0 && v <= maxImportedScore(boardSize) ? v : null;
}

export function importedVisits(value: unknown): number | null {
  const v = finite(value);
  return v !== null && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? Math.floor(v) : null;
}

export function importedPrior(value: unknown): number | null {
  const v = finite(value);
  return v !== null && v >= 0 && v <= 1 ? v : null;
}

export function importedOrder(value: unknown): number | null {
  const v = finite(value);
  return v !== null && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? Math.floor(v) : null;
}

/**
 * Pairs each raw field with its checked value and reports whether any field
 * was present (not undefined or null) but failed its check. A missing field
 * may take a default; a present, broken one means the record is corrupt.
 */
export function anyInvalidField(...fields: Array<readonly [raw: unknown, checked: unknown]>): boolean {
  return fields.some(([raw, checked]) => raw !== undefined && raw !== null && checked === null);
}

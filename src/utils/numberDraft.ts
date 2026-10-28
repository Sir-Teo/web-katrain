/** Decimal text only: blank, unfinished signs, exponents and hex are not edits. */
export function parseDecimalDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function parseIntegerDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

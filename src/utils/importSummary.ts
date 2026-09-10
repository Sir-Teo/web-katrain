export function formatRestoredAnalysisSuffix(count: number): string {
  const normalized = Math.floor(count);
  if (!Number.isFinite(count) || normalized <= 0) return '';
  if (normalized === 1) return 'with 1 restored analysis';
  return `with ${normalized} restored analyses`;
}

export function appendRestoredAnalysisSummary(message: string, count: number): string {
  const suffix = formatRestoredAnalysisSuffix(count);
  if (!suffix) return message;
  const trimmed = message.trim().replace(/[.!?]+$/, '');
  return `${trimmed} ${suffix}.`;
}

/**
 * Why a file would not open, in the message rather than nowhere.
 *
 * `parseSgf` throws with the specific fault — "Invalid SGF: expected \")\"",
 * "Invalid SGF: B move \"zz\" is outside the board" — and every import path
 * threw it away and said only that something had failed. That leaves the reader
 * unable to tell a corrupt file from a broken app, which is the one thing the
 * message could have told them.
 */
export function describeImportFailure(what: string, error: unknown): string {
  const reason = error instanceof Error ? error.message.trim() : '';
  if (!reason) return what;
  return `${what} ${/[.!?]$/.test(reason) ? reason : `${reason}.`}`;
}

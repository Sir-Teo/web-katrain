import { withFailureReason } from './importSummary';
import { parseSgf } from './sgf';

export function assertValidLibrarySgfImport(sgf: string): void {
  if (!sgf.trim()) throw new Error('Empty SGF import');

  try {
    parseSgf(sgf.trim());
  } catch (error) {
    throw new Error(withFailureReason('Invalid SGF import.', error));
  }
}

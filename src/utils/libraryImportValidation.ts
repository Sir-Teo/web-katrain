import { parseSgf } from './sgf';

export function assertValidLibrarySgfImport(sgf: string): void {
  if (!sgf.trim()) throw new Error('Empty SGF import');

  try {
    parseSgf(sgf.trim());
  } catch {
    throw new Error('Invalid SGF import');
  }
}

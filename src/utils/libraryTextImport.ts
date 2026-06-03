import {
  createLibraryItem,
  suggestLibraryItemNameFromSgf,
  type LibraryFile,
} from './library';
import { assertValidLibrarySgfImport } from './libraryImportValidation';
import { loadSgfOrOgs } from './ogs';

export type LibraryTextImportResult = {
  item: LibraryFile;
  source: 'direct' | 'ogs';
  gameId?: string;
};

export async function createLibraryItemFromSgfOrOgsText(
  text: string,
  folderId: string | null,
  fallbackName = 'Dropped SGF'
): Promise<LibraryTextImportResult> {
  const result = await loadSgfOrOgs(text);
  assertValidLibrarySgfImport(result.sgf);
  const fallback = result.source === 'ogs' && result.gameId ? `ogs-${result.gameId}` : fallbackName;
  return {
    item: createLibraryItem(suggestLibraryItemNameFromSgf(result.sgf, fallback), result.sgf, folderId),
    source: result.source,
    gameId: result.gameId,
  };
}

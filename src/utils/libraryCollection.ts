import {
  createLibraryFolder,
  createLibraryItem,
  prependLibraryImports,
  suggestLibraryItemNameFromSgf,
  type LibraryFile,
  type LibraryFolder,
  type LibraryItem,
} from './library';
import { countSgfGames, readRootSgfProperties, splitSgfGames } from './sgfScan';

export const MAX_COLLECTION_SPLIT_GAMES = 10_000;

/** Copy a collection's raw games into a new numbered folder beside its source. */
export function splitLibraryCollection(
  items: readonly LibraryItem[],
  sourceId: string,
  timestamp = Date.now(),
): { items: LibraryItem[]; folder: LibraryFolder; files: LibraryFile[] } {
  const source = items.find(item => item.id === sourceId);
  if (source?.type !== 'file') throw new Error('This collection is no longer in Library.');
  if (countSgfGames(source.sgf) > MAX_COLLECTION_SPLIT_GAMES) {
    throw new Error('This collection contains more than 10,000 games. Split it into smaller SGF files first.');
  }
  const games = splitSgfGames(source.sgf);
  if (games.length < 2) throw new Error('This file contains only one game.');
  const folder = createLibraryFolder(`${source.name} games`, source.parentId);
  folder.createdAt = folder.updatedAt = timestamp;
  const files = games.map((sgf, index): LibraryFile => {
    const gameType = readRootSgfProperties(sgf).GM?.[0];
    if (gameType && Number(gameType) !== 1) throw new Error(`Game ${index + 1} is not a Go game.`);
    const title = suggestLibraryItemNameFromSgf(sgf, source.name);
    return {
      ...createLibraryItem(`${index + 1}. ${title}`, sgf, folder.id, timestamp),
      ...(source.favorite !== undefined ? { favorite: source.favorite } : {}),
      ...(source.tags ? { tags: [...source.tags] } : {}),
    };
  });
  const next = prependLibraryImports(items, [folder, ...files]);
  // Batch naming can suffix the destination if a sibling already uses it.
  const namedFolder = next[0] as LibraryFolder;
  return { items: next, folder: namedFolder, files };
}

import type { LibraryFolder, LibraryItem } from './library';

/** Root-to-folder path, or the containing path when the starting item is a game. */
export function getLibraryFolderPath(
  itemById: ReadonlyMap<string, LibraryItem>,
  itemId: string | null,
): LibraryFolder[] {
  const trail: LibraryFolder[] = [];
  const visited = new Set<string>();
  let current = itemId ? itemById.get(itemId) : undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.type === 'folder') trail.push(current);
    current = current.parentId ? itemById.get(current.parentId) : undefined;
    // A game cannot contain another item, even in a damaged backup.
    if (current && current.type !== 'folder') break;
  }
  return trail.reverse();
}

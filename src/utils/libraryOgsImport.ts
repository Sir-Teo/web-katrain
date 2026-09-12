import { prependLibraryImports, type LibraryFile, type LibraryFolder, type LibraryItem } from './library';

/** Merge a completed sync without replacing edits made while OGS was loading. */
export function mergeOgsLibraryImports(
  items: LibraryItem[],
  proposedFolder: LibraryFolder,
  files: LibraryFile[]
): LibraryItem[] {
  if (files.length === 0) return items;
  // A folder may itself have arrived in an overlapping backup/file import.
  // Resolve the established OGS destination against state at completion too.
  const existing = items.find((item): item is LibraryFolder =>
    item.type === 'folder' && item.parentId === null && item.name === proposedFolder.name);
  const folder = existing ?? proposedFolder;
  const next = existing ? items : [folder, ...items];
  const imported = files.map((file) => file.parentId === folder.id ? file : { ...file, parentId: folder.id });
  return prependLibraryImports(next, imported);
}

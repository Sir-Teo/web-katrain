import JSZip from 'jszip';
import { stripUnsafeFilenameControls } from './filename';
import { MAX_SGF_IMPORT_BYTES } from './sgfImportLimits';
import {
  createLibraryFolder,
  createLibraryItem,
  type LibraryFile,
  type LibraryFolder,
  type LibraryItem,
} from './library';
import { assertValidLibrarySgfImport } from './libraryImportValidation';

const ZIP_SGF_EXT_RE = /\.sgf$/i;

function sanitizeZipPart(part: string): string {
  return (
    stripUnsafeFilenameControls(part)
      .replace(/\\/g, '/')
      .replace(/[<>:"|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+$/, '') || 'Untitled'
  );
}

function splitZipPath(path: string): string[] {
  const rawParts = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.');
  if (rawParts.some((part) => part === '..' || part === '__MACOSX')) return [];
  return rawParts.map((part) => sanitizeZipPart(part)).filter(Boolean);
}

function isFolder(item: LibraryItem): item is LibraryFolder {
  return item.type === 'folder';
}

function isFile(item: LibraryItem): item is LibraryFile {
  return item.type === 'file';
}

function collectExportItems(items: LibraryItem[], selectedIds?: Set<string>): LibraryItem[] {
  if (!selectedIds || selectedIds.size === 0) return items;

  const included = new Set<string>();
  const addWithDescendants = (id: string) => {
    if (included.has(id)) return;
    included.add(id);
    for (const item of items) {
      if (item.parentId === id) addWithDescendants(item.id);
    }
  };

  for (const id of selectedIds) addWithDescendants(id);
  return items.filter((item) => included.has(item.id));
}

function uniqueZipPath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }

  const dot = path.toLowerCase().endsWith('.sgf') ? path.length - 4 : path.length;
  const base = path.slice(0, dot);
  const ext = path.slice(dot);
  let i = 2;
  while (used.has(`${base} (${i})${ext}`)) i++;
  const next = `${base} (${i})${ext}`;
  used.add(next);
  return next;
}

function buildFolderPath(itemById: Map<string, LibraryItem>, folderId: string | null): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let currentId = folderId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const item = itemById.get(currentId);
    if (!item || !isFolder(item)) break;
    path.unshift(sanitizeZipPart(item.name));
    currentId = item.parentId ?? null;
  }
  return path;
}

export async function createLibraryZipBlob(
  items: LibraryItem[],
  selectedIds?: Set<string>
): Promise<{ blob: Blob; fileCount: number }> {
  const exportItems = collectExportItems(items, selectedIds);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const usedPaths = new Set<string>();
  const zip = new JSZip();
  let fileCount = 0;

  for (const item of exportItems) {
    if (isFolder(item)) {
      const folderPath = [...buildFolderPath(itemById, item.parentId ?? null), sanitizeZipPart(item.name)].join('/');
      if (folderPath) zip.folder(folderPath);
      continue;
    }
    if (!isFile(item)) continue;
    const folderParts = buildFolderPath(itemById, item.parentId ?? null);
    const rawName = sanitizeZipPart(item.name).replace(ZIP_SGF_EXT_RE, '') || 'game';
    const path = uniqueZipPath([...folderParts, `${rawName}.sgf`].join('/'), usedPaths);
    zip.file(path, item.sgf);
    fileCount++;
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, fileCount };
}

/**
 * What a library archive may expand to.
 *
 * A zip is a file someone else may have made — this app exports them for
 * exactly that — and `entry.async` decompresses a whole entry before anything
 * looks at it. Measured: a 199KB zip holding one 200MB entry cost 402MB of heap
 * and 248ms, and then imported nothing, because 200MB of one letter is not an
 * SGF.
 *
 * The size the archive declares for an entry is free to read and turns an
 * ordinary bomb into a skipped entry with nothing decompressed. A hostile
 * archive can lie about it, so a running total stops the import after one such
 * entry rather than after every one of them. A real backup of a thousand games
 * is a few megabytes, so neither limit is near anything anyone has.
 */
const MAX_ZIP_EXPANDED_BYTES = 64 * 1024 * 1024;

const declaredEntrySize = (entry: unknown): number | null => {
  const data = (entry as { _data?: { uncompressedSize?: unknown } })._data;
  const size = data?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) ? size : null;
};

export async function importLibraryItemsFromZip(
  source: Blob | ArrayBuffer | Uint8Array,
  parentId: string | null = null
): Promise<LibraryItem[]> {
  const zipSource = typeof Blob !== 'undefined' && source instanceof Blob ? await source.arrayBuffer() : source;
  const zip = await JSZip.loadAsync(zipSource);
  const imported: LibraryItem[] = [];
  const folderByPath = new Map<string, string>();

  const ensureFolder = (parts: string[]): string | null => {
    let parent = parentId;
    let key = '';
    for (const part of parts) {
      key = key ? `${key}/${part}` : part;
      const existing = folderByPath.get(key);
      if (existing) {
        parent = existing;
        continue;
      }
      const folder = createLibraryFolder(part, parent);
      folderByPath.set(key, folder.id);
      imported.push(folder);
      parent = folder.id;
    }
    return parent;
  };

  const entries = Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name));

  const zipEntryParts = (entry: { name: string }): string[] =>
    splitZipPath((entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name);

  // Directories that hold files of their own are rebuilt by the file pass
  // below, and are left alone here so a directory whose every file was
  // rejected does not come back as an empty folder.
  const directoriesHoldingFiles = new Set<string>();
  for (const entry of entries) {
    if (entry.dir) continue;
    const parts = zipEntryParts(entry);
    parts.pop();
    let key = '';
    for (const part of parts) {
      key = key ? `${key}/${part}` : part;
      directoriesHoldingFiles.add(key);
    }
  }

  // An empty folder is still part of the library's organisation, and the export
  // writes an entry for it. Nothing in the file pass would ever recreate one,
  // so it has to be rebuilt from the directory entry itself.
  for (const entry of entries) {
    if (!entry.dir) continue;
    const parts = zipEntryParts(entry);
    if (parts.length === 0 || directoriesHoldingFiles.has(parts.join('/'))) continue;
    ensureFolder(parts);
  }

  let expandedBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    if (!ZIP_SGF_EXT_RE.test(entry.name)) continue;
    if (expandedBytes > MAX_ZIP_EXPANDED_BYTES) break;
    const declared = declaredEntrySize(entry);
    if (declared !== null && declared > MAX_SGF_IMPORT_BYTES) continue;
    const originalName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
    const parts = splitZipPath(originalName);
    if (parts.length === 0) continue;
    const fileName = parts.pop()!;
    let sgf = '';
    try {
      sgf = await entry.async('string');
      // Counted whether or not it turns out to be a game: the memory was spent
      // either way, and a lying archive is only caught after the fact.
      expandedBytes += sgf.length;
      assertValidLibrarySgfImport(sgf);
    } catch {
      continue;
    }
    const folderId = ensureFolder(parts);
    const name = fileName.replace(ZIP_SGF_EXT_RE, '') || 'Game';
    imported.push(createLibraryItem(name, sgf, folderId));
  }

  return imported;
}

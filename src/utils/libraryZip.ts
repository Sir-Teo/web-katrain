import JSZip from 'jszip';
import {
  createLibraryFolder,
  createLibraryItem,
  type LibraryFile,
  type LibraryFolder,
  type LibraryItem,
} from './library';

const ZIP_SGF_EXT_RE = /\.sgf$/i;

function sanitizeZipPart(part: string): string {
  const withoutControls = Array.from(part)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('');
  return (
    withoutControls
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
  for (const entry of entries) {
    if (entry.dir) continue;
    if (!ZIP_SGF_EXT_RE.test(entry.name)) continue;
    const originalName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name;
    const parts = splitZipPath(originalName);
    if (parts.length === 0) continue;
    const fileName = parts.pop()!;
    const folderId = ensureFolder(parts);
    const sgf = await entry.async('string');
    const name = fileName.replace(ZIP_SGF_EXT_RE, '') || 'Game';
    imported.push(createLibraryItem(name, sgf, folderId));
  }

  return imported;
}

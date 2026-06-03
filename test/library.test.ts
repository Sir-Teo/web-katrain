import { afterEach, describe, expect, it } from 'vitest';
import {
  createLibraryBackup,
  createLibraryFolder,
  createLibraryItem,
  deleteLibraryItem,
  duplicateLibraryItem,
  duplicateLibraryItems,
  extractLibraryMetadata,
  formatLibrarySize,
  getLibraryFolderOptions,
  getLibrarySaveTargetFolderId,
  getLibraryStats,
  librarySgfDownloadFilename,
  loadLibrary,
  normalizeLibraryItems,
  parseLibraryBackup,
  saveLibrary,
  suggestLibraryItemNameFromSgf,
  updateLibraryFileSgf,
  updateLibraryItem,
} from '../src/utils/library';

const originalIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

function restoreIndexedDB() {
  if (originalIndexedDB) {
    Object.defineProperty(globalThis, 'indexedDB', originalIndexedDB);
  } else {
    Reflect.deleteProperty(globalThis, 'indexedDB');
  }
}

afterEach(() => {
  restoreIndexedDB();
});

describe('library storage helpers', () => {
  const sgf = '(;GM[1]FF[4]SZ[19]KM[6.5]GN[Title Game]PB[Black Player]PW[White Player]DT[2024-01-02]RE[B+R];B[pd];W[dd])';

  it('extracts useful SGF metadata for library rows', () => {
    expect(extractLibraryMetadata(sgf)).toEqual({
      gameName: 'Title Game',
      black: 'Black Player',
      white: 'White Player',
      date: '2024-01-02',
      result: 'B+R',
      boardSize: 19,
      komi: 6.5,
      event: undefined,
      handicap: undefined,
      rules: undefined,
    });
  });

  it('creates file records with metadata, move count, and size', () => {
    const item = createLibraryItem('Game', sgf, null, 123);
    expect(item.type).toBe('file');
    expect(item.createdAt).toBe(123);
    expect(item.updatedAt).toBe(123);
    expect(item.moveCount).toBe(2);
    expect(item.size).toBe(sgf.length);
    expect(item.metadata.black).toBe('Black Player');
  });

  it('updates a saved file in place with fresh SGF metadata', () => {
    const item = createLibraryItem('Game', sgf, 'folder-a', 123);
    const updatedSgf = '(;GM[1]FF[4]SZ[9]GN[Updated]PB[New Black]PW[New White];B[dd];W[ee];B[cf])';

    const updatedItems = updateLibraryFileSgf([item], item.id, updatedSgf, 456);
    const updated = updatedItems[0];

    expect(updated?.id).toBe(item.id);
    expect(updated?.name).toBe('Game');
    expect(updated?.parentId).toBe('folder-a');
    expect(updated?.createdAt).toBe(123);
    expect(updated?.updatedAt).toBe(456);
    expect(updated?.type).toBe('file');
    if (updated?.type === 'file') {
      expect(updated.sgf).toBe(updatedSgf);
      expect(updated.moveCount).toBe(3);
      expect(updated.size).toBe(updatedSgf.length);
      expect(updated.metadata.gameName).toBe('Updated');
      expect(updated.metadata.black).toBe('New Black');
    }
  });

  it('keeps the same item array when no saved file matches an SGF update', () => {
    const item = createLibraryItem('Game', sgf, null, 123);
    const folder = createLibraryFolder('Folder', null);
    const items = [item, folder];

    expect(updateLibraryFileSgf(items, 'missing', sgf, 456)).toBe(items);
    expect(updateLibraryFileSgf(items, folder.id, sgf, 456)).toBe(items);
  });

  it('renames library items with a deterministic timestamp', () => {
    const item = createLibraryItem('Game', sgf, null, 123);

    expect(updateLibraryItem([item], item.id, { name: 'Renamed' }, 789)[0]).toMatchObject({
      id: item.id,
      name: 'Renamed',
      createdAt: 123,
      updatedAt: 789,
    });
  });

  it('suggests library names from SGF metadata and keeps downloads single-extension', () => {
    const spoofedNameSgf = `(;GM[1]SZ[19]GN[Review${String.fromCharCode(0x202e)}fgs${String.fromCharCode(0)}];B[pd])`;

    expect(suggestLibraryItemNameFromSgf(sgf)).toBe('Title Game');
    expect(suggestLibraryItemNameFromSgf('(;GM[1]SZ[19]PB[Black/One]PW[White:Two];B[pd])')).toBe('Black-One vs White-Two');
    expect(suggestLibraryItemNameFromSgf(spoofedNameSgf)).toBe('Reviewfgs');
    expect(suggestLibraryItemNameFromSgf('(;GM[1]SZ[9];B[dd])', 'Game 3.sgf')).toBe('Game 3');
    expect(librarySgfDownloadFilename('Game 3.sgf')).toBe('Game 3.sgf');
    expect(librarySgfDownloadFilename('Bad/Name:Test')).toBe('Bad-Name-Test.sgf');
    expect(librarySgfDownloadFilename('Review\u202efgs\u0000')).toBe('Reviewfgs.sgf');
  });

  it('normalizes legacy localStorage records into current library items', () => {
    const items = normalizeLibraryItems([
      { id: 'old-file', name: 'Old', sgf, createdAt: 1, updatedAt: 2, parentId: null, type: 'file' },
      { id: 'old-folder', name: 'Folder', createdAt: 1, updatedAt: 2, parentId: null, type: 'folder' },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.type).toBe('file');
    if (items[0]?.type === 'file') {
      expect(items[0].metadata.white).toBe('White Player');
      expect(items[0].moveCount).toBe(2);
    }
    expect(items[1]?.type).toBe('folder');
  });

  it('round trips the full-library JSON backup format', () => {
    const item = createLibraryItem('Backup Game', sgf, null, 456);
    const backup = createLibraryBackup([item]);
    const parsed = JSON.parse(backup) as { app?: string; version?: number; items?: unknown[] };
    expect(parsed.app).toBe('web-katrain');
    expect(parsed.version).toBe(2);
    expect(parsed.items).toHaveLength(1);

    const restored = parseLibraryBackup(backup);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.name).toBe('Backup Game');
  });

  it('deletes folders with all descendants', () => {
    const folder = createLibraryFolder('Folder', null);
    const nestedFolder = createLibraryFolder('Nested', folder.id);
    const directFile = createLibraryItem('Direct', sgf, folder.id);
    const nestedFile = createLibraryItem('Nested Game', sgf, nestedFolder.id);
    const rootFile = createLibraryItem('Root', sgf, null);

    const remaining = deleteLibraryItem([folder, nestedFolder, directFile, nestedFile, rootFile], folder.id);

    expect(remaining).toEqual([rootFile]);
  });

  it('duplicates a file with a unique copy name next to the original', () => {
    const original = createLibraryItem('Game', sgf, null, 100);
    const existingCopy = createLibraryItem('Game (copy)', sgf, null, 101);

    const result = duplicateLibraryItem([original, existingCopy], original.id, 200);
    const duplicated = result.duplicated;

    expect(duplicated?.type).toBe('file');
    expect(duplicated?.id).not.toBe(original.id);
    expect(duplicated?.name).toBe('Game (copy) 2');
    expect(duplicated?.parentId).toBeNull();
    expect(duplicated?.createdAt).toBe(200);
    expect(result.items).toHaveLength(3);
    if (duplicated?.type === 'file') {
      expect(duplicated.sgf).toBe(original.sgf);
      expect(duplicated.moveCount).toBe(original.moveCount);
    }
  });

  it('duplicates a folder with descendants under new ids', () => {
    const folder = createLibraryFolder('Folder', null);
    const nestedFolder = createLibraryFolder('Nested', folder.id);
    const directFile = createLibraryItem('Direct', sgf, folder.id);
    const nestedFile = createLibraryItem('Nested Game', sgf, nestedFolder.id);
    const rootFile = createLibraryItem('Root', sgf, null);

    const result = duplicateLibraryItem([folder, nestedFolder, directFile, nestedFile, rootFile], folder.id, 300);
    const copiedFolder = result.duplicated;

    expect(copiedFolder?.type).toBe('folder');
    expect(copiedFolder?.name).toBe('Folder (copy)');
    expect(result.duplicatedIds).toHaveLength(4);

    const copiedChildren = result.items.filter((item) => item.parentId === copiedFolder?.id);
    expect(copiedChildren.map((item) => item.name).sort()).toEqual(['Direct', 'Nested']);
    const copiedNested = copiedChildren.find((item) => item.type === 'folder' && item.name === 'Nested');
    expect(result.items.find((item) => item.parentId === copiedNested?.id && item.name === 'Nested Game')).toBeTruthy();
    expect(result.items).toContain(rootFile);
  });

  it('duplicates selected items in sequence', () => {
    const first = createLibraryItem('First', sgf, null);
    const second = createLibraryItem('Second', sgf, null);

    const result = duplicateLibraryItems([first, second], [first.id, second.id], 400);

    expect(result.duplicatedIds).toHaveLength(2);
    expect(result.items.map((item) => item.name)).toEqual(['Second (copy)', 'First (copy)', 'First', 'Second']);
  });

  it('does not duplicate selected descendants separately when their folder is selected', () => {
    const folder = createLibraryFolder('Folder', null);
    const nestedFolder = createLibraryFolder('Nested', folder.id);
    const directFile = createLibraryItem('Direct', sgf, folder.id);
    const nestedFile = createLibraryItem('Nested Game', sgf, nestedFolder.id);
    const rootFile = createLibraryItem('Root', sgf, null);

    const result = duplicateLibraryItems(
      [folder, nestedFolder, directFile, nestedFile, rootFile],
      [directFile.id, folder.id, nestedFile.id],
      500
    );

    expect(result.duplicated?.name).toBe('Folder (copy)');
    expect(result.duplicatedIds).toHaveLength(4);
    expect(result.items.filter((item) => item.name === 'Folder (copy)')).toHaveLength(1);
    expect(result.items.filter((item) => item.name === 'Direct (copy)')).toHaveLength(0);
    expect(result.items.filter((item) => item.name === 'Nested Game (copy)')).toHaveLength(0);
    expect(result.items.filter((item) => item.name === 'Direct')).toHaveLength(2);
    expect(result.items.filter((item) => item.name === 'Nested Game')).toHaveLength(2);
  });

  it('summarizes total library files, folders, and stored size', () => {
    const folder = createLibraryFolder('Folder', null);
    const first = createLibraryItem('First', sgf, folder.id);
    const second = createLibraryItem('Second', '(;GM[1]SZ[9];B[dd])', null);

    expect(getLibraryStats([folder, first, second])).toEqual({
      files: 2,
      folders: 1,
      size: first.size + second.size,
    });
    expect(formatLibrarySize(0)).toBe('0 B');
    expect(formatLibrarySize(1536)).toBe('1.5 KB');
    expect(formatLibrarySize(12 * 1024 * 1024)).toBe('12 MB');
  });

  it('builds stable nested folder picker options', () => {
    const games = { ...createLibraryFolder('Games', null), id: 'games', createdAt: 2 };
    const archives = { ...createLibraryFolder('Archives', null), id: 'archives', createdAt: 1 };
    const year = { ...createLibraryFolder('2026', games.id), id: 'year', createdAt: 3 };
    const orphan = { ...createLibraryFolder('Orphan', 'missing'), id: 'orphan', createdAt: 4 };
    const file = createLibraryItem('Game', sgf, games.id);

    expect(getLibraryFolderOptions([file, games, archives, year, orphan])).toEqual([
      { id: 'archives', name: 'Archives', depth: 0 },
      { id: 'games', name: 'Games', depth: 0 },
      { id: 'year', name: '2026', depth: 1 },
      { id: 'orphan', name: 'Orphan', depth: 0 },
    ]);
  });

  it('chooses the library save target from loaded file context before active folder context', () => {
    const games = { ...createLibraryFolder('Games', null), id: 'games' };
    const review = { ...createLibraryFolder('Review', null), id: 'review' };
    const file = { ...createLibraryItem('Game', sgf, games.id), id: 'file' };
    const items = [games, review, file];

    expect(
      getLibrarySaveTargetFolderId({
        items,
        loadedLibraryFileId: file.id,
        preferredFolderId: review.id,
      })
    ).toBe(games.id);
    expect(
      getLibrarySaveTargetFolderId({
        items,
        loadedLibraryFileId: null,
        preferredFolderId: review.id,
      })
    ).toBe(review.id);
    expect(
      getLibrarySaveTargetFolderId({
        items,
        loadedLibraryFileId: null,
        preferredFolderId: file.id,
      })
    ).toBeNull();
    expect(
      getLibrarySaveTargetFolderId({
        items,
        loadedLibraryFileId: null,
        preferredFolderId: 'missing',
      })
    ).toBeNull();
  });

  it('falls back to local storage when IndexedDB access throws', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get: () => {
        throw new Error('indexedDB blocked');
      },
    });
    const item = createLibraryItem('Fallback Game', sgf, null, 900);

    await expect(saveLibrary([item])).resolves.toBeUndefined();
    await expect(loadLibrary()).resolves.toEqual([item]);
  });
});

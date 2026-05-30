import { describe, expect, it } from 'vitest';
import {
  createLibraryBackup,
  createLibraryFolder,
  createLibraryItem,
  deleteLibraryItem,
  duplicateLibraryItem,
  duplicateLibraryItems,
  extractLibraryMetadata,
  formatLibrarySize,
  getLibraryStats,
  normalizeLibraryItems,
  parseLibraryBackup,
} from '../src/utils/library';

describe('library storage helpers', () => {
  const sgf = '(;GM[1]FF[4]SZ[19]KM[6.5]PB[Black Player]PW[White Player]DT[2024-01-02]RE[B+R];B[pd];W[dd])';

  it('extracts useful SGF metadata for library rows', () => {
    expect(extractLibraryMetadata(sgf)).toEqual({
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
});

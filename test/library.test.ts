import { describe, expect, it } from 'vitest';
import {
  createLibraryBackup,
  createLibraryItem,
  extractLibraryMetadata,
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
});

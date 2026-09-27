import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_BACKUP_NOT_RECOGNIZED_MESSAGE,
  MAX_LIBRARY_BACKUP_BYTES,
  MAX_LIBRARY_BACKUP_ITEMS,
  createLibraryBackup,
  createLibraryFolder,
  createLibraryItem,
  parseLibraryBackup,
  readLibraryBackup,
} from '../src/utils/library';
import { describeLibraryBackupRepairs, summarizeLibraryBackupRepairs } from '../src/utils/libraryPrompts';

const SGF = '(;GM[1]SZ[9];B[aa])';
const backupOf = (items: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 2, app: 'web-katrain', exportedAt: '2026-01-01T00:00:00.000Z', items, ...extra });

describe('reading a library backup', () => {
  it('reads the backup the app writes, with nothing to report', () => {
    const folder = createLibraryFolder('Study');
    const game = createLibraryItem('Game', SGF, folder.id);
    const report = readLibraryBackup(createLibraryBackup([folder, game]));
    expect(report.items.map((item) => item.name)).toEqual(['Study', 'Game']);
    expect(report).toMatchObject({ rejected: 0, repaired: 0 });
  });

  it('still reads a bare array of records, the form the library is kept in', () => {
    const game = createLibraryItem('Game', SGF);
    expect(parseLibraryBackup(JSON.stringify([game])).map((item) => item.id)).toEqual([game.id]);
  });

  it('still reads a version 1 backup', () => {
    const game = createLibraryItem('Game', SGF);
    expect(readLibraryBackup(backupOf([game], { version: 1 })).items).toHaveLength(1);
  });

  /**
   * Any object with an `items` array used to be taken as a backup, so a stray
   * JSON file replaced the library with its objects, each read as an empty
   * folder named "Untitled".
   */
  it('refuses JSON that is not a backup', () => {
    expect(() => readLibraryBackup(JSON.stringify({ items: [{ title: 'not a game' }] })))
      .toThrow(LIBRARY_BACKUP_NOT_RECOGNIZED_MESSAGE);
    expect(() => readLibraryBackup(JSON.stringify({ app: 'other', version: 2, items: [] })))
      .toThrow(LIBRARY_BACKUP_NOT_RECOGNIZED_MESSAGE);
    expect(() => readLibraryBackup('{"version": 2, "app": "web-katrain"')).toThrow(LIBRARY_BACKUP_NOT_RECOGNIZED_MESSAGE);
    expect(() => readLibraryBackup('"just a string"')).toThrow(LIBRARY_BACKUP_NOT_RECOGNIZED_MESSAGE);
  });

  it('says so when a backup comes from a newer version', () => {
    expect(() => readLibraryBackup(backupOf([], { version: 3 }))).toThrow(/newer version/);
  });

  it('refuses a backup with every record unreadable rather than emptying the library', () => {
    expect(() => readLibraryBackup(JSON.stringify([{ title: 'a' }, 7, null, { type: 'file' }])))
      .toThrow(/None of the items/);
  });

  it('still reads an empty backup, which is a real, if empty, library', () => {
    expect(readLibraryBackup(backupOf([])).items).toEqual([]);
  });

  it('skips unusable records and counts them', () => {
    const game = createLibraryItem('Kept', SGF);
    const report = readLibraryBackup(backupOf([
      game,
      { type: 'file', name: 'No SGF' },
      { type: 'playlist', name: 'Unknown kind' },
      { name: 'Neither folder nor game' },
      'text',
      null,
    ]));
    expect(report.items.map((item) => item.name)).toEqual(['Kept']);
    expect(report.rejected).toBe(5);
    expect(report.repaired).toBe(0);
  });

  it('counts the records it had to fix', () => {
    const game = createLibraryItem('Game', SGF);
    const report = readLibraryBackup(backupOf([
      game,
      { ...game },                                  // repeat id: given a new one
      { ...createLibraryItem('Orphan', SGF), parentId: 'missing' },
      { type: 'folder', id: 'f', name: '  ', createdAt: 1, updatedAt: 1, parentId: null },
      { ...createLibraryItem('x'.repeat(400), SGF) },
    ]));
    expect(report.items).toHaveLength(5);
    expect(report.repaired).toBe(4);
    expect(report.items[4]!.name).toHaveLength(256);
  });

  it('refuses too many items before normalizing any', () => {
    const many = new Array(MAX_LIBRARY_BACKUP_ITEMS + 1).fill({ type: 'folder', name: 'F' });
    expect(() => readLibraryBackup(backupOf(many))).toThrow(/limited to 50,000 items/);
  });

  it('refuses text larger than the size cap without parsing it', () => {
    const huge = { length: MAX_LIBRARY_BACKUP_BYTES + 1 } as unknown as string;
    expect(() => readLibraryBackup(huge)).toThrow(/limited to 100 MB/);
  });
});

describe('what the restore says about repairs', () => {
  it('names skipped and repaired records before and after', () => {
    expect(describeLibraryBackupRepairs({ rejected: 0, repaired: 0 })).toBe('');
    expect(describeLibraryBackupRepairs({ rejected: 2, repaired: 1 })).toBe(
      '2 records in this backup could not be read and will be skipped; '
      + '1 record with a missing or broken id, name, date or folder will be repaired.'
    );
    expect(summarizeLibraryBackupRepairs({ rejected: 1, repaired: 3 })).toBe('Skipped 1 unreadable record; repaired 3 records.');
    expect(summarizeLibraryBackupRepairs({ rejected: 0, repaired: 1 })).toBe('Repaired 1 record.');
  });

  it('checks the file size before reading the file, and reports repairs in the question', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    const restore = source.slice(source.indexOf('const handleRestoreBackup'));
    expect(restore.indexOf('file.size > MAX_LIBRARY_BACKUP_BYTES')).toBeGreaterThan(-1);
    expect(restore.indexOf('file.size > MAX_LIBRARY_BACKUP_BYTES')).toBeLessThan(restore.indexOf('file.text()'));
    expect(restore).toContain('describeLibraryBackupRepairs(report)');
  });
});

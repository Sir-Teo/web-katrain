import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createLibraryBackup,
  createLibraryFolder,
  createLibraryItem,
  mergeLibraryBackup,
  readLibraryBackup,
  type LibraryItem,
} from '../src/utils/library';
import { describeLibraryMerge, describeLibraryRestoreChoice } from '../src/utils/libraryPrompts';

const SGF = '(;GM[1]SZ[9];B[aa])';
const roundTrip = (items: LibraryItem[]) => readLibraryBackup(createLibraryBackup(items)).items;

describe('merging a backup into the Library', () => {
  it('adds what the Library lacks and keeps everything it has', () => {
    const kept = createLibraryItem('Added since the backup', SGF);
    const shared = createLibraryItem('In both', SGF);
    const lost = createLibraryItem('Deleted since the backup', SGF);
    const backup = roundTrip([shared, lost]);

    const result = mergeLibraryBackup([kept, shared], backup);

    expect(result.items.map((item) => item.name).sort()).toEqual(['Added since the backup', 'Deleted since the backup', 'In both']);
    expect(result).toMatchObject({ added: 1, alreadyPresent: 1, keptBoth: 0 });
    // The Library's own records are untouched objects, so only the addition is saved.
    expect(result.items).toContain(kept);
    expect(result.items).toContain(shared);
  });

  it('keeps both when the Library has the same id for a different game', () => {
    const game = createLibraryItem('Study', SGF);
    const backup = roundTrip([game]);
    const edited = { ...game, sgf: '(;GM[1]SZ[9];B[aa];W[bb])', moveCount: 2 };

    const result = mergeLibraryBackup([edited], backup);

    expect(result).toMatchObject({ added: 1, alreadyPresent: 0, keptBoth: 1 });
    const copy = result.items.find((item) => item !== edited)!;
    expect(copy.id).not.toBe(game.id);
    expect(copy.name).toBe('Study 2');
    expect(result.items.find((item) => item.id === game.id)).toBe(edited);
  });

  it('puts a backed-up folder’s contents into the folder the Library already has', () => {
    const folder = createLibraryFolder('Openings');
    const inLibrary = createLibraryItem('Chinese', SGF, folder.id);
    const onlyInBackup = createLibraryItem('Sanrensei', SGF, folder.id);
    const renamed = { ...folder, name: 'Openings (renamed)' };

    const result = mergeLibraryBackup([renamed, inLibrary], roundTrip([folder, inLibrary, onlyInBackup]));

    expect(result).toMatchObject({ added: 1, alreadyPresent: 2, keptBoth: 0 });
    expect(result.items.find((item) => item.name === 'Sanrensei')?.parentId).toBe(folder.id);
    expect(result.items.filter((item) => item.type === 'folder')).toHaveLength(1);
  });

  it('moves contents along with a folder whose id had to change', () => {
    const clash = createLibraryItem('A game', SGF);
    const folder = { ...createLibraryFolder('Folder'), id: clash.id };
    const child = createLibraryItem('Child', SGF, folder.id);

    const result = mergeLibraryBackup([clash], roundTrip([folder, child]));

    const newFolder = result.items.find((item) => item.type === 'folder')!;
    expect(newFolder.id).not.toBe(clash.id);
    expect(result.items.find((item) => item.name === 'Child')?.parentId).toBe(newFolder.id);
    expect(result.keptBoth).toBe(1);
  });

  it('keeps names unique where the additions land', () => {
    const existing = createLibraryItem('Game 1', SGF);
    const incoming = createLibraryItem('Game 1', SGF);
    const result = mergeLibraryBackup([existing], roundTrip([incoming]));
    expect(result.items.map((item) => item.name).sort()).toEqual(['Game 1', 'Game 1 2']);
  });

  it('adds nothing when the Library already has it all', () => {
    const game = createLibraryItem('Only', SGF);
    const result = mergeLibraryBackup([game], roundTrip([game]));
    expect(result).toMatchObject({ added: 0, alreadyPresent: 1 });
    expect(result.items).toEqual([game]);
  });
});

describe('the restore question and its answer', () => {
  it('offers Merge beside Replace and says what each does', () => {
    expect(describeLibraryRestoreChoice(8, 3)).toBe(
      'This backup has 3 items. Merge adds the ones not already in your Library. '
      + 'Replace swaps all 8 library items for them and cannot be undone.'
    );
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    expect(source).toContain("secondary: { label: 'Merge', onConfirm: applyMerge }");
    expect(source).toContain('mergeLibraryBackup(saveStateRef.current.items, restored)');
  });

  it('counts what a merge did', () => {
    expect(describeLibraryMerge({ added: 4, alreadyPresent: 3, keptBoth: 1 })).toBe(
      'Added 4 library items from the backup; 1 of them is a copy of a game changed since the backup; 3 were already in the Library.'
    );
    expect(describeLibraryMerge({ added: 0, alreadyPresent: 1, keptBoth: 0 })).toBe(
      'Added 0 library items from the backup; 1 was already in the Library.'
    );
  });
});

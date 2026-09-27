import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  captureLibraryDeletion,
  createLibraryFolder,
  createLibraryItem,
  deleteLibraryItem,
  deleteLibraryItems,
  restoreLibraryDeletion,
} from '../src/utils/library';

const SGF = '(;GM[1]SZ[9];B[aa])';

describe('undoing a Library delete', () => {
  it('puts a deleted folder and everything in it back where it was', () => {
    const before = createLibraryItem('Before', SGF);
    const folder = createLibraryFolder('Folder');
    const inner = createLibraryFolder('Inner', folder.id);
    const game = createLibraryItem('Game', SGF, inner.id);
    const after = createLibraryItem('After', SGF);
    const items = [before, folder, inner, game, after];

    const deletion = captureLibraryDeletion(items, [folder.id]);
    expect(deletion.removed.map(({ item }) => item.name)).toEqual(['Folder', 'Inner', 'Game']);
    const deleted = deleteLibraryItem(items, folder.id);

    const restored = restoreLibraryDeletion(deleted, deletion);
    expect(restored).toEqual(items);
    // The very records that were deleted, not rebuilt ones.
    expect(restored[1]).toBe(folder);
  });

  it('restores a scattered selection at its old positions', () => {
    const items = Array.from({ length: 6 }, (_, i) => createLibraryItem(`G${i}`, SGF));
    const ids = [items[0]!.id, items[3]!.id, items[5]!.id];
    const deletion = captureLibraryDeletion(items, ids);
    expect(restoreLibraryDeletion(deleteLibraryItems(items, ids), deletion)).toEqual(items);
  });

  it('keeps what was added since, and undoing twice changes nothing', () => {
    const game = createLibraryItem('Deleted', SGF);
    const deletion = captureLibraryDeletion([game], [game.id]);
    const added = createLibraryItem('Added since', SGF);
    const once = restoreLibraryDeletion([added], deletion);
    expect(once.map((item) => item.name).sort()).toEqual(['Added since', 'Deleted']);
    expect(restoreLibraryDeletion(once, deletion)).toBe(once);
  });

  it('returns a game to Root when its folder has gone since, and keeps names unique', () => {
    const folder = createLibraryFolder('Folder');
    const game = createLibraryItem('Game', SGF, folder.id);
    const deletion = captureLibraryDeletion([folder, game], [game.id]);
    const sameName = createLibraryItem('Game', SGF);
    const restored = restoreLibraryDeletion([sameName], deletion);
    expect(restored.find((item) => item.id === game.id)).toMatchObject({ parentId: null, name: 'Game 2' });
  });

  it('offers Undo in the panel for a few seconds after either delete', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    expect(source).toContain('const LIBRARY_UNDO_DELETE_MS = 10_000;');
    expect(source.match(/offerUndoDeletion\(\n\s+captureLibraryDeletion\(saveStateRef\.current\.items/g)).toHaveLength(2);
    expect(source).toContain('setItems((prev) => restoreLibraryDeletion(prev, deletion));');
    expect(source).toContain('data-library-undo-delete="true"');
  });
});

import { describe, expect, it } from 'vitest';
import {
  createLibraryFolder,
  createLibraryItem,
  duplicateLibraryItem,
  duplicateLibraryItems,
  type LibraryItem,
} from '../src/utils/library';

const SGF = '(;GM[1]SZ[9];B[aa])';
const shape = (items: LibraryItem[], byId: Map<string, LibraryItem>) =>
  items.map((item) => ({ name: item.name, type: item.type, parent: item.parentId ? byId.get(item.parentId)?.name ?? '?' : null }));

describe('duplicating a selection in one pass', () => {
  it('gives the same copies, names and order as duplicating one item at a time', () => {
    const folder = createLibraryFolder('Folder');
    const inner = createLibraryItem('Inner', SGF, folder.id);
    const a = createLibraryItem('A', SGF);
    const aCopy = createLibraryItem('A (copy)', SGF);
    const b = createLibraryItem('B', SGF, folder.id);
    const items = [folder, inner, a, aCopy, b];
    const selection = [a.id, aCopy.id, folder.id, b.id, inner.id];

    const batch = duplicateLibraryItems(items, selection, 500);

    // One at a time, as Bulk Duplicate used to do it. `inner` and `b` travel
    // with their selected folder.
    let sequential = items;
    for (const id of [a.id, aCopy.id, folder.id]) sequential = duplicateLibraryItem(sequential, id, 500).items;

    const batchById = new Map(batch.items.map((item) => [item.id, item]));
    const sequentialById = new Map(sequential.map((item) => [item.id, item]));
    expect(shape(batch.items, batchById)).toEqual(shape(sequential, sequentialById));
    expect(batch.items.slice(0, 5).map((item) => item.name)).toEqual(['Folder (copy)', 'Inner', 'B', 'A (copy) (copy)', 'A (copy) 2']);
    expect(batch.duplicated?.name).toBe('A (copy) 2');
    expect(batch.duplicatedIds).toHaveLength(5);
  });

  it('adds every copy ahead of the untouched library in one new array', () => {
    const folder = createLibraryFolder('Big');
    const games = Array.from({ length: 1500 }, (_, i) => createLibraryItem(`Game ${i}`, SGF, folder.id));
    const items: LibraryItem[] = [folder, ...games];
    const result = duplicateLibraryItems(items, games.map((game) => game.id), 600);

    expect(result.items).toHaveLength(3001);
    const copies = result.items.slice(0, 1500);
    expect(new Set(copies.map((copy) => copy.name.toLowerCase())).size).toBe(1500);
    expect(copies.every((copy) => copy.parentId === folder.id && copy.createdAt === 600)).toBe(true);
    // The originals are the same records, not rebuilt ones.
    result.items.slice(1500).forEach((item, index) => expect(item).toBe(items[index]));
  });

  it('copies nothing and keeps the same array when nothing selected exists', () => {
    const items = [createLibraryItem('Only', SGF)];
    const result = duplicateLibraryItems(items, ['missing']);
    expect(result.items).toBe(items);
    expect(result.duplicated).toBeNull();
  });

  it('copies an item selected twice once', () => {
    const game = createLibraryItem('Twice', SGF);
    const result = duplicateLibraryItems([game], [game.id, game.id]);
    expect(result.duplicatedIds).toHaveLength(1);
  });
});

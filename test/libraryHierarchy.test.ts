import { describe, expect, it } from 'vitest';
import {
  createLibraryItem, deleteLibraryItem, deleteLibraryItems, duplicateLibraryItem,
  getLibrarySelectionIds, type LibraryFolder, type LibraryItem,
} from '../src/utils/library';

const folder = (id: string, parentId: string | null = null): LibraryFolder =>
  ({ id, name: id, parentId, type: 'folder', createdAt: 1, updatedAt: 1 });
const game = (id: string, parentId: string | null = null) => ({
  ...createLibraryItem(id, `(;GM[1]SZ[9]C[${id}];B[dd])`, parentId, 1),
  id, favorite: true, tags: ['review'],
});

describe('library hierarchy operations', () => {
  it('copies an unordered deep collection with independent IDs and intact record data', () => {
    const folders = Array.from({ length: 3000 }, (_, i) => folder(`folder-${i}`, i ? `folder-${i - 1}` : null));
    const games = folders.map((f, i) => game(`game-${i}`, f.id));
    const unrelated = game('unrelated');
    const items: LibraryItem[] = [...games, ...folders.reverse(), unrelated];
    for (const item of items) Object.freeze(item);
    const result = duplicateLibraryItem(items, 'folder-0', 100);
    expect(result.duplicatedIds).toHaveLength(6000);
    const originals = new Set(items.map(item => item.id));
    const copies = result.items.filter(item => !originals.has(item.id));
    expect(new Set(copies.map(item => item.id)).size).toBe(6000);
    expect(result.items.slice(6000)).toEqual(items);
    const byName = new Map(copies.map(item => [item.name, item]));
    const root = result.duplicated!;
    expect(root).toMatchObject({ name: 'folder-0 (copy)', parentId: null, createdAt: 100, updatedAt: 100 });
    for (let i = 0; i < 3000; i++) {
      const copiedFolder = i === 0 ? root : byName.get(`folder-${i}`)!;
      if (i > 0) expect(copiedFolder.parentId).toBe(i === 1 ? root.id : byName.get(`folder-${i - 1}`)!.id);
      const copiedGame = byName.get(`game-${i}`)!;
      expect(copiedGame).toMatchObject({ parentId: copiedFolder.id, createdAt: 100, updatedAt: 100,
        sgf: games[i]!.sgf, metadata: games[i]!.metadata, favorite: true, tags: ['review'] });
    }
    expect(result.items.at(-1)).toBe(unrelated);
  });

  it('counts overlapping selections once and deletes only the selected trees', () => {
    const root = folder('root'), child = folder('child', 'root');
    const leaf = game('leaf', child.id), direct = game('direct', root.id);
    const other = folder('other'), kept = game('kept', other.id);
    const items = [leaf, direct, kept, child, other, root];
    const selected = ['root', 'child', 'leaf', 'root', 'missing'];
    expect(getLibrarySelectionIds(items, selected)).toEqual(new Set(['root', 'child', 'leaf', 'direct']));
    const result = deleteLibraryItems(items, selected);
    expect(result).toEqual([kept, other]);
    expect(result[0]).toBe(kept);
    expect(result[1]).toBe(other);
    expect(items).toHaveLength(6);
  });

  it('deletes a selected leaf without removing its parent or siblings', () => {
    const root = folder('root'), leaf = game('leaf', root.id), sibling = game('sibling', root.id);
    const items = [root, leaf, sibling];
    expect(getLibrarySelectionIds(items, [leaf.id])).toEqual(new Set([leaf.id]));
    expect(deleteLibraryItem(items, leaf.id)).toEqual([root, sibling]);
  });

  it('uses the latest contents while preserving unrelated additions', () => {
    const root = folder('root'), first = game('first', root.id), other = game('other');
    const selected = new Set([root.id]);
    expect(getLibrarySelectionIds([root, first, other], selected).size).toBe(2);
    const newChild = game('new-child', root.id), newUnrelated = game('new-unrelated');
    expect(deleteLibraryItems([root, first, other, newChild, newUnrelated], selected)).toEqual([other, newUnrelated]);
  });

  it('finishes a cyclic descendant graph without counting or copying a record twice', () => {
    const a = folder('a', 'b'), b = folder('b', 'a'), leaf = game('leaf', b.id), kept = game('kept');
    const items = [leaf, a, kept, b];
    expect(getLibrarySelectionIds(items, [a.id, b.id])).toEqual(new Set([a.id, b.id, leaf.id]));
    expect(deleteLibraryItems(items, [a.id])).toEqual([kept]);
    const copy = duplicateLibraryItem(items, a.id);
    expect(copy.duplicatedIds).toHaveLength(3);
    expect(new Set(copy.duplicatedIds).size).toBe(3);
  });

  it('ignores absent selections and consumes a selection iterator once', () => {
    const orphan = game('orphan', 'missing'), kept = game('kept');
    const items = [orphan, kept];
    expect(getLibrarySelectionIds(items, ['missing'])).toEqual(new Set());
    expect(deleteLibraryItems(items, [])).toBe(items);
    expect(deleteLibraryItems(items, ['missing'])).toBe(items);
    function* selection() { yield orphan.id; yield orphan.id; }
    expect(deleteLibraryItems(items, selection())).toEqual([kept]);
  });
});

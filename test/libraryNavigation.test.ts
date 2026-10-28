import { describe, expect, it } from 'vitest';
import type { LibraryFolder, LibraryItem } from '../src/utils/library';
import { getLibraryFolderPath } from '../src/utils/libraryNavigation';

const folder = (id: string, parentId: string | null): LibraryFolder => ({ id, parentId, name: id, type: 'folder', createdAt: 1, updatedAt: 1 });
const index = (items: LibraryItem[]) => new Map(items.map(item => [item.id, item]));

describe('library folder paths', () => {
  it('orders folder breadcrumbs and containing game folders from the root', () => {
    const items = index([
      folder('root', null), folder('middle', 'root'), folder('leaf', 'middle'),
      { id: 'game', parentId: 'leaf', name: 'Game', type: 'file', sgf: '(;)', metadata: {}, size: 3, moveCount: 0, createdAt: 1, updatedAt: 1 },
    ]);
    expect(getLibraryFolderPath(items, 'leaf').map(item => item.id)).toEqual(['root', 'middle', 'leaf']);
    expect(getLibraryFolderPath(items, 'game').map(item => item.id)).toEqual(['root', 'middle', 'leaf']);
    expect(getLibraryFolderPath(items, null)).toEqual([]);
    expect(getLibraryFolderPath(items, 'missing')).toEqual([]);
  });

  it('bounds cycles and preserves a reachable partial path without changing the records', () => {
    const a = Object.freeze(folder('a', 'b'));
    const b = Object.freeze(folder('b', 'a'));
    const items = index([a, b, folder('orphan', 'missing')]);
    expect(getLibraryFolderPath(items, 'a').map(item => item.id)).toEqual(['b', 'a']);
    expect(getLibraryFolderPath(items, 'orphan').map(item => item.id)).toEqual(['orphan']);
    expect(a.parentId).toBe('b');
    expect(b.parentId).toBe('a');
  });

  it('walks a 12,000-folder path with one indexed lookup per level', () => {
    const items = index(Array.from({ length: 12000 }, (_, i) => folder(`folder-${i}`, i ? `folder-${i - 1}` : null)).reverse());
    const originalGet = items.get.bind(items);
    let lookups = 0;
    items.get = id => { lookups++; return originalGet(id); };
    const trail = getLibraryFolderPath(items, 'folder-11999');
    expect(trail).toHaveLength(12000);
    expect(trail[0].id).toBe('folder-0');
    expect(trail.at(-1)?.id).toBe('folder-11999');
    expect(lookups).toBe(12000);
  });
});

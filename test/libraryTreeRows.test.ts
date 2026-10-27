import { describe, expect, it } from 'vitest';
import { getVisibleLibraryTreeRows, libraryTreeIndent } from '../src/utils/libraryTreeRows';
import type { LibraryItem } from '../src/utils/library';

const folder = (id: string, parentId: string | null = null): LibraryItem =>
  ({ id, name: id, parentId, type: 'folder', createdAt: 1, updatedAt: 1 });

describe('visible Library tree traversal', () => {
  it('retains every row and exact depth in a fully expanded 12,000-folder chain', () => {
    const items = Array.from({ length: 12000 }, (_, i) => folder(`folder-${i}`, i ? `folder-${i - 1}` : null));
    const children = new Map(items.map(item => [item.parentId, [item]]));
    const rows = getVisibleLibraryTreeRows(children, new Set(items.map(item => item.id)), () => 100);
    expect(rows).toHaveLength(items.length);
    expect(rows.map(row => row.kind === 'item' && [row.item.id, row.depth]))
      .toEqual(items.map((item, index) => [item.id, index]));
    expect(libraryTreeIndent(12000)).toBeLessThan(100);
    expect(libraryTreeIndent(1)).toBe(28);
  });

  it('keeps sibling order, collapsed descendants and independent paging controls', () => {
    const a = folder('a'), b = folder('b'), c = folder('c');
    const nested = folder('nested', 'a');
    const children = new Map([
      [null, [a, b, c]], ['a', [nested, folder('hidden', 'a')]],
      ['nested', [folder('inside', 'nested')]], ['b', [folder('collapsed', 'b')]],
    ]);
    const expanded = new Set(['a', 'nested']);
    const rows = getVisibleLibraryTreeRows(children, expanded, key => key === '' ? 2 : 1);
    expect(rows.map(row => row.kind === 'item' ? [row.item.id, row.depth] : ['more', row.parentId, row.total, row.depth]))
      .toEqual([['a', 0], ['nested', 1], ['inside', 2], ['more', 'a', 2, 1], ['b', 0], ['more', null, 3, 0]]);
    expect(rows.filter(row => row.kind === 'item').map(row => [row.item.id, row.position, row.total]))
      .toEqual([['a', 1, 3], ['nested', 1, 2], ['inside', 1, 1], ['b', 2, 3]]);
    expect(getVisibleLibraryTreeRows(children, expanded, () => 10).filter(row => row.kind === 'more')).toEqual([]);
    expect(children.get(null)).toEqual([a, b, c]);
  });

  it('does not revisit a cyclic or repeated folder', () => {
    const a = folder('a'), b = folder('b', 'a');
    const children = new Map([[null, [a, a]], ['a', [b]], ['b', [a]]]);
    expect(getVisibleLibraryTreeRows(children, new Set(['a', 'b']), () => 100).map(row => row.kind === 'item' && row.item.id))
      .toEqual(['a', 'b']);
  });
});

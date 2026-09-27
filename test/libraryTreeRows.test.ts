import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLibraryFolder, createLibraryItem, type LibraryItem } from '../src/utils/library';
import {
  LIBRARY_TREE_INDENT_LEVELS,
  LIBRARY_TREE_MAX_DEPTH,
  flattenLibraryTreeRows,
  libraryTreeIndent,
} from '../src/utils/libraryTreeRows';

const SGF = '(;GM[1]SZ[9];B[aa])';

const treeOf = (items: LibraryItem[]) => {
  const children = new Map<string | null, LibraryItem[]>();
  for (const item of items) {
    const list = children.get(item.parentId) ?? [];
    list.push(item);
    children.set(item.parentId, list);
  }
  return {
    roots: children.get(null) ?? [],
    childrenOf: (id: string) => children.get(id) ?? [],
  };
};

/** A chain of folders, each inside the last, with a game at the bottom. */
const chain = (depth: number) => {
  const folders: LibraryItem[] = [];
  let parentId: string | null = null;
  for (let i = 0; i < depth; i++) {
    const folder = createLibraryFolder(`Level ${i}`, parentId);
    folders.push(folder);
    parentId = folder.id;
  }
  return [...folders, createLibraryItem('Bottom', SGF, parentId)];
};

describe('flattening the Library tree', () => {
  it('lists expanded folders’ contents in order, with their depth', () => {
    const outer = createLibraryFolder('Outer');
    const inner = createLibraryFolder('Inner', outer.id);
    const deep = createLibraryItem('Deep', SGF, inner.id);
    const beside = createLibraryItem('Beside', SGF, outer.id);
    const top = createLibraryItem('Top', SGF);
    const rows = flattenLibraryTreeRows({
      ...treeOf([outer, inner, deep, beside, top]),
      isExpanded: () => true,
      limitFor: () => 100,
    });
    expect(rows.map((row) => (row.kind === 'item' ? `${row.depth}:${row.item.name}` : row.kind))).toEqual([
      '0:Outer', '1:Inner', '2:Deep', '1:Beside', '0:Top',
    ]);
  });

  it('skips collapsed folders and adds Show more where a list is cut', () => {
    const folder = createLibraryFolder('Folder');
    const games = Array.from({ length: 5 }, (_, i) => createLibraryItem(`G${i}`, SGF, folder.id));
    const hidden = createLibraryFolder('Collapsed');
    const inside = createLibraryItem('Hidden', SGF, hidden.id);
    const rows = flattenLibraryTreeRows({
      ...treeOf([folder, ...games, hidden, inside]),
      isExpanded: (id) => id === folder.id,
      limitFor: (key) => (key === folder.id ? 2 : 100),
    });
    expect(rows.map((row) => row.kind === 'item' ? row.item.name : `${row.kind}:${row.kind === 'more' ? row.total : ''}`))
      .toEqual(['Folder', 'G0', 'G1', 'more:5', 'Collapsed']);
    expect(rows[3]).toMatchObject({ kind: 'more', listKey: folder.id, depth: 1 });
  });

  /**
   * Each folder row rendered its children itself, so an expanded chain was
   * one nested call and one nested element per level.
   */
  it('walks a chain thousands of folders deep without recursion, stopping at the limit', () => {
    const items = chain(5000);
    const rows = flattenLibraryTreeRows({ ...treeOf(items), isExpanded: () => true, limitFor: () => 100 });
    const itemRows = rows.filter((row) => row.kind === 'item');
    expect(itemRows).toHaveLength(LIBRARY_TREE_MAX_DEPTH + 1);
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'too-deep', depth: LIBRARY_TREE_MAX_DEPTH + 1 });
  });

  it('shows everything inside a chain within the limit', () => {
    const items = chain(LIBRARY_TREE_MAX_DEPTH);
    const rows = flattenLibraryTreeRows({ ...treeOf(items), isExpanded: () => true, limitFor: () => 100 });
    expect(rows.some((row) => row.kind === 'too-deep')).toBe(false);
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'item', depth: LIBRARY_TREE_MAX_DEPTH });
  });

  it('does not loop on a parent cycle', () => {
    const a = { ...createLibraryFolder('A'), id: 'a', parentId: 'b' };
    const b = { ...createLibraryFolder('B'), id: 'b', parentId: 'a' };
    const children = new Map([['a', [b]], ['b', [a]]]);
    const rows = flattenLibraryTreeRows({
      roots: [a],
      childrenOf: (id) => children.get(id) ?? [],
      isExpanded: () => true,
      limitFor: () => 100,
    });
    expect(rows.map((row) => row.kind === 'item' && row.item.id)).toEqual(['a', 'b']);
  });

  it('stops indenting past a dozen levels', () => {
    expect(libraryTreeIndent(0)).toBe(12);
    expect(libraryTreeIndent(LIBRARY_TREE_INDENT_LEVELS)).toBe(libraryTreeIndent(LIBRARY_TREE_INDENT_LEVELS + 20));
  });
});

describe('the Library panel tree', () => {
  it('renders the flattened rows, not nested folder rows', () => {
    const source = readFileSync('src/components/LibraryPanel.tsx', 'utf8');
    expect(source).toContain('{treeRows.map(renderTreeRow)}');
    const folderRow = source.slice(source.indexOf('const renderFolderRow'), source.indexOf('const renderTooDeepRow'));
    expect(folderRow).not.toContain('renderFolderRow(child');
    expect(folderRow).toContain('aria-level={depth + 1}');
  });
});

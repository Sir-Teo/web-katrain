import { describe, expect, it } from 'vitest';
import { getLibraryFolderOptions, type LibraryFolder } from '../src/utils/library';

const folder = (id: string, parentId: string | null, name = id, createdAt = 1): LibraryFolder =>
  ({ id, parentId, name, createdAt, updatedAt: createdAt, type: 'folder' });

describe('library folder picker traversal', () => {
  it('retains every folder and its depth in a reverse-ordered 12,000-folder backup', () => {
    const folders = Array.from({ length: 12000 }, (_, i) =>
      Object.freeze(folder(`folder-${i}`, i ? `folder-${i - 1}` : null)));
    const items = Object.freeze([...folders].reverse());
    const options = getLibraryFolderOptions(items);
    expect(options).toHaveLength(folders.length);
    expect(options.map(option => [option.id, option.depth])).toEqual(folders.map((item, i) => [item.id, i]));
    expect(items[0]).toBe(folders.at(-1));
  });

  it('preserves sorted depth-first order and includes orphaned/cyclic folders once', () => {
    const items = [
      folder('cycle-a', 'cycle-b'), folder('cycle-b', 'cycle-a'), folder('cycle-leaf', 'cycle-b'),
      folder('late-branch', 'root', 'Branch', 2), folder('leaf', 'early-branch', 'Leaf'),
      folder('early-branch', 'root', 'Branch', 1), folder('root', null, 'Root'),
      folder('orphan', 'missing', 'Orphan'), folder('self-cycle', 'self-cycle'),
    ];
    expect(getLibraryFolderOptions(items).map(({ id, depth }) => [id, depth])).toEqual([
      ['orphan', 0], ['root', 0], ['early-branch', 1], ['leaf', 2], ['late-branch', 1],
      ['cycle-a', 0], ['cycle-b', 1], ['cycle-leaf', 2], ['self-cycle', 0],
    ]);
  });
});

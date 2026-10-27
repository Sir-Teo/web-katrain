import { describe, expect, it } from 'vitest';
import { createLibraryFolder, createLibraryItem } from '../src/utils/library';
import { mergeOgsLibraryImports } from '../src/utils/libraryOgsImport';

const sgf = '(;GM[1]SZ[9];B[dd])';

describe('merging completed OGS syncs', () => {
  it('retains imports and edits that completed while the sync was downloading', () => {
    const local = createLibraryItem('Late local import', '(;SZ[9]C[Local notes])');
    const edited = { ...createLibraryItem('My study', sgf), favorite: true, tags: ['review'] };
    const folder = createLibraryFolder('OGS - Player');
    const synced = createLibraryItem('Game (ogs-123)', sgf, folder.id);
    const result = mergeOgsLibraryImports([local, edited], folder, [synced]);
    expect(result).toEqual([synced, folder, local, edited]);
    expect(result[2]).toBe(local);
    expect(result[3]).toBe(edited);
  });

  it('uses a destination folder that arrived during the sync and preserves its current games', () => {
    const proposed = createLibraryFolder('OGS - Player');
    const arrived = createLibraryFolder('OGS - Player');
    const oldGame = createLibraryItem('Game (ogs-123)', '(;SZ[9]C[Existing notes])', arrived.id);
    const unrelated = createLibraryFolder('Other studies');
    const first = Object.freeze(createLibraryItem('Game (ogs-124)', sgf, proposed.id));
    const second = Object.freeze(createLibraryItem('Game (ogs-125)', sgf, proposed.id));
    const result = mergeOgsLibraryImports([arrived, oldGame, unrelated], proposed, [first, second]);
    expect(result).toEqual([
      { ...first, parentId: arrived.id },
      { ...second, parentId: arrived.id },
      arrived, oldGame, unrelated,
    ]);
    expect(result.some((item) => item.id === proposed.id)).toBe(false);
    expect(first.parentId).toBe(proposed.id);
  });

  it('does not create a destination for an empty sync', () => {
    const items = [createLibraryItem('Keep', sgf)];
    expect(mergeOgsLibraryImports(items, createLibraryFolder('OGS - Player'), [])).toBe(items);
  });

  it('skips games that arrived in another folder and repeated IDs within a download batch', () => {
    const other = createLibraryFolder('Other studies');
    const existing = { ...createLibraryItem('Annotated game (ogs-123)', '(;SZ[9]C[Keep my notes])', other.id), favorite: true, tags: ['review'] };
    const proposed = createLibraryFolder('OGS - Player');
    const duplicate = createLibraryItem('Downloaded game (ogs-123)', sgf, proposed.id);
    const first = Object.freeze(createLibraryItem('New game (ogs-124)', sgf, proposed.id));
    const repeated = createLibraryItem('Repeated game (ogs-124)', sgf, proposed.id);
    expect(mergeOgsLibraryImports([other, existing], proposed, [duplicate, first, repeated]))
      .toEqual([first, proposed, other, existing]);
  });

  it('retains the current array and creates no destination when every game arrived during download', () => {
    const existing = createLibraryItem('Existing (ogs-123)', '(;SZ[9]C[Keep me])');
    const items = [existing];
    const folder = createLibraryFolder('OGS - Player');
    expect(mergeOgsLibraryImports(items, folder, [createLibraryItem('Downloaded (ogs-123)', sgf, folder.id)]))
      .toBe(items);
  });
});

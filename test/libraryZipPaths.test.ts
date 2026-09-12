import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createLibraryFolder, createLibraryItem } from '../src/utils/library';
import { createLibraryZipBlob, importLibraryItemsFromZip } from '../src/utils/libraryZip';

const sgfA = '(;GM[1]SZ[9]C[First game];B[ee])';
const sgfB = '(;GM[1]SZ[9]C[Second game];B[dd])';

describe('library ZIP path identity', () => {
  it('keeps same-named folders and their descendants separate through a round trip', async () => {
    const first = createLibraryFolder('Reviews');
    const second = createLibraryFolder('Reviews');
    const nestedA = createLibraryFolder('Week 1', first.id);
    const nestedB = createLibraryFolder('Week 1', second.id);
    // Files may occur before their folders in persisted collections.
    const items = [
      createLibraryItem('Game', sgfA, nestedA.id),
      createLibraryItem('Game', sgfB, nestedB.id),
      first, second, nestedA, nestedB,
    ];
    const { blob, fileCount } = await createLibraryZipBlob(items);
    const restored = await importLibraryItemsFromZip(blob);
    const folders = restored.filter((item) => item.type === 'folder');
    const files = restored.filter((item) => item.type === 'file');
    expect(fileCount).toBe(2);
    expect(folders).toHaveLength(4);
    expect(files).toHaveLength(2);
    expect(files[0]!.parentId).not.toBe(files[1]!.parentId);
    const byId = new Map(restored.map((item) => [item.id, item]));
    const ancestors = files.map((file) => byId.get(byId.get(file.parentId!)!.parentId!)!.name);
    expect(new Set(ancestors)).toEqual(new Set(['Reviews', 'Reviews (2)']));
    expect(new Set(files.map((file) => file.sgf))).toEqual(new Set([sgfA, sgfB]));
  });

  it('disambiguates folder names that sanitize to the same archive path', async () => {
    const first = createLibraryFolder('Review?');
    const second = createLibraryFolder('Review*');
    const { blob } = await createLibraryZipBlob([
      first, second,
      createLibraryItem('Game', sgfA, first.id),
      createLibraryItem('Game', sgfB, second.id),
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    await expect(zip.file('Review_/Game.sgf')?.async('string')).resolves.toBe(sgfA);
    await expect(zip.file('Review_ (2)/Game.sgf')?.async('string')).resolves.toBe(sgfB);
  });

  it('keeps path separators inside library names from changing the hierarchy or dropping games', async () => {
    const folder = createLibraryFolder('../Studies\\Week 1');
    const { blob } = await createLibraryZipBlob([folder, createLibraryItem('../Game', sgfA, folder.id)]);
    const restored = await importLibraryItemsFromZip(blob);
    expect(restored.filter((item) => item.type === 'folder')).toHaveLength(1);
    const files = restored.filter((item) => item.type === 'file');
    expect(files).toHaveLength(1);
    expect(files[0]!.sgf).toBe(sgfA);
  });

  it('preserves a library folder whose name is reserved for ZIP metadata', async () => {
    const folder = createLibraryFolder('__MACOSX');
    const { blob } = await createLibraryZipBlob([folder, createLibraryItem('Game', sgfA, folder.id)]);
    const restored = await importLibraryItemsFromZip(blob);
    expect(restored.filter((item) => item.type === 'folder')).toHaveLength(1);
    expect(restored.filter((item) => item.type === 'file')).toMatchObject([{ sgf: sgfA }]);
  });

  it('avoids file/folder and case-only path conflicts when extracting on ordinary desktop filesystems', async () => {
    const folder = createLibraryFolder('Game.sgf');
    const { blob } = await createLibraryZipBlob([
      createLibraryItem('Game', sgfA),
      createLibraryItem('game', sgfB),
      folder,
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.files['Game.sgf/']?.dir).toBe(true);
    await expect(zip.file('Game (2).sgf')?.async('string')).resolves.toBe(sgfA);
    await expect(zip.file('game (3).sgf')?.async('string')).resolves.toBe(sgfB);
  });

  it('exports overlapping folder selections once and excludes unrelated games', async () => {
    const folder = createLibraryFolder('Selected');
    const nested = createLibraryFolder('Nested', folder.id);
    const game = createLibraryItem('Game', sgfA, nested.id);
    const unrelated = createLibraryItem('Excluded', sgfB);
    const { blob, fileCount } = await createLibraryZipBlob(
      [game, unrelated, nested, folder], new Set([folder.id, nested.id, game.id]),
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(fileCount).toBe(1);
    await expect(zip.file('Selected/Nested/Game.sgf')?.async('string')).resolves.toBe(sgfA);
    expect(zip.file('Excluded.sgf')).toBeNull();
  });
});

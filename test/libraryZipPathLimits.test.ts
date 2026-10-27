import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createLibraryFolder, createLibraryItem } from '../src/utils/library';
import { createLibraryZipBlob, LibraryZipPathError } from '../src/utils/libraryZip';

const sgf = '(;SZ[9];B[dd])';

describe('ZIP path field limits', () => {
  it('round-trips an ASCII filename at the 16-bit field limit', async () => {
    const name = `${'a'.repeat(65531)}.sgf`;
    const { blob } = await createLibraryZipBlob([createLibraryItem(name, sgf)]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    await expect(zip.file(name)?.async('string')).resolves.toBe(sgf);
  });

  it('rejects an ASCII filename above the field limit', async () => {
    await expect(createLibraryZipBlob([createLibraryItem('a'.repeat(65532), sgf)]))
      .rejects.toBeInstanceOf(LibraryZipPathError);
  });

  it('accounts for the Unicode path extra field as well as the filename', async () => {
    const valid = `${'é'.repeat(32761)}.sgf`;
    const { blob } = await createLibraryZipBlob([createLibraryItem(valid, sgf)]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    await expect(zip.file(valid)?.async('string')).resolves.toBe(sgf);
    await expect(createLibraryZipBlob([createLibraryItem('é'.repeat(32762), sgf)]))
      .rejects.toBeInstanceOf(LibraryZipPathError);
  });

  it('includes the trailing slash when validating a directory', async () => {
    const valid = createLibraryFolder('a'.repeat(65534));
    const { blob } = await createLibraryZipBlob([valid]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.files[`${valid.name}/`]?.dir).toBe(true);
    await expect(createLibraryZipBlob([createLibraryFolder('a'.repeat(65535))]))
      .rejects.toBeInstanceOf(LibraryZipPathError);
  });

  it('rejects a deep Unicode hierarchy before generating an archive that loses its game', async () => {
    const folders = Array.from({ length: 180 }, (_, i) => ({
      ...createLibraryFolder('😀'.repeat(96), i ? `folder-${i - 1}` : null), id: `folder-${i}`,
    }));
    await expect(createLibraryZipBlob([...folders, createLibraryItem('Leaf', sgf, 'folder-179')]))
      .rejects.toThrow('JSON library backup');
  });
});

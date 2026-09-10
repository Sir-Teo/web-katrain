import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createLibraryFolder, createLibraryItem, type LibraryItem } from '../src/utils/library';
import { createLibraryZipBlob, importLibraryItemsFromZip } from '../src/utils/libraryZip';

const sgfA = '(;GM[1]SZ[19]PB[Black A]PW[White A];B[pd])';
const sgfB = '(;GM[1]SZ[9]PB[Black B]PW[White B];B[dd];W[ee])';

describe('library ZIP helpers', () => {
  it('exports library items as a folder-preserving ZIP', async () => {
    const folder = createLibraryFolder(`Pro${String.fromCharCode(0x202e)} Games`, null);
    const nested = createLibraryFolder('2026', folder.id);
    const rootGame = createLibraryItem('Root Game', sgfA, null);
    const nestedGame = createLibraryItem(`Nested${String.fromCharCode(0x200b)} Game`, sgfB, nested.id);
    const items: LibraryItem[] = [folder, nested, rootGame, nestedGame];

    const { blob, fileCount } = await createLibraryZipBlob(items);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(fileCount).toBe(2);
    expect(zip.file('Root Game.sgf')).toBeTruthy();
    expect(zip.file('Pro Games/2026/Nested Game.sgf')).toBeTruthy();
    await expect(zip.file('Pro Games/2026/Nested Game.sgf')?.async('string')).resolves.toBe(sgfB);
  });

  it('exports a selected folder with descendants as a ZIP subset', async () => {
    const folder = createLibraryFolder('Pro Games', null);
    const nested = createLibraryFolder('2026', folder.id);
    const rootGame = createLibraryItem('Root Game', sgfA, null);
    const nestedGame = createLibraryItem('Nested Game', sgfB, nested.id);
    const items: LibraryItem[] = [folder, nested, rootGame, nestedGame];

    const { blob, fileCount } = await createLibraryZipBlob(items, new Set([folder.id]));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(fileCount).toBe(1);
    expect(zip.file('Root Game.sgf')).toBeFalsy();
    expect(zip.file('Pro Games/2026/Nested Game.sgf')).toBeTruthy();
  });

  it('carries empty folders through an export and back', async () => {
    // A folder the reader made to organise studies is theirs whether or not a
    // game has landed in it yet; a backup that quietly drops it loses work.
    const studies = createLibraryFolder('Studies', null);
    const nestedEmpty = createLibraryFolder('Nested Empty', studies.id);
    const rootEmpty = createLibraryFolder('Empty Ideas', null);
    const game = createLibraryItem('Game A', sgfA, studies.id);
    const items: LibraryItem[] = [studies, nestedEmpty, rootEmpty, game];

    const { blob } = await createLibraryZipBlob(items);
    const imported = await importLibraryItemsFromZip(blob, null);
    const folders = imported.filter((item) => item.type === 'folder');

    expect(folders.map((folder) => folder.name).sort()).toEqual(['Empty Ideas', 'Nested Empty', 'Studies']);
    const studiesBack = folders.find((folder) => folder.name === 'Studies')!;
    expect(folders.find((folder) => folder.name === 'Nested Empty')?.parentId).toBe(studiesBack.id);
    expect(folders.find((folder) => folder.name === 'Empty Ideas')?.parentId).toBeNull();
    expect(imported.filter((item) => item.type === 'file')).toHaveLength(1);
  });

  it('imports SGFs from ZIP paths into library folders', async () => {
    const zip = new JSZip();
    zip.file('Study/Openings/Game A.sgf', sgfA);
    zip.file(`Study/End${String.fromCharCode(0x202e)}game/Game${String.fromCharCode(0x200b)} B.sgf`, sgfB);
    zip.file('Study/Bad/Invalid.sgf', 'not an SGF game');
    zip.file('OnlyBad/Invalid.sgf', 'not an SGF game');
    zip.file('../ignored.sgf', sgfA);
    zip.file('__MACOSX/metadata.sgf', sgfA);
    const blob = await zip.generateAsync({ type: 'blob' });

    const imported = await importLibraryItemsFromZip(blob, null);
    const folders = imported.filter((item) => item.type === 'folder');
    const files = imported.filter((item) => item.type === 'file');

    expect(files).toHaveLength(2);
    expect(folders.map((folder) => folder.name).sort()).toEqual(['Endgame', 'Openings', 'Study'].sort());
    expect(folders.map((folder) => folder.name)).not.toContain('Bad');
    expect(folders.map((folder) => folder.name)).not.toContain('OnlyBad');
    expect(files.map((file) => file.name).sort()).toEqual(['Game A', 'Game B'].sort());
    expect(files.find((file) => file.name === 'Game A')?.parentId).toBe(
      folders.find((folder) => folder.name === 'Openings')?.id
    );
  });
});

describe('an archive someone else made', () => {
  const zipOf = async (files: Record<string, string>): Promise<Uint8Array> => {
    const zip = new JSZip();
    for (const [name, body] of Object.entries(files)) zip.file(name, body);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  };

  it('still imports an ordinary backup whole', async () => {
    const bytes = await zipOf({
      'Games/One.sgf': '(;GM[1]FF[4]SZ[19];B[pd])',
      'Games/Two.sgf': '(;GM[1]FF[4]SZ[9];B[cc])',
      'Three.sgf': '(;GM[1]FF[4]SZ[13];B[dd])',
    });

    const items = await importLibraryItemsFromZip(bytes);

    expect(items.filter((item) => item.type === 'file')).toHaveLength(3);
  });

  it('skips an entry the archive itself says is too big to be a game', async () => {
    // Measured before this: a 199KB zip holding one 200MB entry cost 402MB of
    // heap and 248ms, then imported nothing. The declared size is free to read.
    const bytes = await zipOf({ 'bomb.sgf': 'a'.repeat(200 * 1024 * 1024) });

    const before = process.memoryUsage().heapUsed;
    const started = Date.now();
    const items = await importLibraryItemsFromZip(bytes);

    expect(items).toHaveLength(0);
    expect(Date.now() - started, 'should not have expanded it').toBeLessThan(1000);
    expect((process.memoryUsage().heapUsed - before) / 1048576, 'heap cost in MB').toBeLessThan(64);
  }, 60000);

  it('stops once the archive as a whole has expanded far enough', async () => {
    // Each entry is small enough to pass on its own; together they are not.
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i += 1) files[`fill-${i}.sgf`] = 'a'.repeat(4 * 1024 * 1024);
    const bytes = await zipOf(files);

    const started = Date.now();
    const items = await importLibraryItemsFromZip(bytes);

    // None of them is a game, so nothing is imported either way; what matters
    // is that it stopped rather than expanding 120MB of them.
    expect(items.filter((item) => item.type === 'file')).toHaveLength(0);
    expect(Date.now() - started).toBeLessThan(20000);
  }, 60000);
});

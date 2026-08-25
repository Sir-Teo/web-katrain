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

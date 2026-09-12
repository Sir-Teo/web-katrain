import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createLibraryZipBlob, importLibraryItemsFromZip } from '../src/utils/libraryZip';
import { parseSgf } from '../src/utils/sgf';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/legacy-games/${name}`, import.meta.url));

describe('legacy library game imports', () => {
  it('imports a mixed-format archive with names and folders, skipping malformed games', async () => {
    const zip = new JSZip();
    zip.file('Games/Korean.GIB', fixture('tygem-korean.gib'));
    const ngf = new TextDecoder('shift_jis').decode(fixture('wbaduk-japanese.ngf'));
    zip.file('Games/Japanese.NGF', ngf);
    zip.file('Games/Modern.sgf', '(;SZ[9]CA[UTF-8]PB[Modern];B[cc])');
    zip.file('Invalid/broken.gib', 'INI 0 1 0\nSTO 0 1 1 19 3');
    zip.file('Invalid/broken.ngf', ngf.replace('PMABWQRRQ', 'PMABWZZZZ'));
    zip.file('Ignored.txt', 'STO 0 1 1 3 3');
    const imported = await importLibraryItemsFromZip(await zip.generateAsync({ type: 'uint8array' }), 'target');
    const files = imported.filter((item) => item.type === 'file');
    const folders = imported.filter((item) => item.type === 'folder');
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ name: 'Games', parentId: 'target' });
    expect(files.map((file) => file.name)).toEqual(['Japanese', 'Korean', 'Modern']);
    expect(files.every((file) => file.parentId === folders[0]!.id)).toBe(true);
    expect(files.map((file) => file.metadata.black)).toEqual(['高尾紳路', '이창호', 'Modern']);
    expect(parseSgf(files.find((file) => file.name === 'Korean')!.sgf).tree!.props).toMatchObject({ HA: ['3'], AB: ['pd', 'dp', 'dd'] });
    expect(parseSgf(files.find((file) => file.name === 'Japanese')!.sgf).tree!.props).toMatchObject({ HA: ['2'], KM: ['0'] });
    expect(parseSgf(files.find((file) => file.name === 'Japanese')!.sgf).moves).toHaveLength(3);

    const { blob } = await createLibraryZipBlob(imported);
    const exported = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.values(exported.files).filter((file) => !file.dir).map((file) => file.name))
      .toEqual(['Games/Japanese.sgf', 'Games/Korean.sgf', 'Games/Modern.sgf']);
    const reopened = (await importLibraryItemsFromZip(blob)).filter((item) => item.type === 'file');
    expect(reopened.map((file) => file.sgf)).toEqual(files.map((file) => file.sgf));
  });

  it.each([
    ['tygem-chinese.gib', 'gb18030', '柯洁'],
    ['wbaduk-japanese.ngf', 'shift_jis', '高尾紳路'],
  ] as const)('applies the selected encoding to %s while respecting SGF CA', async (name, encoding, black) => {
    const zip = new JSZip();
    zip.file(name, fixture(name));
    zip.file('Modern.sgf', '(;SZ[19]CA[UTF-8]PB[棋譜];B[pd])');
    const items = await importLibraryItemsFromZip(await zip.generateAsync({ type: 'uint8array' }), null, encoding);
    const files = items.filter((item) => item.type === 'file');
    expect(files.map((file) => file.metadata.black)).toEqual(['棋譜', black]);
    expect(files.every((file) => file.sgf.includes('CA[UTF-8]'))).toBe(true);
  });
});

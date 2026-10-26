import { describe, expect, it } from 'vitest';
import { createLibraryFolder, createLibraryItem } from '../src/utils/library';
import { MAX_COLLECTION_SPLIT_GAMES, splitLibraryCollection } from '../src/utils/libraryCollection';
import { splitSgfGames } from '../src/utils/sgfScan';

const first = '(;GM[1]SZ[9]GN[Opening]PB[Alice]PW[Bob]C[Keep \\] and (;fake)]AB[aa];B[dd](;W[ee])(;W[ff]))';
const second = '(;GM[1]SZ[13]PB[Carol]PW[Dan]RE[W+R];B[aa];W[])';
const third = '(;SZ[19]GN[Final]C[continued\\\ntext];B[qq])';

describe('raw SGF collection splitting', () => {
  it('keeps escaped comments, setup stones, variations, and passes verbatim', () => {
    expect(splitSgfGames(`\uFEFF \n${first}\r\n${second}\t${third}\n`)).toEqual([first, second, third]);
  });

  it('keeps one game whole and does not treat a variation as another game', () => {
    expect(splitSgfGames(first)).toEqual([first]);
  });

  it.each([
    '(;SZ[9])(;SZ[13]', '(;C[unterminated)', '(;SZ[9]))',
    '(;SZ[9])text(;SZ[13])', '(;SZ[9])(;])', '((;SZ[9]))',
  ])('rejects incomplete or unaccounted-for content: %s', sgf => {
    expect(() => splitSgfGames(sgf)).toThrow();
  });

  it('does not recurse through deep variations', () => {
    const deep = `${'(;'.repeat(20_000)}${')'.repeat(20_000)}`;
    expect(splitSgfGames(`${deep}${second}`)).toEqual([deep, second]);
  });
});

describe('numbered collection folder', () => {
  it('retains the source and gives every game its own metadata and independent tags', () => {
    const parent = createLibraryFolder('Reviews');
    const source = { ...createLibraryItem('Championship', `${first}\n${second}\n${third}`, parent.id), favorite: true, tags: ['study'] };
    const result = splitLibraryCollection([parent, source], source.id, 1234);
    expect(result.folder.name).toBe('Championship games');
    expect(result.folder.parentId).toBe(parent.id);
    expect(result.folder.createdAt).toBe(1234);
    expect(result.files.map(file => file.name)).toEqual(['1. Opening', '2. Carol vs Dan', '3. Final']);
    expect(result.files.map(file => file.sgf)).toEqual([first, second, third]);
    expect(result.files.map(file => file.metadata.boardSize)).toEqual([9, 13, 19]);
    expect(result.files.map(file => file.moveCount)).toEqual([3, 2, 1]);
    expect(result.files.every(file => file.parentId === result.folder.id && file.favorite && file.updatedAt === 1234)).toBe(true);
    expect(new Set(result.items.map(item => item.id)).size).toBe(result.items.length);
    expect(result.items.find(item => item.id === source.id)).toBe(source);
    result.files[0]!.tags!.push('new tag');
    expect(source.tags).toEqual(['study']);
    expect(result.files[1]!.tags).toEqual(['study']);
  });

  it('reserves a unique destination name against sibling files and folders', () => {
    const source = createLibraryItem('Archive', `${first}${second}`);
    const existing = createLibraryFolder('ARCHIVE GAMES');
    const result = splitLibraryCollection([existing, source], source.id);
    expect(result.folder.name).toBe('Archive games 2');
    expect(result.files.every(file => file.parentId === result.folder.id)).toBe(true);
  });

  it('uses numbered source names when game names and players are missing', () => {
    const source = createLibraryItem('Archive', '(;SZ[9])(;SZ[13])');
    expect(splitLibraryCollection([source], source.id).files.map(file => file.name))
      .toEqual(['1. Archive', '2. Archive']);
  });

  it('keeps unsupported Go board sizes intact for the usual load-time notice', () => {
    const source = createLibraryItem('Sizes', '(;SZ[9])(;SZ[25]GN[Large])');
    const result = splitLibraryCollection([source], source.id);
    expect(result.files[1]?.sgf).toBe('(;SZ[25]GN[Large])');
    expect(result.files[1]?.metadata.boardSize).toBe(25);
  });

  it.each(['(;SZ[9])', '(;SZ[9])(;GM[2]SZ[8])', '(;SZ[9])(;SZ[13]'])('does not alter the library when extraction fails: %s', sgf => {
    const source = createLibraryItem('Original', sgf);
    const items = [source];
    expect(() => splitLibraryCollection(items, source.id)).toThrow();
    expect(items).toEqual([source]);
    expect(source.sgf).toBe(sgf);
  });

  it('rejects a deleted source and a folder', () => {
    const folder = createLibraryFolder('Folder');
    expect(() => splitLibraryCollection([folder], 'deleted')).toThrow('no longer');
    expect(() => splitLibraryCollection([folder], folder.id)).toThrow('no longer');
  });

  it('bounds item creation before expanding an unusually large collection', () => {
    const source = createLibraryItem('Large', '(;SZ[9])'.repeat(MAX_COLLECTION_SPLIT_GAMES + 1));
    expect(() => splitLibraryCollection([source], source.id)).toThrow('10,000');
  });
});

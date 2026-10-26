import { describe, expect, it } from 'vitest';
import { createLibraryFolder, createLibraryItem, prependLibraryImports } from '../src/utils/library';

const sgf = '(;GM[1]SZ[9];B[dd])';

describe('names for imported library batches', () => {
  it('reserves sibling names across files and folders while preserving hierarchy and content', () => {
    const existingFolder = createLibraryFolder('Studies');
    const existingGame = createLibraryItem('Game.SGF', sgf, existingFolder.id);
    const newFolder = Object.freeze(createLibraryFolder('studies'));
    const newChild = Object.freeze(createLibraryItem('Game.SGF', sgf, newFolder.id));
    const collision = Object.freeze(createLibraryItem('game.sgf', sgf, existingFolder.id));
    const secondCollision = Object.freeze(createLibraryItem('GAME.SGF', sgf, existingFolder.id));
    const imported = Object.freeze([newFolder, newChild, collision, secondCollision]);
    const previous = Object.freeze([existingFolder, existingGame]);
    const result = prependLibraryImports(previous, imported);
    expect(result.map((item) => item.name)).toEqual([
      'studies 2', 'Game.SGF', 'game 2.sgf', 'GAME 3.sgf', 'Studies', 'Game.SGF',
    ]);
    expect(result.map((item) => item.id)).toEqual([...imported, ...previous].map((item) => item.id));
    expect(result[1]).toBe(newChild);
    expect(result[1]!.parentId).toBe(newFolder.id);
    expect(result[2]).toMatchObject({ ...collision, name: 'game 2.sgf' });
    expect(collision.name).toBe('game.sgf');
    expect(result.slice(-2)).toEqual(previous);
  });

  it('uses names from earlier completed imports without losing either game', () => {
    const first = createLibraryItem('Race', '(;GM[1]SZ[9]C[First])');
    const second = createLibraryItem('Race', '(;GM[1]SZ[9]C[Second])');
    const afterSecond = prependLibraryImports([], [second]);
    const afterFirst = prependLibraryImports(afterSecond, [first]);
    expect(afterFirst).toEqual([{ ...first, name: 'Race 2' }, second]);
  });

  it('reserves Root names when the destination was deleted during a file read', () => {
    const existing = Object.freeze(createLibraryItem('Study', sgf));
    const incoming = Object.freeze(createLibraryItem('study', '(;SZ[13])', 'deleted-folder'));
    expect(prependLibraryImports([existing], [incoming])).toEqual([
      { ...incoming, parentId: null, name: 'study 2' }, existing,
    ]);
    expect(incoming.parentId).toBe('deleted-folder');
  });

  it('reroots an archive without flattening its folders when its destination disappears', () => {
    const existing = createLibraryFolder('Review');
    const incoming = Object.freeze(createLibraryFolder('Review', 'deleted-folder'));
    const nested = Object.freeze(createLibraryFolder('Round 1', incoming.id));
    const child = Object.freeze(createLibraryItem('Game', sgf, nested.id));
    const result = prependLibraryImports([existing], [child, nested, incoming]);
    expect(result).toEqual([child, nested, { ...incoming, parentId: null, name: 'Review 2' }, existing]);
    expect(result[0]).toBe(child);
    expect(result[1]).toBe(nested);
  });

  it('rejects file IDs as destinations while preserving a folder moved during the read', () => {
    const file = createLibraryItem('File', sgf);
    const outer = createLibraryFolder('Outer');
    const folder = createLibraryFolder('Moved', outer.id);
    const rootImport = createLibraryItem('Game', sgf, file.id);
    const movedImport = createLibraryItem('Game', sgf, folder.id);
    expect(prependLibraryImports([file, outer, folder], [rootImport, movedImport]).slice(0, 2))
      .toEqual([{ ...rootImport, parentId: null }, movedImport]);
  });

  it('fills the first available suffix and honors other names reserved in the batch', () => {
    const existing = ['Game', 'Game 3'].map((name) => createLibraryItem(name, sgf));
    const incoming = ['Game', 'Game 4', 'Game', 'Game 2'].map((name) => createLibraryItem(name, sgf));
    expect(prependLibraryImports(existing, incoming).slice(0, 4).map((item) => item.name))
      .toEqual(['Game 2', 'Game 4', 'Game 5', 'Game 2 2']);
  });

  it('allocates 12,000 same-named games without a timestamp fallback or collisions', () => {
    const template = createLibraryItem('Game.sgf', sgf);
    const incoming = Array.from({ length: 12_000 }, (_, index) => ({ ...template, id: `game-${index}` }));
    const result = prependLibraryImports([], incoming);
    expect(result).toHaveLength(incoming.length);
    expect(new Set(result.map((item) => item.name)).size).toBe(incoming.length);
    expect(result[0]!.name).toBe('Game.sgf');
    expect(result.at(-1)!.name).toBe('Game 12000.sgf');
  });
});

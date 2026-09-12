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

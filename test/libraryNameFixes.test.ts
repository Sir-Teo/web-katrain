import { describe, expect, it } from 'vitest';
import {
  compareLibraryNames,
  normalizeLibraryItems,
  suggestLibraryItemNameFromSgf,
} from '../src/utils/library';

describe('library names and ids', () => {
  it('sorts the app’s own numbered names in number order', () => {
    expect(['Game 1', 'Game 10', 'Game 2', 'Game 11'].sort(compareLibraryNames))
      .toEqual(['Game 1', 'Game 2', 'Game 10', 'Game 11']);
  });

  it('never cuts a name inside an emoji', () => {
    const name = suggestLibraryItemNameFromSgf(`(;GM[1]GN[${'a'.repeat(95)}😀tail])`);
    expect(name.endsWith('😀')).toBe(true);
    expect(/[\uD800-\uDBFF]$/.test(name)).toBe(false);
  });

  it('gives a repeated id a fresh one instead of losing the record', () => {
    const items = normalizeLibraryItems([
      { id: 'x', name: 'A', sgf: '(;GM[1])', type: 'file' },
      { id: 'x', name: 'B', sgf: '(;GM[1])', type: 'file' },
    ]);
    expect(items.map((item) => item.name)).toEqual(['A', 'B']);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
    expect(items[0]!.id).toBe('x');
  });
});

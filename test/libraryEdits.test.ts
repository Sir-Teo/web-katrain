import { describe, expect, it } from 'vitest';
import { createLibraryItem, setLibraryFileTags, toggleLibraryFileFavorite, updateLibraryFileSgf, updateLibraryItem } from '../src/utils/library';
import { applyLibraryChanges, getLibraryChanges } from '../src/utils/libraryEdits';

describe('library field edits against a newer collection', () => {
  const original = createLibraryItem('Study', '(;SZ[9])', null, 1);
  const newerSgf = '(;SZ[9];B[aa];W[bb])';

  it.each(['star', 'tags', 'rename'] as const)('preserves concurrently saved moves when applying %s', action => {
    const before = [original];
    const edited = action === 'star' ? toggleLibraryFileFavorite(before, original.id)
      : action === 'tags' ? setLibraryFileTags(before, original.id, ['review'])
        : updateLibraryItem(before, original.id, { name: 'Renamed study' });
    const newer = updateLibraryFileSgf(before, original.id, newerSgf, 2);
    const saved = applyLibraryChanges(newer, getLibraryChanges(before, edited));
    expect(saved[0]).toMatchObject({ sgf: newerSgf, size: newerSgf.length, moveCount: 2 });
    expect(saved[0]).toMatchObject(action === 'star' ? { favorite: true }
      : action === 'tags' ? { tags: ['review'] } : { name: 'Renamed study' });
    expect(newer[0]).toMatchObject({ name: 'Study', sgf: newerSgf });
    expect(original.sgf).toBe('(;SZ[9])');
  });

  it('keeps unrelated additions and updates while adding and deleting selected records', () => {
    const keep = createLibraryItem('Keep', '(;SZ[13])');
    const incoming = createLibraryItem('Concurrent import', '(;SZ[19])');
    const added = createLibraryItem('New copy', '(;SZ[9])');
    const changes = getLibraryChanges([original, keep], [added, keep]);
    const latestKeep = { ...keep, favorite: true };
    expect(applyLibraryChanges([incoming, original, latestKeep], changes)).toEqual([added, incoming, latestKeep]);
  });

  it('does not resurrect a deleted record or duplicate an already persisted addition', () => {
    const changes = getLibraryChanges([original], [{ ...original, favorite: true }]);
    expect(applyLibraryChanges([], changes)).toEqual([]);
    const addition = getLibraryChanges([], [original]);
    expect(applyLibraryChanges([original], addition)).toEqual([original]);
  });
});

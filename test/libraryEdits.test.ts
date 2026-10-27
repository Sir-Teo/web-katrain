import { describe, expect, it } from 'vitest';
import { createLibraryFolder, createLibraryItem, setLibraryFileTags, toggleLibraryFileFavorite, updateLibraryFileSgf, updateLibraryItem } from '../src/utils/library';
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

  it('names a pending addition against records saved after its dialog opened', () => {
    const concurrent = createLibraryItem('Review.sgf', '(;SZ[13])');
    const pending = createLibraryItem('review.sgf', '(;SZ[9])');
    const saved = applyLibraryChanges([concurrent], getLibraryChanges([], [pending]));
    expect(saved.map(item => item.name)).toEqual(['review 2.sgf', 'Review.sgf']);
    expect(saved[0]).toMatchObject({ id: pending.id, sgf: pending.sgf });
    expect(pending.name).toBe('review.sgf');
  });

  it('reserves distinct names for multiple pending additions', () => {
    const folder = createLibraryFolder('Review', null);
    const first = createLibraryItem('Review', '(;SZ[9])');
    const second = createLibraryItem('Review', '(;SZ[13])');
    expect(applyLibraryChanges([folder], getLibraryChanges([], [first, second])).map(item => item.name))
      .toEqual(['Review 2', 'Review 3', 'Review']);
  });

  it('checks a pending rename in the folder where another tab moved the record', () => {
    const folder = createLibraryFolder('Lessons', null);
    const concurrent = createLibraryItem('Review', '(;SZ[13])', folder.id);
    const renamed = updateLibraryItem([original], original.id, { name: 'Review' });
    const latest = { ...original, parentId: folder.id, sgf: newerSgf };
    const saved = applyLibraryChanges([folder, concurrent, latest], getLibraryChanges([original], renamed));
    expect(saved.find(item => item.id === original.id)).toMatchObject({
      name: 'Review 2', parentId: folder.id, sgf: newerSgf,
    });
    expect(saved.find(item => item.id === concurrent.id)).toBe(concurrent);
  });

  it('preserves existing duplicate names when the requested edit only changes metadata', () => {
    const duplicate = createLibraryItem(original.name, '(;SZ[13])');
    const saved = applyLibraryChanges([original, duplicate], getLibraryChanges([original], toggleLibraryFileFavorite([original], original.id)));
    expect(saved.map(item => item.name)).toEqual([original.name, duplicate.name]);
    expect(saved[0]).toMatchObject({ favorite: true });
  });
});

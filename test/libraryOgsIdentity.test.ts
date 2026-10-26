import { describe, expect, it } from 'vitest';
import { collectExistingOgsGameIds, ogsSyncOperationId } from '../src/utils/ogsSync';
import { getOgsGameId } from '../src/utils/ogsGameIdentity';
import {
  createLibraryBackup, createLibraryFolder, createLibraryItem, duplicateLibraryItem,
  libraryItemMatchesQuery, normalizeLibraryItems, parseLibraryBackup, updateLibraryFileSgf, updateLibraryItem,
} from '../src/utils/library';
import { mergeOgsLibraryImports } from '../src/utils/libraryOgsImport';

describe('retaining OGS identity through study edits', () => {
  it('keeps a synced game recognizable after rename, SGF edits, backup and duplication', () => {
    const original = createLibraryItem('Game (ogs-123)', '(;SZ[9]C[Keep notes])');
    const renamed = updateLibraryItem([original], original.id, { name: 'My annotated study' });
    const edited = updateLibraryFileSgf(renamed, original.id, '(;SZ[9]C[New notes];B[dd])');
    const restored = parseLibraryBackup(createLibraryBackup(edited));
    const copied = duplicateLibraryItem(restored, original.id);
    expect(collectExistingOgsGameIds(copied.items)).toEqual(new Set([123]));
    expect(copied.items.filter(item => item.type === 'file').every(item => item.ogsGameId === 123)).toBe(true);
    expect(restored[0]).toMatchObject({ name: 'My annotated study', sgf: '(;SZ[9]C[New notes];B[dd])', ogsGameId: 123 });
  });

  it('derives identity for an older filename before its first rename is saved', () => {
    const legacy = createLibraryItem('Old game (ogs-456)', '(;SZ[9])');
    delete legacy.ogsGameId;
    const loaded = normalizeLibraryItems([legacy]);
    const renamed = updateLibraryItem(loaded, legacy.id, { name: 'Renamed legacy study' });
    expect(normalizeLibraryItems(renamed)[0]).toMatchObject({ name: 'Renamed legacy study', ogsGameId: 456 });
    expect(collectExistingOgsGameIds(renamed)).toEqual(new Set([456]));
  });

  it('skips a renamed game at sync completion and preserves its annotations', () => {
    const existing = { ...createLibraryItem('My review', '(;SZ[9]C[Keep my notes])'), ogsGameId: 123, favorite: true };
    const items = [existing], folder = createLibraryFolder('OGS - Player');
    expect(mergeOgsLibraryImports(items, folder, [createLibraryItem('Downloaded (ogs-123)', '(;SZ[9])', folder.id)]))
      .toBe(items);
  });

  it('finds a renamed study by its original OGS ID', () => {
    const item = { ...createLibraryItem('My review', '(;SZ[9])'), ogsGameId: 123 };
    expect(libraryItemMatchesQuery(item, 'ogs-123')).toBe(true);
    expect(libraryItemMatchesQuery(item, '(ogs-123)')).toBe(true);
  });

  it('prefers valid retained identity to a title containing another marker', () => {
    expect(getOgsGameId({ name: 'Mentioning (ogs-456)', ogsGameId: 123 })).toBe(123);
  });

  it('rejects invalid retained IDs while accepting a valid legacy marker', () => {
    for (const value of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '123', null]) {
      expect(getOgsGameId({ name: 'My review', ogsGameId: value })).toBeUndefined();
      expect(getOgsGameId({ name: 'Game (ogs-123)', ogsGameId: value })).toBe(123);
    }
    expect(getOgsGameId({ name: 'Game (ogs-0)' })).toBeUndefined();
    expect(getOgsGameId({ name: 'Game (ogs-9007199254740992)' })).toBeUndefined();
  });

  it('recognizes a retried batch despite order/duplicate changes without altering its listing', () => {
    const games = Object.freeze([{ id: 3 }, { id: 1 }, { id: 3 }]);
    expect(ogsSyncOperationId(42, games)).toBe(ogsSyncOperationId(42, [{ id: 1 }, { id: 3 }]));
    expect(games.map(game => game.id)).toEqual([3, 1, 3]);
  });

  it('keeps errors from another player or game batch distinct', () => {
    const batch = ogsSyncOperationId(42, [{ id: 1 }]);
    expect(ogsSyncOperationId(43, [{ id: 1 }])).not.toBe(batch);
    expect(ogsSyncOperationId(42, [{ id: 2 }])).not.toBe(batch);
  });
});

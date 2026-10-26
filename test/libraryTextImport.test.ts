import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLibraryItemFromSgfOrOgsText } from '../src/utils/libraryTextImport';
import { createLibraryBackup, parseLibraryBackup, updateLibraryItem } from '../src/utils/library';
import { collectExistingOgsGameIds, downloadNewOgsGames } from '../src/utils/ogsSync';

describe('library text import', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a named library item from direct SGF text', async () => {
    const result = await createLibraryItemFromSgfOrOgsText(
      '(;GM[1]SZ[9]GN[Teaching Game];B[dd])',
      'study-folder'
    );

    expect(result.source).toBe('direct');
    expect(result.item).toMatchObject({
      type: 'file',
      name: 'Teaching Game',
      parentId: 'study-folder',
      moveCount: 1,
    });
  });

  it('rejects non-SGF direct text before creating a library item', async () => {
    await expect(createLibraryItemFromSgfOrOgsText('not an SGF game', null)).rejects.toThrow(
      'Invalid SGF import'
    );
    await expect(createLibraryItemFromSgfOrOgsText('   ', null)).rejects.toThrow('Empty SGF import');
  });

  it('downloads OGS URLs and names imported games from SGF metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '(;GM[1]SZ[19]PB[Black]PW[White];B[pd])',
    })));

    const result = await createLibraryItemFromSgfOrOgsText('https://online-go.com/game/12345', null);

    expect(fetch).toHaveBeenCalledWith('https://online-go.com/api/v1/games/12345/sgf', expect.objectContaining({ method: 'GET' }));
    expect(result.source).toBe('ogs');
    expect(result.gameId).toBe('12345');
    expect(result.item.name).toBe('Black vs White');
    expect(result.item.parentId).toBeNull();
  });

  it('recognizes a URL-imported game during later sync after rename and backup', async () => {
    const fetchMock = vi.fn(async () => new Response('(;GM[1]SZ[19]PB[Black]PW[White];B[pd])'));
    vi.stubGlobal('fetch', fetchMock);
    const { item } = await createLibraryItemFromSgfOrOgsText('https://online-go.com/game/12345', null);
    const renamed = updateLibraryItem([item], item.id, { name: 'My URL-imported study' });
    const restored = parseLibraryBackup(createLibraryBackup(renamed));
    const result = await downloadNewOgsGames(
      [{ id: 12345, name: 'Study', black: 'Black', white: 'White', boardSize: 19, ended: '2026-10-26' }],
      collectExistingOgsGameIds(restored),
    );
    expect(result).toEqual({ synced: [], skipped: 1, failed: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(restored[0]).toMatchObject({ name: 'My URL-imported study', ogsGameId: 12345 });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLibraryItemFromSgfOrOgsText } from '../src/utils/libraryTextImport';

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

  it('downloads OGS URLs and names imported games from SGF metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '(;GM[1]SZ[19]PB[Black]PW[White];B[pd])',
    })));

    const result = await createLibraryItemFromSgfOrOgsText('https://online-go.com/game/12345', null);

    expect(fetch).toHaveBeenCalledWith('https://online-go.com/api/v1/games/12345/sgf', { method: 'GET' });
    expect(result.source).toBe('ogs');
    expect(result.gameId).toBe('12345');
    expect(result.item.name).toBe('Black vs White');
    expect(result.item.parentId).toBeNull();
  });
});

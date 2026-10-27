import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLibraryBackup, createLibraryFolder, createLibraryItem, parseLibraryBackup,
  restoreLibrary, loadLibrary, saveLibrary,
} from '../src/utils/library';

afterEach(() => vi.unstubAllGlobals());

describe('Library backup validation before replacement', () => {
  it.each([
    { items: [null, 42] },
    { items: [{ product: 'Unrelated JSON' }] },
    { items: [{ type: 'file', name: 'Missing game' }] },
    { items: [{ type: 'file', sgf: '   ' }] },
    { items: [{ type: 'other', sgf: '(;SZ[9])' }] },
    { app: 'another-app', version: 2, items: [] },
    { app: 'web-katrain', version: 3, items: [] },
  ])('rejects incompatible content: %j', (backup) => {
    expect(() => parseLibraryBackup(JSON.stringify(backup))).toThrow();
  });

  it('keeps a mixed damaged backup from replacing existing games', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
    const game = createLibraryItem('My annotated game', '(;SZ[9]C[Keep these notes];B[dd])');
    await saveLibrary([game]);
    await expect(restoreLibrary(JSON.stringify({ items: [game, null] }))).rejects.toThrow();
    expect(await loadLibrary()).toEqual([game]);
  });

  it('accepts current, legacy array and version-one backups without losing folders or games', () => {
    const folder = createLibraryFolder('Study');
    const game = createLibraryItem('Game', '(;SZ[9];B[dd])', folder.id);
    expect(parseLibraryBackup(createLibraryBackup([folder, game]))).toEqual([folder, game]);
    const legacyGame = { name: 'Old game', sgf: '(;SZ[13];B[dd])' };
    for (const raw of [[legacyGame], { version: 1, items: [legacyGame] }]) {
      expect(parseLibraryBackup(JSON.stringify(raw))).toEqual([
        expect.objectContaining({ type: 'file', name: 'Old game', sgf: legacyGame.sgf }),
      ]);
    }
    expect(parseLibraryBackup(createLibraryBackup([]))).toEqual([]);
  });
});

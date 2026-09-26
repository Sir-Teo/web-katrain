import { describe, expect, it } from 'vitest';
import { PRELOADED_GAMES } from '../src/data/preloadedGames';
import {
  createLibraryItem,
  formatRecentLibraryFileDetail,
  selectRecentLibraryFiles,
  type LibraryFolder,
  type LibraryItem,
} from '../src/utils/library';

const SEEDED_AT = Date.UTC(2026, 8, 26, 2, 44);

const famousFolder: LibraryFolder = {
  id: 'famous',
  name: 'Famous Games',
  parentId: null,
  createdAt: SEEDED_AT,
  updatedAt: SEEDED_AT,
  type: 'folder',
};

const seeded = () =>
  PRELOADED_GAMES.slice(0, 3).map((game) => createLibraryItem(game.name, game.sgf, famousFolder.id, SEEDED_AT));

describe('selectRecentLibraryFiles', () => {
  it('offers untouched bundled games as featured, not as the player’s recent games', () => {
    const items: LibraryItem[] = [famousFolder, ...seeded()];
    const result = selectRecentLibraryFiles(items);
    expect(result.kind).toBe('featured');
    expect(result.files).toHaveLength(3);
  });

  it('lists only the player’s own games once there are any', () => {
    const own = createLibraryItem('My game', '(;GM[1]SZ[19];B[pd])', null, SEEDED_AT - 1000);
    const result = selectRecentLibraryFiles([famousFolder, ...seeded(), own]);
    expect(result).toEqual({ kind: 'recent', files: [own] });
  });

  it('counts a bundled game the player opened, starred or edited as theirs', () => {
    const [opened, starred, edited] = seeded();
    const items: LibraryItem[] = [
      famousFolder,
      opened,
      { ...starred, favorite: true },
      { ...edited, updatedAt: SEEDED_AT + 5 },
    ];
    const result = selectRecentLibraryFiles(items, 6, (id) => id === opened.id);
    expect(result.kind).toBe('recent');
    expect(result.files.map((file) => file.id)).toEqual([edited.id, opened.id, starred.id]);
  });

  it('dates featured games by when they were played and recent ones by the last change', () => {
    const [game] = seeded();
    const featured = formatRecentLibraryFileDetail({ ...game, name: 'Untitled pro game' }, 'featured');
    expect(featured).toContain(`${game.moveCount} moves`);
    expect(featured).toContain(game.metadata.date!);
    expect(featured).not.toContain('2026');
    // A name that already carries the date does not get it twice.
    expect(game.name).toContain(game.metadata.date!);
    expect(formatRecentLibraryFileDetail(game, 'featured')).not.toContain(game.metadata.date!);
    expect(formatRecentLibraryFileDetail(game, 'recent')).toContain('2026');
  });
});

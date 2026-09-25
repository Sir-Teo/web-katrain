import { describe, expect, it } from 'vitest';
import { createLibraryFolder, createLibraryItem, moveLibraryItems } from '../src/utils/library';

const sgf = '(;GM[1]FF[4]SZ[19];B[pd])';

describe('moving a selection that holds a folder and its contents', () => {
  it('moves the folder with its games inside it', () => {
    const archive = createLibraryFolder('Archive', null);
    const tournament = createLibraryFolder('Tournament', null);
    const round1 = createLibraryItem('R1', sgf, tournament.id, 1);
    const round2 = createLibraryItem('R2', sgf, tournament.id, 2);
    const items = [archive, tournament, round1, round2];

    // Select all, then Move to Archive.
    const result = moveLibraryItems(items, items.map((item) => item.id), archive.id, 500);
    const parentOf = (id: string) => result.items.find((item) => item.id === id)?.parentId ?? null;

    expect(parentOf(tournament.id)).toBe(archive.id);
    expect(parentOf(round1.id)).toBe(tournament.id);
    expect(parentOf(round2.id)).toBe(tournament.id);
    expect(result.movedIds).toEqual([tournament.id]);
    expect(result.skippedIds).toEqual([archive.id]);
  });
});

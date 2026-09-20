import { describe, expect, it } from 'vitest';
import { mergeLibrariesByNewest, type LibraryItem } from '../src/utils/library';

const file = (id: string, name: string, updatedAt: number): LibraryItem => ({
    id, name, parentId: null, type: 'file', sgf: '(;GM[1]SZ[9];B[dd])',
    createdAt: 1, updatedAt, moveCount: 1, size: 20, metadata: {},
} as LibraryItem);

const names = (items: LibraryItem[]) => items.map((i) => i.name).sort();

describe('reconciling a fallback written during an IndexedDB outage', () => {
    /**
     * The first attempt at this replaced the recovered database with the
     * fallback, which during an outage is whatever could be scraped together
     * -- usually nothing. Measured: a library of 8 became 1. A union is the
     * only reconciliation that cannot lose a side.
     */
    it('keeps everything from both copies', () => {
        const stored = [file('a', 'Stored A', 10), file('b', 'Stored B', 10)];
        const fallback = [file('c', 'Saved during outage', 20)];

        expect(names(mergeLibrariesByNewest(stored, fallback)))
            .toEqual(['Saved during outage', 'Stored A', 'Stored B']);
    });

    it('never shrinks the stored library, even when the fallback is empty', () => {
        const stored = [file('a', 'A', 10), file('b', 'B', 10), file('c', 'C', 10)];

        expect(mergeLibrariesByNewest(stored, [])).toHaveLength(3);
        expect(mergeLibrariesByNewest([], stored)).toHaveLength(3);
    });

    it('keeps the newer record when both sides have the same item', () => {
        const older = file('a', 'Old name', 10);
        const newer = file('a', 'New name', 20);

        expect(names(mergeLibrariesByNewest([older], [newer]))).toEqual(['New name']);
        expect(names(mergeLibrariesByNewest([newer], [older]))).toEqual(['New name']);
    });

    it('does not duplicate an item present in both at the same time', () => {
        const item = file('a', 'Same', 10);
        expect(mergeLibrariesByNewest([item], [{ ...item }])).toHaveLength(1);
    });

    it('returns a repaired tree, like every other read', () => {
        // The merge runs the result through normalizeLibraryItems, so a parent
        // that exists on neither side cannot survive the reconciliation.
        const orphan = { ...file('a', 'Orphan', 10), parentId: 'no-such-folder' } as LibraryItem;

        expect(mergeLibrariesByNewest([orphan], [])[0]?.parentId).toBeNull();
    });
});

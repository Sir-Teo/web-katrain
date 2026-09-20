import { describe, expect, it } from 'vitest';
import { getLibraryStats, normalizeLibraryItems, type LibraryItem } from '../src/utils/library';

const SGF = '(;GM[1]FF[4]SZ[9]KM[6.5];B[cc];W[gg])';

const file = (id: string, parentId: string | null) => ({
    id, name: id, parentId, type: 'file', sgf: SGF,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
});
const folder = (id: string, parentId: string | null) => ({
    id, name: id, parentId, type: 'folder',
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
});

/** Ids the folder tree can actually walk to, starting from the root. */
const reachable = (items: LibraryItem[]): Set<string> => {
    const byParent = new Map<string | null, LibraryItem[]>();
    for (const item of items) {
        const p = item.parentId ?? null;
        byParent.set(p, [...(byParent.get(p) ?? []), item]);
    }
    const seen = new Set<string>();
    const pending: Array<string | null> = [null];
    while (pending.length > 0) {
        for (const child of byParent.get(pending.pop()!) ?? []) {
            if (seen.has(child.id)) continue;
            seen.add(child.id);
            pending.push(child.id);
        }
    }
    return seen;
};

const parentOf = (items: LibraryItem[], id: string) => items.find((i) => i.id === id)?.parentId ?? null;

describe('a library tree the reader can actually walk', () => {
    it('leaves a healthy tree exactly as it found it', () => {
        const items = normalizeLibraryItems([
            folder('top', null), folder('nested', 'top'), file('deep', 'nested'), file('root-file', null),
        ]);
        expect(parentOf(items, 'nested')).toBe('top');
        expect(parentOf(items, 'deep')).toBe('nested');
        expect(reachable(items).size).toBe(4);
    });

    it('puts back at the root an item whose folder is not in the library', () => {
        // The shape a hand-merged or partial backup arrives in.
        const items = normalizeLibraryItems([file('stray', 'no-such-folder'), folder('real', null)]);
        expect(parentOf(items, 'stray')).toBeNull();
        expect(reachable(items).has('stray')).toBe(true);
    });

    it('refuses a file as somebody’s parent', () => {
        const items = normalizeLibraryItems([file('parent-file', null), file('child', 'parent-file')]);
        expect(parentOf(items, 'child')).toBeNull();
        expect(reachable(items).size).toBe(2);
    });

    it('breaks a two-folder cycle by cutting one link, not by flattening both', () => {
        const items = normalizeLibraryItems([folder('a', 'b'), folder('b', 'a'), file('inside', 'a')]);
        expect(reachable(items).size).toBe(3);
        // One of the two becomes a root; the other keeps its parent, so the
        // folder the reader built still contains what they put in it.
        const roots = items.filter((i) => i.parentId === null).map((i) => i.id);
        expect(roots).toHaveLength(1);
        expect(parentOf(items, 'inside')).toBe('a');
    });

    it('breaks a longer cycle, and rescues what hangs off it', () => {
        const items = normalizeLibraryItems([
            folder('a', 'c'), folder('b', 'a'), folder('c', 'b'), file('leaf', 'c'), file('entrant', 'a'),
        ]);
        expect(reachable(items).size).toBe(5);
    });

    it('handles a folder that claims itself as its parent', () => {
        const items = normalizeLibraryItems([folder('self', 'self'), file('under', 'self')]);
        expect(parentOf(items, 'self')).toBeNull();
        expect(parentOf(items, 'under')).toBe('self');
        expect(reachable(items).size).toBe(2);
    });

    it('keeps the count in the footer equal to what the tree shows', () => {
        // Before this, a restore reported 8 items and 5 files while three of
        // them sat under a missing folder or inside a cycle -- stored, counted,
        // and unreachable across reloads.
        const items = normalizeLibraryItems([
            file('ok', null), folder('real', null), file('in-real', 'real'),
            file('orphan-a', 'gone'), file('orphan-b', 'gone'),
            folder('cycle-a', 'cycle-b'), folder('cycle-b', 'cycle-a'), file('in-cycle', 'cycle-a'),
        ]);
        const stats = getLibraryStats(items);
        expect(stats.files + stats.folders).toBe(items.length);
        expect(reachable(items).size).toBe(items.length);
    });
});

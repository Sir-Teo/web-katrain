import { describe, expect, it } from 'vitest';
import { countInsertedMoves, describeInsertProgress } from '../src/utils/insertMode';
import type { GameNode } from '../src/types';

const chain = (moves: number): { anchor: GameNode; tip: GameNode } => {
    const node = (id: string, parent: GameNode | null, withMove: boolean): GameNode => ({
        id,
        parent,
        children: [],
        move: withMove ? { x: 0, y: 0, player: 'black' } : null,
    } as unknown as GameNode);
    const anchor = node('anchor', null, true);
    let tip = anchor;
    for (let i = 0; i < moves; i += 1) {
        const next = node(`m${i}`, tip, true);
        tip.children.push(next);
        tip = next;
    }
    return { anchor, tip };
};

describe('countInsertedMoves', () => {
    it('counts the moves played since insert mode opened', () => {
        for (const n of [0, 1, 2, 5]) {
            const { anchor, tip } = chain(n);
            expect(countInsertedMoves(tip, anchor.id), String(n)).toBe(n);
        }
    });

    it('counts nothing when there is no insert under way', () => {
        const { tip } = chain(3);
        expect(countInsertedMoves(tip, null)).toBe(0);
        expect(countInsertedMoves(null, 'anchor')).toBe(0);
    });

    it('counts nothing once the reader navigates off the inserted line', () => {
        // The anchor is not an ancestor any more, so the walk runs out of
        // parents; reporting the whole path length would be a lie.
        const { tip } = chain(3);
        expect(countInsertedMoves(tip, 'some-other-node')).toBe(0);
    });

    it('does not count a setup node as an inserted move', () => {
        const { anchor, tip } = chain(2);
        const setup = { id: 'setup', parent: tip, children: [], move: null } as unknown as GameNode;
        expect(countInsertedMoves(setup, anchor.id)).toBe(2);
    });
});

describe('describeInsertProgress', () => {
    it('says nothing alarming before anything is inserted', () => {
        const progress = describeInsertProgress(0);
        expect(progress.label).toBe('Insert');
        expect(progress.warn).toBe(false);
    });

    it('warns while the count is odd, because the continuation cannot follow', () => {
        for (const n of [1, 3, 7]) {
            const progress = describeInsertProgress(n);
            expect(progress.label, String(n)).toBe(`Insert ${n}`);
            expect(progress.warn, String(n)).toBe(true);
            expect(progress.title, String(n)).toContain('none of it will follow');
            expect(progress.title, String(n)).toContain('Insert one more');
        }
        expect(describeInsertProgress(1).title).toContain('1 move inserted');
        expect(describeInsertProgress(3).title).toContain('3 moves inserted');
    });

    it('is calm again on an even count, and says what leaving will do', () => {
        for (const n of [2, 4]) {
            const progress = describeInsertProgress(n);
            expect(progress.warn, String(n)).toBe(false);
            expect(progress.title, String(n)).toContain('copies the rest of the game');
        }
    });

    it('does not put a broken count in front of the reader', () => {
        for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -2]) {
            expect(describeInsertProgress(bad).label, String(bad)).toBe('Insert');
            expect(describeInsertProgress(bad).warn, String(bad)).toBe(false);
        }
    });
});

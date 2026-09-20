import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A source check: the decision lives inside `Layout`, which the SSR renderer
 * cannot exercise.
 *
 * `prepareForGameReplacement` used to `await handleSaveCurrentSgf()` and then
 * `return true` regardless, while the save reported failure only through a
 * toast. Choosing Save and having the download refused therefore replaced the
 * game anyway. Reproduced in the browser by making `URL.createObjectURL`
 * throw, which is how a browser that blocks blob downloads behaves: three
 * moves on the board became zero on the Quick-new-game path, which replaces
 * without a second dialog.
 */
const layout = readFileSync('src/components/Layout.tsx', 'utf8');

const bodyOf = (name: string): string => {
    const start = layout.indexOf(`const ${name} = useCallback(async (`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const end = layout.indexOf('\n  const ', start + 1);
    return layout.slice(start, end === -1 ? layout.length : end);
};

describe('a save that failed is not consent to replace the game', () => {
    it('reports whether the game was actually saved', () => {
        const body = bodyOf('handleSaveCurrentSgf');

        expect(body).toContain('Promise<boolean>');
        // Both success paths and the failure path must answer.
        expect(body).toContain('return true');
        expect(body).toContain('return false');
    });

    it('stops the replacement when that answer is no', () => {
        const body = bodyOf('prepareForGameReplacement');

        expect(body).toContain("if (choice === 'save' && !(await handleSaveCurrentSgf())) return false;");
        // Cancel must still stop it, and anything else must still proceed --
        // Discard is how someone says they meant to lose the game.
        expect(body).toContain("if (choice === 'cancel') return false;");
        expect(body.trimEnd().endsWith('}, [confirmReplaceCurrentGame, handleSaveCurrentSgf]);')).toBe(true);
    });

    it('leaves no path that awaits the save and ignores it', () => {
        expect(layout).not.toMatch(/if \(choice === 'save'\) await handleSaveCurrentSgf\(\);/);
    });
});

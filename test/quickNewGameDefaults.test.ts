import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import { getQuickNewGameWarning } from '../src/utils/quickNewGame';

/** Someone else's 9-stone handicap game, as opened from the library. */
const HANDICAP_GAME = '(;GM[1]FF[4]SZ[19]KM[0.5]HA[9]PL[W]'
  + 'AB[dd][jd][pd][dj][jj][pj][dp][jp][pp];W[qf];B[nc])';

describe('opening a game and the new-game defaults', () => {
    it('does not adopt the file as the reader’s saved defaults', () => {
        // `loadGame` wrote the file's board size and handicap into settings,
        // and `startNewGame` persists settings -- so opening one handicap game
        // and pressing Quick new game gave nine stones nobody asked for, and
        // kept giving them on every new game afterwards.
        const store = useGameStore.getState();
        store.resetGame();
        store.updateSettings({ defaultBoardSize: 19, defaultHandicap: 0, gameRules: 'japanese' });

        store.loadGame(parseSgf(HANDICAP_GAME));

        const after = useGameStore.getState();
        expect(after.settings.defaultHandicap).toBe(0);
        expect(after.settings.defaultBoardSize).toBe(19);
        // The board itself is the file's, handicap stones and all.
        expect(after.rootNode.properties?.HA).toEqual(['9']);
    });

    it('still follows the file for rules, which scoring depends on', () => {
        const store = useGameStore.getState();
        store.resetGame();
        store.updateSettings({ gameRules: 'japanese' });

        store.loadGame(parseSgf('(;GM[1]FF[4]SZ[19]KM[7.5]RU[chinese];B[dd])'));

        expect(useGameStore.getState().settings.gameRules).toBe('chinese');
    });

    it('leaves a 13x13 file out of the saved board-size default', () => {
        const store = useGameStore.getState();
        store.resetGame();
        store.updateSettings({ defaultBoardSize: 19 });

        store.loadGame(parseSgf('(;GM[1]FF[4]SZ[13]KM[6.5];B[cc])'));

        const after = useGameStore.getState();
        expect(after.board.length).toBe(13);
        expect(after.settings.defaultBoardSize).toBe(19);
    });

    it('keeps adopting an explicit new game, which the reader did choose', () => {
        const store = useGameStore.getState();
        store.resetGame();
        store.updateSettings({ defaultBoardSize: 19, defaultHandicap: 0 });

        store.startNewGame({ komi: 0.5, rules: 'japanese', boardSize: 9, handicap: 4 });

        const after = useGameStore.getState();
        expect(after.settings.defaultBoardSize).toBe(9);
        expect(after.settings.defaultHandicap).toBe(4);
    });
});

describe('the quick new game warning', () => {
    it('names the stones it is about to place', () => {
        expect(getQuickNewGameWarning(19, 9)).toContain('19×19, 9 handicap stones');
        expect(getQuickNewGameWarning(9, 1)).toContain('9×9, 1 handicap stone');
    });

    it('says nothing about handicap when there is none', () => {
        expect(getQuickNewGameWarning(19, 0)).toContain('Quick new game (19×19):');
        expect(getQuickNewGameWarning(19, 0)).not.toContain('handicap');
        expect(getQuickNewGameWarning(13)).toContain('Quick new game (13×13):');
    });

    it('does not put a broken number in front of the reader', () => {
        for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0.4]) {
            expect(getQuickNewGameWarning(19, bad), String(bad)).not.toContain('handicap');
        }
    });
});

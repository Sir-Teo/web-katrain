import { describe, expect, it } from 'vitest';
import { PRELOADED_GAMES, describePreloadedGame } from '../src/data/preloadedGames';

/** The way most tools write SGF: no separators between root properties. */
const COMPACT = '(;GM[1]FF[4]CA[UTF-8]SZ[19]PB[Lee Sedol]BR[9p]PW[Gu Li]WR[9p]'
  + 'EV[LG Cup]DT[2005-10-19]SO[go4go.net]KM[6.5]RE[B+R];B[pd];W[dp])';

/** The same game line-wrapped, which is how the bundled seven happen to look. */
const WRAPPED = '(;EV[LG Cup]\nDT[2005-10-19]\nPB[Lee Sedol]BR[9p]\nPW[Gu Li]WR[9p]\n'
  + 'KM[6.5]RE[B+R]\nSO[go4go.net]\n;B[pd];W[dp])';

describe('naming a dropped game pack', () => {
    // The point of the glob is that a pack can be dropped in with no code
    // changes. Root properties had to be preceded by `;` or whitespace to be
    // read, so a compact file -- the common shape -- named itself after its
    // filename and credited itself to "public domain".
    it('reads the headers however the file is spaced', () => {
        for (const [shape, sgf] of [['compact', COMPACT], ['wrapped', WRAPPED]] as const) {
            expect(describePreloadedGame(sgf, 'some-pack-game'), shape).toEqual({
                name: 'Lee Sedol vs Gu Li - LG Cup, 2005-10-19',
                source: 'go4go.net',
            });
        }
    });

    it('does not mistake the tail of a longer property for the one it wants', () => {
        // BR/WR must not answer a lookup for R, and PB must not answer B.
        const sgf = '(;GM[1]PB[Black Name]BR[5d]PW[White Name]WR[3d];B[aa])';
        expect(describePreloadedGame(sgf, 'x').name).toBe('Black Name vs White Name');
    });

    it('falls back to a readable filename when the file says nothing', () => {
        expect(describePreloadedGame('(;GM[1]FF[4];B[pd])', '__some_pack-game_01')).toEqual({
            name: 'some pack game 01',
            source: 'public domain',
        });
    });

    it('keeps the curated name and source for a bundled game', () => {
        expect(describePreloadedGame(COMPACT, '__go4go_20051019_Gu-Li_Lee-Sedol')).toEqual({
            name: 'Gu Li vs Lee Sedol - 10th LG Cup, semi-final (2005-10-19)',
            source: 'go4go.com',
        });
    });

    it('still ships every bundled game with a real name', () => {
        expect(PRELOADED_GAMES.length).toBeGreaterThan(0);
        for (const game of PRELOADED_GAMES) {
            expect(game.name.trim(), game.name).not.toBe('');
            expect(game.source.trim(), game.name).not.toBe('');
            expect(game.sgf.startsWith('('), game.name).toBe(true);
        }
    });
});

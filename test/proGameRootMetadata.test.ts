import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/data/preloadedGames', () => ({
  PRELOADED_GAMES: [
    {
      name: 'Imported pack game', source: 'Club archive',
      sgf: '( ;C[Example PB[Wrong\\] BR[9p\\] SZ[5\\] RE[B+R\\]]'
        + 'PlayerBlack [Al\\\nice]BlackRank [1d]PlayerWhite [Bob]WhiteRank [2d]SiZe [9]'
        + 'EV [League\\] final]DT [2026-10-25]RE [W+R];B[dd])',
    },
    {
      name: 'No root players', source: 'Club archive',
      sgf: '(;SZ[19];C[Study]PB[Child Black]PW[Child White];B[dd])(;PB[Other Black]PW[Other White]RE[W+2.5])',
    },
    { name: 'constructor', source: 'Club archive', sgf: '(;SZ[19])' },
  ],
}));

import { PRO_GAMES, filterProGames } from '../src/utils/proGames';

describe('pro-game metadata from an imported pack', () => {
  it('shows the root properties the editor actually opens', () => {
    expect(PRO_GAMES[0]).toMatchObject({
      black:'Alice',blackRank:'1d',white:'Bob',whiteRank:'2d',boardSize:9,
      event:'League] final',date:'2026-10-25',result:'W+R',
    });
    expect(filterProGames(PRO_GAMES,'Alice W+R')).toEqual([PRO_GAMES[0]]);
    expect(filterProGames(PRO_GAMES,'Wrong')).toEqual([]);
  });

  it('keeps child nodes and later games out of metadata chips and search', () => {
    expect(PRO_GAMES[1]).toMatchObject({black:'Black',white:'White',boardSize:19});
    expect(PRO_GAMES[1]?.result).toBeUndefined();
    expect(filterProGames(PRO_GAMES,'Child')).toEqual([]);
    expect(filterProGames(PRO_GAMES,'Other')).toEqual([]);
  });

  it('uses an editorial only for an actual catalog entry', () => {
    expect(PRO_GAMES[2]?.editorial).toBeUndefined();
  });
});

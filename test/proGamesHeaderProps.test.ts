import { describe, expect, it } from 'vitest';
import { filterProGames, PRO_GAMES } from '../src/utils/proGames';

describe('pro game headers', () => {
  it('reads the result and ranks that follow another value directly', () => {
    // "KM[6.5]RE[B+R]": requiring a ";" or space before the key missed RE,
    // BR and WR in all seven bundled games.
    expect(PRO_GAMES.length).toBeGreaterThan(0);
    for (const game of PRO_GAMES) {
      expect(game.result, game.name).toBeTruthy();
      expect(game.blackRank, game.name).toBeTruthy();
      expect(game.whiteRank, game.name).toBeTruthy();
    }
  });

  it('finds games by result', () => {
    expect(filterProGames(PRO_GAMES, 'B+R').length).toBeGreaterThan(0);
  });
});

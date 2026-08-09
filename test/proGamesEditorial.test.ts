import { describe, expect, it } from 'vitest';
import { PRO_GAMES, filterProGames } from '../src/utils/proGames';

describe('pro game editorials', () => {
  it('every preloaded game has an editorial write-up', () => {
    // Keyed by name — this fails if a game is renamed without moving its blurb.
    const missing = PRO_GAMES.filter((g) => !g.editorial?.trim()).map((g) => g.name);
    expect(missing).toEqual([]);
  });

  it('editorials are substantial but not essays', () => {
    for (const game of PRO_GAMES) {
      expect(game.editorial!.length).toBeGreaterThan(80);
      expect(game.editorial!.length).toBeLessThan(600);
    }
  });

  it('search matches editorial text', () => {
    const hits = filterProGames(PRO_GAMES, 'viper');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.black).toBe('Choi Cheolhan');
  });
});

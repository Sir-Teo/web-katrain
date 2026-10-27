import { describe, expect, it } from 'vitest';
import { PRO_GAMES, buildFinalBoard, filterProGames } from '../src/utils/proGames';

const count = (query: string) => filterProGames(PRO_GAMES, query).length;

describe('the bundled pro games', () => {
  it('parses a header for every game', () => {
    expect(PRO_GAMES.length).toBeGreaterThan(0);
    for (const game of PRO_GAMES) {
      expect(game.id).toMatch(/^pro-\d+$/);
      expect(game.name.trim()).not.toBe('');
      expect(game.black.trim()).not.toBe('');
      expect(game.white.trim()).not.toBe('');
      expect([9, 13, 19]).toContain(game.boardSize);
    }
  });

  it('gives every game a distinct id', () => {
    expect(new Set(PRO_GAMES.map(g => g.id)).size).toBe(PRO_GAMES.length);
  });
});

describe('searching the pro games', () => {
  it('returns everything for an empty query', () => {
    expect(count('')).toBe(PRO_GAMES.length);
    expect(count('   ')).toBe(PRO_GAMES.length);
  });

  it('matches a single term against any field', () => {
    expect(count('sedol')).toBeGreaterThan(0);
    expect(count('lg cup')).toBeGreaterThan(0);
  });

  it('matches terms that live in different fields', () => {
    // A player and a date never sit next to each other in the joined text, so
    // requiring the query as one phrase found nothing here.
    expect(count('sedol 2005')).toBeGreaterThan(0);
    expect(count('2005 sedol')).toBe(count('sedol 2005'));
  });

  it('narrows as terms are added rather than widening', () => {
    expect(count('sedol 2005')).toBeLessThanOrEqual(count('sedol'));
    expect(count('sedol')).toBeLessThanOrEqual(count(''));
  });

  it('requires every term, so an unmatched one excludes the game', () => {
    expect(count('sedol notarealplayer')).toBe(0);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(count('  SEDOL  ')).toBe(count('sedol'));
  });

  it('finds nothing for a query that matches nothing', () => {
    expect(count('zzzznotaplayer')).toBe(0);
  });

  it('finds accented player names and event titles from an ordinary keyboard query', () => {
    const game={...PRO_GAMES[0]!,black:'Ō Rissei',white:'Éloïse',event:'Jōseki workshop'};
    expect(filterProGames([game],'o rissei eloise joseki')).toEqual([game]);
  });
});

describe('replaying a game for its preview', () => {
  it('produces a board with stones on it', () => {
    const { board, moveCount } = buildFinalBoard(PRO_GAMES[0].sgf);
    expect(moveCount).toBeGreaterThan(0);
    expect(board.flat().filter(Boolean).length).toBeGreaterThan(0);
  });

  it('replays every bundled game without throwing', () => {
    for (const game of PRO_GAMES) {
      expect(() => buildFinalBoard(game.sgf)).not.toThrow();
    }
  });

  it('applies setup ranges and cleared points between moves', () => {
    const {board,moveCount}=buildFinalBoard('(;SZ[9]AB[aa:bb];B[dd];AW[ee:ff]AE[aa][dd];W[gg])');
    expect(moveCount).toBe(2);
    expect(board[0]?.[0]).toBeNull();
    expect(board[3]?.[3]).toBeNull();
    expect(board[0]?.[1]).toBe('black');
    for(const [x,y] of [[4,4],[4,5],[5,4],[5,5],[6,6]] as const) expect(board[y]?.[x]).toBe('white');
  });

  it('keeps setup changes on pass nodes and follows the first variation', () => {
    const passed=buildFinalBoard('(;SZ[9];B[aa];W[]AW[bb]AE[aa];B[cc])');
    expect(passed.moveCount).toBe(3);
    expect(passed.board[0]?.[0]).toBeNull();
    expect(passed.board[1]?.[1]).toBe('white');
    expect(passed.board[2]?.[2]).toBe('black');
    const variation=buildFinalBoard('(;SZ[9];B[aa](;AW[bb];W[cc])(;AW[dd];W[ee]))');
    expect(variation.board[1]?.[1]).toBe('white');
    expect(variation.board[3]?.[3]).toBeNull();
    expect(variation.moveCount).toBe(2);
  });

  it('removes a legally self-captured group under the record’s New Zealand rules', () => {
    const {board,moveCount}=buildFinalBoard('(;GM[1]SZ[9]RU[NZ]AB[aa]AW[ca][ab][bb];B[ba];W[ee])');
    expect(moveCount).toBe(2);
    expect(board[0]?.[0]).toBeNull();
    expect(board[0]?.[1]).toBeNull();
    expect(board[4]?.[4]).toBe('white');
  });
});

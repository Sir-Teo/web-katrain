import { describe, expect, it } from 'vitest';
import { createLibraryItem, updateLibraryFileSgf, type LibraryItem } from '../src/utils/library';
import { countSgfGames, countSgfMoves, sgfTrailingGames } from '../src/utils/sgfScan';

/** Three complete games in one file, the way an SGF collection is written. */
const COLLECTION =
  '(;GM[1]FF[4]SZ[19]PB[Alice]PW[Bob]RE[B+R];B[pd];W[dp];B[pp])\n' +
  '(;GM[1]FF[4]SZ[19]PB[Carol]PW[Dave]RE[W+2.5];B[qd];W[dc];B[pq];W[dq])\n' +
  '(;GM[1]FF[4]SZ[19]PB[Eve]PW[Frank]RE[B+1.5];B[ee];W[cc])';

/** The first game after an edit, as the app's writer hands it back. */
const EDITED_FIRST_GAME = '(;GM[1]FF[4]SZ[19]PB[Alice]PW[Bob]RE[B+R];B[pd];W[dp];B[pp];W[dd])';

describe('sgfTrailingGames', () => {
  it('hands back the games after the first, untouched', () => {
    const trailing = sgfTrailingGames(COLLECTION);
    expect(trailing).toContain('PB[Carol]');
    expect(trailing).toContain('PB[Eve]');
    expect(trailing).not.toContain('PB[Alice]');
    expect(countSgfGames(trailing)).toBe(2);
  });

  it('has nothing to say about a file holding one game', () => {
    expect(sgfTrailingGames('(;GM[1]SZ[19];B[pd](;W[dp])(;W[dd]))')).toBe('');
    expect(sgfTrailingGames('')).toBe('');
  });

  it('does not cut at a parenthesis inside a comment', () => {
    expect(sgfTrailingGames('(;GM[1]SZ[9];C[a (joseki) here];B[aa])(;GM[1]SZ[9];B[bb])'))
      .toBe('(;GM[1]SZ[9];B[bb])');
  });
});

describe('saving a game that came out of a collection', () => {
  const itemFrom = (sgf: string) => createLibraryItem('Three games', sgf, null);

  /**
   * The bug: the editor holds the first game, so writing it back over the
   * record deleted every game behind it -- silently, with no way back.
   */
  it('keeps the games the editor never held', () => {
    const item = itemFrom(COLLECTION);
    const [updated] = updateLibraryFileSgf([item], item.id, EDITED_FIRST_GAME);
    expect(updated.type).toBe('file');
    if (updated.type !== 'file') return;

    expect(updated.sgf).toContain('PB[Carol]');
    expect(updated.sgf).toContain('PB[Eve]');
    expect(countSgfGames(updated.sgf)).toBe(3);
  });

  it('actually saves the edit it was given', () => {
    const item = itemFrom(COLLECTION);
    const [updated] = updateLibraryFileSgf([item], item.id, EDITED_FIRST_GAME);
    if (updated.type !== 'file') throw new Error('expected a file');

    // The fourth move is in, and the count describes the game that opens.
    expect(countSgfMoves(updated.sgf)).toBe(4);
    expect(updated.moveCount).toBe(4);
    expect(updated.size).toBe(updated.sgf.length);
    expect(updated.metadata.black).toBe('Alice');
  });

  it('leaves an ordinary single-game record exactly as before', () => {
    const single = '(;GM[1]FF[4]SZ[19]PB[Solo]PW[Player];B[pd];W[dp])';
    const item = itemFrom(single);
    const [updated] = updateLibraryFileSgf([item], item.id, EDITED_FIRST_GAME);
    if (updated.type !== 'file') throw new Error('expected a file');

    expect(updated.sgf).toBe(EDITED_FIRST_GAME);
    expect(countSgfGames(updated.sgf)).toBe(1);
  });

  it('does not append the old tail when the edit is itself a collection', () => {
    const item = itemFrom(COLLECTION);
    const [updated] = updateLibraryFileSgf([item], item.id, COLLECTION);
    if (updated.type !== 'file') throw new Error('expected a file');

    expect(updated.sgf).toBe(COLLECTION);
    expect(countSgfGames(updated.sgf)).toBe(3);
  });

  it('survives being saved again and again', () => {
    const item = itemFrom(COLLECTION);
    let items: LibraryItem[] = [item];
    for (let i = 0; i < 5; i += 1) items = updateLibraryFileSgf(items, item.id, EDITED_FIRST_GAME);
    const updated = items[0];
    if (updated.type !== 'file') throw new Error('expected a file');

    // Five saves must not stack five copies of Carol and Eve.
    expect(countSgfGames(updated.sgf)).toBe(3);
  });
});

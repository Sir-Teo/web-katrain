import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { generateSgfFromTree, parseSgf, type KaTrainSgfExportOptions } from '../src/utils/sgf';
import { PRELOADED_GAMES } from '../src/data/preloadedGames';

/**
 * Write what was read, read it again, write it again — the two writings must
 * match.
 *
 * The reader and the writer are the only things standing between a game and
 * whatever a file says, and every check on them so far asserts one direction at
 * a time: this SGF parses to these moves, this tree emits this property. A move
 * the writer emits and the reader drops satisfies both and loses the game
 * anyway, which is how `loadGame` once dropped an illegal move and its entire
 * subtree without a word.
 *
 * The second pass is the whole test. One normalisation is expected — the writer
 * has its own property order, its own DT, its own AP — so the first output is
 * the baseline, and anything the reader cannot take back shows up as a
 * difference between output one and output two.
 */
/**
 * Every move in the text, passes included.
 *
 * Counted off the raw text rather than a parse of it, because a parse would put
 * the reader on both sides of the comparison and hide anything it drops. The
 * property before B or W may be `;` or the `]` that closed another one: order
 * inside a node is not significant in SGF, and this writer emits C before B.
 */
const moveCount = (sgf: string): number => (sgf.match(/[;\]]\s*[BW]\[/g) ?? []).length;

/** Every subtree the file opens — one for the game, one per variation. */
const subtreeCount = (sgf: string): number => (sgf.match(/\(;/g) ?? []).length;

const roundTrip = (
  sgf: string,
  opts?: KaTrainSgfExportOptions,
): { first: string; second: string; moves: number } => {
  const store = useGameStore.getState();

  store.resetGame();
  store.loadGame(parseSgf(sgf));
  const first = generateSgfFromTree(useGameStore.getState().rootNode, opts);
  const moves = moveCount(first);

  store.resetGame();
  store.loadGame(parseSgf(first));
  const second = generateSgfFromTree(useGameStore.getState().rootNode, opts);

  return { first, second, moves };
};


describe('an SGF survives being written and read again', () => {
  it.each(PRELOADED_GAMES.map((game) => [game.name, game.sgf] as const))(
    'keeps every move of %s',
    (_name, sgf) => {
      const { first, second, moves } = roundTrip(sgf);

      // These are real records: 150 to 300 moves each.
      expect(moves).toBeGreaterThan(100);
      expect(second).toBe(first);
    },
  );

  const shapes: Array<[string, string]> = [
    ['branches', '(;GM[1]FF[4]SZ[19]KM[6.5];B[pd](;W[dp];B[pp])(;W[dd];B[qp](;W[cp])(;W[dq])))'],
    ['passes', '(;GM[1]FF[4]SZ[9]KM[5.5];B[cc];W[];B[];W[gg])'],
    ['setup stones', '(;GM[1]FF[4]SZ[9]AB[cc][gg]AW[cg]AE[gc]PL[W];W[ee])'],
    ['handicap', '(;GM[1]FF[4]SZ[19]HA[3]KM[0.5]AB[pd][dp][pp];W[dd])'],
    ['comments', '(;GM[1]FF[4]SZ[9];B[cc]C[A comment with \\] and \\\\ in it])'],
    ['game info', '(;GM[1]FF[4]SZ[19]PB[Black]PW[White]BR[9p]WR[9p]EV[Cup]DT[2005-12-16]RE[W+7.5];B[pd])'],
    ['a 13x13 board', '(;GM[1]FF[4]SZ[13]KM[6.5];B[dd];W[jj];B[dj];W[jd])'],
  ];

  it.each(shapes)('keeps %s', (_shape, sgf) => {
    const { first, second } = roundTrip(sgf);

    expect(second).toBe(first);
  });

  /**
   * The check above cannot see a reader and a writer that agree to lose the
   * same thing: whatever the first read discards, the first write never emits,
   * and the second pass matches perfectly. Counting the input against the first
   * output is what catches that, and it is the shape of the bug this suite
   * exists for — a move, or a whole variation, that goes in and does not come
   * out.
   */
  it.each([
    ...PRELOADED_GAMES.map((game) => [game.name, game.sgf] as const),
    ...shapes.map(([shape, sgf]) => [shape, sgf] as const),
  ])('loses no move and no variation of %s', (_name, sgf) => {
    const store = useGameStore.getState();
    store.resetGame();
    store.loadGame(parseSgf(sgf));
    const written = generateSgfFromTree(useGameStore.getState().rootNode);

    expect(moveCount(written), 'moves').toBe(moveCount(sgf));
    expect(subtreeCount(written), 'variations').toBe(subtreeCount(sgf));
  });

  it('keeps the marks a file put on a node', () => {
    const { first, second } = roundTrip('(;GM[1]FF[4]SZ[9];B[cc]TR[dd][ee]SQ[ff]LB[gg:A])');

    expect(first).toContain('TR[dd][ee]');
    expect(first).toContain('SQ[ff]');
    expect(first).toContain('LB[gg:A]');
    expect(second).toBe(first);
  });

  it('keeps a branch point rather than flattening it to the main line', () => {
    const { first } = roundTrip('(;GM[1]FF[4]SZ[19];B[pd](;W[dp];B[pp])(;W[dd];B[qp]))');

    // Two children under the same move: the file has to still say so, or every
    // variation anyone recorded is gone the next time they save.
    expect(first).toContain('(;W[dp]');
    expect(first).toContain('(;W[dd]');
  });
});

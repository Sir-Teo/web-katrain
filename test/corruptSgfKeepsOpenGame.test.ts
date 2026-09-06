import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import { analysisQueue } from '../src/utils/analysisQueue';

/**
 * `loadGame` resets the store before it builds anything, so anything that throws
 * after that point leaves the person with no game at all: not the file they
 * tried to open, and not the one they already had.
 *
 * What keeps that from happening is ordering rather than a guard --  `parseSgf`
 * validates and throws first, so `loadGame` only ever receives a tree it can
 * walk. The import paths in Layout each wrap the pair in a `try` and toast
 * "Failed to parse SGF file.", which reports it but cannot undo a reset.
 *
 * So the property worth holding is end to end: a corrupt file either replaces
 * the open game or leaves it alone, and never destroys it on the way.
 */
const CORRUPT: Array<[string, string]> = [
  ['empty', ''],
  ['just an open paren', '('],
  ['empty node', '(;)'],
  ['unterminated', '(;GM[1]FF[4]SZ[19];B[dd]'],
  ['non-numeric size', '(;GM[1]FF[4]SZ[abc];B[dd])'],
  ['zero size', '(;GM[1]FF[4]SZ[0];B[dd])'],
  ['huge size', '(;GM[1]FF[4]SZ[999];B[dd])'],
  ['negative size', '(;GM[1]FF[4]SZ[-5];B[dd])'],
  ['coordinate past the board', '(;GM[1]FF[4]SZ[9];B[zz])'],
  ['empty move value', '(;GM[1]FF[4]SZ[19];B[])'],
  ['both colours on one node', '(;GM[1]FF[4]SZ[19];B[dd]W[dd])'],
  ['move onto an occupied point', '(;GM[1]FF[4]SZ[19];B[dd];W[dd])'],
  ['unclosed bracket', '(;GM[1]FF[4]SZ[19];B[dd)'],
  ['branch with no moves', '(;GM[1]FF[4]SZ[19]()())'],
  ['setup stones only', '(;GM[1]FF[4]SZ[19]AB[aa][bb]AW[cc])'],
  ['rectangular size', '(;GM[1]FF[4]SZ[19:13];B[dd])'],
  ['deep nesting', `(;GM[1]FF[4]SZ[19]${'(;B[dd]'.repeat(60)}${')'.repeat(60)})`],
  ['bad komi', '(;GM[1]FF[4]SZ[19]KM[abc];B[dd])'],
  ['handicap without stones', '(;GM[1]FF[4]SZ[19]HA[9];B[dd])'],
];

describe('a corrupt SGF never destroys the game already open', () => {
  it.each(CORRUPT)('%s', (name, sgf) => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    const store = () => useGameStore.getState();
    store().resetGame();
    store().startNewGame({ boardSize: 19, komi: 7.5, rules: 'japanese', handicap: 0 });
    store().playMove(3, 3);
    store().playMove(15, 15);
    expect(store().moveHistory.length, 'the game to protect').toBe(2);

    let parsed: ReturnType<typeof parseSgf> | null = null;
    try {
      parsed = parseSgf(sgf);
    } catch {
      // Rejected before `loadGame` could reset: the open game must be untouched.
      expect(store().moveHistory.length, `${name}: rejected the file but lost the open game`).toBe(2);
      return;
    }

    // Accepted by the parser, so loading it must complete rather than throw
    // partway and leave the store holding neither game.
    expect(() => store().loadGame(parsed!), `${name}: threw after loadGame had already reset`).not.toThrow();
    expect(store().rootNode, `${name}: left no tree behind`).toBeTruthy();
  });
});

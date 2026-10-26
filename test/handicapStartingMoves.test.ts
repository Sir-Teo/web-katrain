import { describe, expect, it } from 'vitest';
import { countHandicapStones, countStartingBlackHandicapMoves, komiWithHandicapBonus } from '../src/utils/handicap';
import type { BoardState, Move } from '../src/types';

const moves = (line: string): Move[] => line.split(' ').filter(Boolean).map(token => ({
  player: token[0] === 'B' ? 'black' : 'white',
  x: token === 'BP' || token === 'WP' ? -1 : token.charCodeAt(1) - 97,
  y: token === 'BP' || token === 'WP' ? -1 : token.charCodeAt(2) - 97,
}));
const empty = (): BoardState => Array.from({ length: 9 }, () => Array(9).fill(null));

// KataGo boardhistory.cpp computeNumHandicapStones at d3263466: an ordinary
// White move ends placement, isolated White passes continue it, and two White
// turns reset the inferred extra stones. Count actual setup separately.
describe('starting Black handicap placement', () => {
  it.each([
    ['', 0, 0], ['Bcc', 1, 0], ['Bcc Wgg Bcg', 1, 0],
    ['Bcc Bgg Wcg', 2, 2], ['Bcc WP Bgg Wcg', 2, 2],
    ['BP WP Bcc Bgg Wcg', 2, 2], ['WP Bcc Bgg Wcg', 2, 2],
    ['Bcc Bgg Wcg Wgc', 0, 0], ['Bcc Bgg WP Wgc', 0, 0],
    ['Wcc Bgg Bcg', 0, 0],
  ])('matches native placement for %s', (line, prefix, handicap) => {
    expect(countStartingBlackHandicapMoves(moves(line))).toBe(prefix);
    expect(countHandicapStones(empty(), moves(line))).toBe(handicap);
  });

  it('combines actual initial stones with placement turns and excludes White setups', () => {
    const board = empty(); board[2]![2] = 'black';
    expect(countHandicapStones(board, moves('Bgg Wcg'))).toBe(2);
    board[6]![6] = 'white';
    expect(countHandicapStones(board, moves('Bgg Bcg'))).toBe(0);
  });

  it('applies the same inferred count to Chinese, AGA and Japanese compensation', () => {
    const history = moves('Bcc Bgg Wcg');
    expect(komiWithHandicapBonus(empty(), 'chinese', 0.5, history)).toBe(2.5);
    expect(komiWithHandicapBonus(empty(), 'aga', 0.5, history)).toBe(1.5);
    expect(komiWithHandicapBonus(empty(), 'japanese', 0.5, history)).toBe(0.5);
  });
});

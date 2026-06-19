import { describe, expect, it } from 'vitest';
import {
  applyResult,
  createLadder,
  formatKyuRank,
  parseResultWinner,
  promoteKyu,
} from '../src/utils/tournament';

describe('tournament rank labels', () => {
  it('formats kyu and dan ranks (4 = 4k, 0 = 1d, -3 = 4d)', () => {
    expect(formatKyuRank(4)).toBe('4k');
    expect(formatKyuRank(1)).toBe('1k');
    expect(formatKyuRank(0)).toBe('1d');
    expect(formatKyuRank(-3)).toBe('4d');
  });

  it('promotes to a stronger (lower) kyu', () => {
    expect(promoteKyu(5)).toBe(4);
    expect(promoteKyu(0)).toBe(-1);
  });
});

describe('tournament result parsing', () => {
  it('reads the winning color from SGF RE strings', () => {
    expect(parseResultWinner('B+R')).toBe('black');
    expect(parseResultWinner('W+3.5')).toBe('white');
    expect(parseResultWinner('b+resign')).toBe('black');
    expect(parseResultWinner('Void')).toBeNull();
    expect(parseResultWinner(null)).toBeNull();
  });
});

describe('tournament ladder progression', () => {
  it('promotes and tracks best beaten on a win', () => {
    const ladder = createLadder({ boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
    const afterWin = applyResult({ ...ladder, awaitingResult: true }, 'win');
    expect(afterWin.wins).toBe(1);
    expect(afterWin.streak).toBe(1);
    expect(afterWin.currentKyu).toBe(9);
    expect(afterWin.bestKyu).toBe(10);
    expect(afterWin.awaitingResult).toBe(false);
  });

  it('keeps rank and resets streak on a loss', () => {
    const ladder = createLadder({ boardSize: 9, userColor: 'black', komi: 6.5, handicap: 0, startKyu: 10 });
    const won = applyResult({ ...ladder, awaitingResult: true }, 'win');
    const lost = applyResult({ ...won, awaitingResult: true }, 'loss');
    expect(lost.losses).toBe(1);
    expect(lost.streak).toBe(0);
    expect(lost.currentKyu).toBe(9); // unchanged by the loss
  });
});

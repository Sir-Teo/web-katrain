import { describe, expect, it } from 'vitest';
import { formatBoardMoveLabel, formatGtpMove, parseGtpMove } from '../src/lib/gtp';
import type { BoardSize } from '../src/types';

const SIZES: BoardSize[] = [9, 13, 19];

describe('formatGtpMove', () => {
  it('names the corners and the column that skips I', () => {
    expect(formatGtpMove(0, 0, 19)).toBe('A19');
    expect(formatGtpMove(18, 18, 19)).toBe('T1');
    // The 9th column is J, not I -- the reason every hand-rolled copy of this
    // carried an `x >= 8 ? x + 1 : x`.
    expect(formatGtpMove(7, 0, 19)).toBe('H19');
    expect(formatGtpMove(8, 0, 19)).toBe('J19');
    expect(formatGtpMove(0, 0, 9)).toBe('A9');
    expect(formatGtpMove(8, 8, 9)).toBe('J1');
  });

  it('calls a pass what GTP calls it', () => {
    expect(formatGtpMove(-1, -1, 19)).toBe('pass');
    expect(formatGtpMove(-1, 4, 19)).toBe('pass');
  });

  it('refuses a column no board has rather than inventing a letter', () => {
    // The arithmetic this replaced produced 'U20' here and wrote it into a file.
    expect(() => formatGtpMove(19, 0, 19)).toThrow(/out of range/);
  });

  it('round-trips every intersection through the parser', () => {
    for (const size of SIZES) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const parsed = parseGtpMove(formatGtpMove(x, y, size), size);
          expect(parsed, `${x},${y} on ${size}`).toEqual({ kind: 'move', x, y });
        }
      }
    }
  });
});

describe('formatBoardMoveLabel', () => {
  it('matches the GTP name for every point on the board', () => {
    for (const size of SIZES) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          expect(formatBoardMoveLabel({ x, y }, size)).toBe(formatGtpMove(x, y, size));
        }
      }
    }
  });

  it('writes a pass the way the screen does', () => {
    expect(formatBoardMoveLabel({ x: -1, y: -1 }, 19)).toBe('Pass');
  });

  it('assumes 19x19 when no size is given', () => {
    expect(formatBoardMoveLabel({ x: 0, y: 0 })).toBe('A19');
  });
});

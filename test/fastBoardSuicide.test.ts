import { beforeEach, describe, expect, it } from 'vitest';
import { BLACK, WHITE, BOARD_AREA, playMove, setBoardSize, undoMove, type SimPosition } from '../src/engine/katago/fastBoard';

describe('search board self-capture and undo', () => {
  beforeEach(() => setBoardSize(9));

  it.each([BLACK, WHITE])('removes connected friendly groups and restores them when undoing color %s', (player) => {
    const opponent = player === BLACK ? WHITE : BLACK;
    const stones = new Uint8Array(BOARD_AREA);
    for (const [x, y] of [[3, 4], [4, 3]]) stones[y! * 9 + x!] = player;
    for (const [x, y] of [[2, 4], [3, 3], [3, 5], [4, 2], [5, 3], [5, 4], [4, 5]]) stones[y! * 9 + x!] = opponent;
    const before = stones.slice();
    const position: SimPosition = { stones, koPoint: 80 };
    const captures = [70]; // an earlier move's undo record must be preserved
    const snapshot = playMove(position, 40, player, captures, true);
    expect(position.stones[39]).toBe(0);
    expect(position.stones[31]).toBe(0);
    expect(position.stones[40]).toBe(0);
    expect(captures.slice(1).sort((a, b) => a - b)).toEqual([31, 39, 40]);
    expect(position.koPoint).toBe(-1);
    undoMove(position, 40, player, snapshot, captures);
    expect(position.stones).toEqual(before);
    expect(position.koPoint).toBe(80);
    expect(captures).toEqual([70]);
  });

  it('keeps self-capture forbidden by default without changing the position', () => {
    const stones = new Uint8Array(BOARD_AREA);
    stones[0] = BLACK;
    for (const point of [2, 9, 10]) stones[point] = WHITE;
    const before = stones.slice();
    const position: SimPosition = { stones, koPoint: 80 };
    const captures = [70];
    expect(() => playMove(position, 1, BLACK, captures)).toThrow('Illegal suicide');
    expect(position.stones).toEqual(before);
    expect(position.koPoint).toBe(80);
    expect(captures).toEqual([70]);
  });

  it.each([false, true])('rejects a single-stone self-capture even when the rule allows multiple stones: %s', (allowed) => {
    const stones = new Uint8Array(BOARD_AREA);
    stones[1] = WHITE;
    stones[9] = WHITE;
    const before = stones.slice();
    const position: SimPosition = { stones, koPoint: -1 };
    const captures: number[] = [];
    expect(() => playMove(position, 0, BLACK, captures, allowed)).toThrow('Illegal suicide');
    expect(position.stones).toEqual(before);
    expect(captures).toEqual([]);
  });

  it('preserves both colors through a subsequent move and reverse undo', () => {
    const stones = new Uint8Array(BOARD_AREA);
    stones[0] = BLACK;
    for (const point of [2, 9, 10]) stones[point] = WHITE;
    const before = stones.slice();
    const position: SimPosition = { stones, koPoint: -1 };
    const captures: number[] = [];
    const selfCapture = playMove(position, 1, BLACK, captures, true);
    const afterSelfCapture = stones.slice();
    const reply = playMove(position, 0, WHITE, captures, true);
    undoMove(position, 0, WHITE, reply, captures);
    expect(stones).toEqual(afterSelfCapture);
    undoMove(position, 1, BLACK, selfCapture, captures);
    expect(stones).toEqual(before);
    expect(captures).toEqual([]);
  });
});

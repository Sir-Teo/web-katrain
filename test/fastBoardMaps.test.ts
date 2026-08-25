import { describe, expect, it } from 'vitest';
import {
  BLACK,
  BOARD_SIZE,
  WHITE,
  computeAreaMapV7KataGoInto,
  computeLibertyMapInto,
  playMove,
  type SimPosition,
} from '../src/engine/katago/fastBoard';

function idx(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

describe('fastBoard map builders', () => {
  it('computeLibertyMapInto clears output and returns it', () => {
    const stones = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    const out = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    out.fill(7);

    const ret = computeLibertyMapInto(stones, out);
    expect(ret).toBe(out);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(0);
  });

  it('computeLibertyMapInto computes capped liberties', () => {
    const stones = new Uint8Array(BOARD_SIZE * BOARD_SIZE);

    stones[idx(9, 9)] = BLACK; // center: 4 liberties
    stones[idx(10, 9)] = BLACK; // adjacent group: 6 liberties, capped to 4
    stones[idx(0, 0)] = BLACK; // corner: 2 liberties
    stones[idx(0, 1)] = BLACK; // edge: 3 liberties (shares group with corner, but still <= 4)

    const libs = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    computeLibertyMapInto(stones, libs);

    expect(libs[idx(9, 9)]).toBe(4);
    expect(libs[idx(10, 9)]).toBe(4);

    // The (0,0)-(0,1) group has 3 liberties total: (1,0), (1,1), (0,2)
    expect(libs[idx(0, 0)]).toBe(3);
    expect(libs[idx(0, 1)]).toBe(3);
  });

  it('computeAreaMapV7KataGoInto clears output and includes stones', () => {
    const stones = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    const out = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    out.fill(2);

    computeAreaMapV7KataGoInto(stones, out);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBe(0);

    stones[idx(9, 9)] = BLACK;
    computeAreaMapV7KataGoInto(stones, out);
    expect(out[idx(9, 9)]).toBe(BLACK);
  });
});


describe('fastBoard playMove rejection', () => {
  it('leaves the position untouched whichever guard rejects the move', () => {
    // Suicide is the only rejection that has to place the stone before it can
    // be judged, so it is the only one that can leave a phantom behind. A
    // caller probing legality by catching must not inherit one.
    const pos: SimPosition = { stones: new Uint8Array(BOARD_SIZE * BOARD_SIZE), koPoint: -1 };
    pos.stones[idx(1, 0)] = WHITE;
    pos.stones[idx(0, 1)] = WHITE;

    const rejections: Array<[string, number]> = [
      ['occupied point', idx(1, 0)],
      ['off the board', BOARD_SIZE * BOARD_SIZE + 5],
      ['suicide in the corner', idx(0, 0)],
    ];

    for (const [name, move] of rejections) {
      const before = Uint8Array.from(pos.stones);
      const captureStack: number[] = [];
      expect(() => playMove(pos, move, BLACK, captureStack), name).toThrow();
      expect([...pos.stones], name).toEqual([...before]);
      expect(pos.koPoint, name).toBe(-1);
      expect(captureStack, name).toEqual([]);
    }
  });
});

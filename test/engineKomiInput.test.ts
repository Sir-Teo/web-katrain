import { beforeEach, describe, expect, it } from 'vitest';
import { extractInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { BOARD_AREA, setBoardSize } from '../src/engine/katago/fastBoard';

// ---------------------------------------------------------------------------
// How komi reaches the network (cpp/neuralnet/nninputs.cpp fillRowV7).
//
// Global 5 is the komi from the mover's point of view over 20, bounded first so a
// nonsense komi cannot walk off the end of the range the net was trained on. Global
// 18 is the parity wave, which under area scoring tells the net how close the komi
// sits to one that could produce a draw -- a thing that depends on whether the
// board has an even number of points and is hard for a net to work out for itself.
// ---------------------------------------------------------------------------

const inputsWithKomi = (komi: number, rules: 'chinese' | 'japanese' = 'chinese') =>
  extractInputsV7Fast({
    stones: new Uint8Array(BOARD_AREA),
    koPoint: -1,
    currentPlayer: 'white',
    recentMoves: [],
    komi,
    rules,
  });

describe('the komi the network is shown', () => {
  beforeEach(() => setBoardSize(9));

  it("is the mover's own komi over twenty", () => {
    expect(inputsWithKomi(7).global[5]).toBeCloseTo(7 / 20, 6);
    // Black's komi is the negative of white's.
    const asBlack = extractInputsV7Fast({
      stones: new Uint8Array(BOARD_AREA),
      koPoint: -1,
      currentPlayer: 'black',
      recentMoves: [],
      komi: 7,
      rules: 'chinese',
    });
    expect(asBlack.global[5]).toBeCloseTo(-7 / 20, 6);
  });

  it('is bounded by the board area plus twenty', () => {
    // 9x9 is 81 points, so anything past 101 is the same to the network.
    const bound = 81 + 20;
    expect(inputsWithKomi(bound).global[5]).toBeCloseTo(bound / 20, 6);
    expect(inputsWithKomi(500).global[5]).toBeCloseTo(bound / 20, 6);
    expect(inputsWithKomi(-500).global[5]).toBeCloseTo(-bound / 20, 6);
  });

  it('bounds the parity wave by the same komi, not the raw one', () => {
    // Both are past the bound, so both must produce the identical input.
    expect(inputsWithKomi(500).global[18]).toBe(inputsWithKomi(9999).global[18]);
  });
});

describe('the komi parity wave', () => {
  beforeEach(() => setBoardSize(9));

  it('rises and falls over two points of komi', () => {
    // 81 points is odd, so the komi that could draw is odd too: the wave peaks half
    // a point above it and comes back down to zero at the next one.
    const at = (komi: number) => inputsWithKomi(komi).global[18]!;
    expect(at(1)).toBeCloseTo(0, 6);
    expect(at(1.5)).toBeCloseTo(0.5, 6);
    expect(at(2)).toBeCloseTo(0, 6);
    expect(at(2.5)).toBeCloseTo(-0.5, 6);
    expect(at(3)).toBeCloseTo(0, 6);
  });

  it('is left alone under territory scoring', () => {
    expect(inputsWithKomi(1.5, 'japanese').global[18]).toBe(0);
  });

  it('follows the parity of the board, not the komi alone', () => {
    setBoardSize(9); // 81 points, odd
    const odd = inputsWithKomi(1.5).global[18]!;
    setBoardSize(13); // 169 points, also odd
    expect(inputsWithKomi(1.5).global[18]).toBeCloseTo(odd, 6);
  });
});

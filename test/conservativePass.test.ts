import { describe, expect, it } from 'vitest';
import { extractInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { PASS_MOVE } from '../src/engine/katago/fastBoard';
import { extractInputsV7 } from '../src/engine/katago/featuresV7';

describe('KataGo v7 conservativePass', () => {
  it('suppresses pass-end features at root (fast)', () => {
    const stones = new Uint8Array(19 * 19);
    const recentMoves = [{ move: PASS_MOVE, player: 'white' as const }];

    const normal = extractInputsV7Fast({
      stones,
      koPoint: -1,
      currentPlayer: 'black',
      recentMoves,
      komi: 6.5,
      rules: 'japanese',
    });
    expect(normal.global[0]).toBe(1);
    expect(normal.global[14]).toBe(1);

    const conservative = extractInputsV7Fast({
      stones,
      koPoint: -1,
      currentPlayer: 'black',
      recentMoves,
      komi: 6.5,
      rules: 'japanese',
      conservativePassAndIsRoot: true,
    });
    expect(conservative.global[0]).toBe(0);
    expect(conservative.global[14]).toBe(0);
  });

  it('suppresses pass-end features at root (compat)', () => {
    const board = Array.from({ length: 19 }, () => Array(19).fill(null));
    const moveHistory = [{ x: -1, y: -1, player: 'white' as const }];

    const normal = extractInputsV7({
      board,
      currentPlayer: 'black',
      moveHistory,
      komi: 6.5,
      rules: 'japanese',
    });
    expect(normal.global[0]).toBe(1);
    expect(normal.global[14]).toBe(1);

    const conservative = extractInputsV7({
      board,
      currentPlayer: 'black',
      moveHistory,
      komi: 6.5,
      rules: 'japanese',
      conservativePassAndIsRoot: true,
    });
    expect(conservative.global[0]).toBe(0);
    expect(conservative.global[14]).toBe(0);
  });
});


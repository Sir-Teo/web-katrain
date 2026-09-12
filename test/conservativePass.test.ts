import { describe, expect, it } from 'vitest';
import { extractInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { PASS_MOVE } from '../src/engine/katago/fastBoard';
import { extractInputsV7 } from '../src/engine/katago/featuresV7';

// Native v7 distinguishes passWouldEndGame from passWouldEndPhase. Territory
// phase zero can end a phase, but conservative passing must not hide its history.
// See the recorded Japanese v7 output in fixtures/katagoPassHistoryV7.json.
describe('KataGo v7 conservativePass', () => {
  it.each(['japanese', 'korean', 'tromp-taylor'] as const)('uses the %s game-end condition at root (fast)', rules => {
    const stones = new Uint8Array(19 * 19);
    const recentMoves = [{ move: PASS_MOVE, player: 'white' as const }];

    const normal = extractInputsV7Fast({
      stones,
      koPoint: -1,
      currentPlayer: 'black',
      recentMoves,
      komi: 6.5,
      rules,
    });
    expect(normal.global[0]).toBe(1);
    expect(normal.global[14]).toBe(1);

    const conservative = extractInputsV7Fast({
      stones,
      koPoint: -1,
      currentPlayer: 'black',
      recentMoves,
      komi: 6.5,
      rules,
      conservativePassAndIsRoot: true,
    });
    expect(conservative.global[0]).toBe(rules === 'tromp-taylor' ? 0 : 1);
    expect(conservative.global[14]).toBe(rules === 'tromp-taylor' ? 0 : 1);
  });

  it.each(['japanese', 'korean', 'tromp-taylor'] as const)('uses the %s game-end condition at root (compat)', rules => {
    const board = Array.from({ length: 19 }, () => Array(19).fill(null));
    const moveHistory = [{ x: -1, y: -1, player: 'white' as const }];

    const normal = extractInputsV7({
      board,
      currentPlayer: 'black',
      moveHistory,
      komi: 6.5,
      rules,
    });
    expect(normal.global[0]).toBe(1);
    expect(normal.global[14]).toBe(1);

    const conservative = extractInputsV7({
      board,
      currentPlayer: 'black',
      moveHistory,
      komi: 6.5,
      rules,
      conservativePassAndIsRoot: true,
    });
    expect(conservative.global[0]).toBe(rules === 'tromp-taylor' ? 0 : 1);
    expect(conservative.global[14]).toBe(rules === 'tromp-taylor' ? 0 : 1);
  });
});


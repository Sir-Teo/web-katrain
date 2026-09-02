import { describe, expect, it } from 'vitest';
import { fillInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { extractInputsV7 } from '../src/engine/katago/featuresV7';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { emptyBoard, hasModel, rawEval } from './helpers/engineHarness';
import type { GameRules } from '../src/types';

// ---------------------------------------------------------------------------
// Rule inputs, against KataGo's fillRowV7:
//   [6]/[7] ko rule (positional +0.5, situational -0.5)
//   [8]     multi-stone suicide legal
//   [9]     territory scoring
//   [10]    seki tax   [10]+[11] all tax
//   [17]    button
//   [18]    komi parity wave, under ANY area scoring
// ---------------------------------------------------------------------------

const globalsFor = (rules: GameRules, komi = 7.5): number[] => {
  setBoardSize(9);
  const global = new Float32Array(19);
  const spatial = new Float32Array(9 * 9 * 22);
  fillInputsV7Fast({
    stones: new Uint8Array(9 * 9),
    koPoint: -1,
    currentPlayer: 'black',
    recentMoves: [],
    komi,
    rules,
    outSpatial: spatial,
    outGlobal: global,
  });
  return Array.from(global);
};

describe('ruleset network inputs', () => {
  it('encodes the ko rule', () => {
    expect(globalsFor('japanese').slice(6, 8)).toEqual([0, 0]);
    expect(globalsFor('chinese').slice(6, 8)).toEqual([0, 0]);
    expect(globalsFor('tromp-taylor').slice(6, 8)).toEqual([1, 0.5]);
    expect(globalsFor('aga').slice(6, 8)).toEqual([1, -0.5]);
    expect(globalsFor('new-zealand').slice(6, 8)).toEqual([1, -0.5]);
  });

  it('encodes suicide legality', () => {
    expect(globalsFor('new-zealand')[8]).toBe(1);
    expect(globalsFor('tromp-taylor')[8]).toBe(1);
    expect(globalsFor('chinese')[8]).toBe(0);
    expect(globalsFor('japanese')[8]).toBe(0);
  });

  it('encodes scoring and tax', () => {
    expect(globalsFor('japanese').slice(9, 12)).toEqual([1, 1, 0]);
    expect(globalsFor('korean').slice(9, 12)).toEqual([1, 1, 0]);
    expect(globalsFor('chinese').slice(9, 12)).toEqual([0, 0, 0]);
    expect(globalsFor('aga').slice(9, 12)).toEqual([0, 0, 0]);
    // TAX_ALL sets both tax channels; area scoring leaves channel 9 clear.
    expect(globalsFor('stone-scoring').slice(9, 12)).toEqual([0, 1, 1]);
  });

  it('leaves the button off for every ruleset we ship', () => {
    for (const rules of [
      'japanese',
      'korean',
      'chinese',
      'aga',
      'new-zealand',
      'tromp-taylor',
      'stone-scoring',
    ] as GameRules[]) {
      expect(globalsFor(rules)[17]).toBe(0);
    }
  });

  it('applies the komi parity wave under any area scoring', () => {
    // Territory scoring never gets the wave.
    expect(globalsFor('japanese', 6.5)[18]).toBe(0);
    // Every area ruleset gets the same wave for the same komi and board.
    const chinese = globalsFor('chinese', 7.5)[18]!;
    expect(chinese).not.toBe(0);
    expect(globalsFor('stone-scoring', 7.5)[18]).toBeCloseTo(chinese, 9);
    expect(globalsFor('aga', 7.5)[18]).toBeCloseTo(chinese, 9);
    expect(globalsFor('new-zealand', 7.5)[18]).toBeCloseTo(chinese, 9);
    expect(globalsFor('tromp-taylor', 7.5)[18]).toBeCloseTo(chinese, 9);
  });

  it('agrees between the reference and fast input paths', () => {
    setBoardSize(9);
    for (const rules of ['japanese', 'chinese', 'aga', 'new-zealand', 'tromp-taylor'] as GameRules[]) {
      const reference = extractInputsV7({
        board: emptyBoard(9),
        currentPlayer: 'black',
        moveHistory: [],
        komi: 7.5,
        rules,
      });
      expect(Array.from(reference.global)).toEqual(globalsFor(rules));
    }
  });
});

describe.skipIf(!hasModel())('ruleset evaluation', () => {
  it('reads the same empty board differently under different rules', async () => {
    const board = emptyBoard(9);
    const territory = await rawEval({ board, currentPlayer: 'black', komi: 7.5, rules: 'japanese' });
    const area = await rawEval({ board, currentPlayer: 'black', komi: 7.5, rules: 'chinese' });
    const superko = await rawEval({ board, currentPlayer: 'black', komi: 7.5, rules: 'tromp-taylor' });

    // Territory vs area scoring is a real difference to the net.
    expect(area.blackScoreLead).not.toBeCloseTo(territory.blackScoreLead, 3);
    // So is the ko rule, even though both score by area.
    expect(superko.blackScoreLead).not.toBeCloseTo(area.blackScoreLead, 6);
  }, 60_000);
});

import { describe, expect, it } from 'vitest';
import {
  blendHumanChosenMove,
  chooseIndexWithTemperature,
  humanBotPresets,
  interpolateEarly,
  subtractAndPrunePlaySelectionValues,
  type HumanChosenCandidate,
} from '../src/engine/katago/chosenMove';

// ---------------------------------------------------------------------------
// KataGo's chosen-move machinery: cpp/search/searchhelpers.cpp
// (interpolateEarly, chooseIndexWithTemperature) and the human-policy averaging
// block of Search::getPlaySelectionValues in cpp/search/searchresults.cpp.
// ---------------------------------------------------------------------------

const candidate = (over: Partial<HumanChosenCandidate>): HumanChosenCandidate => ({
  playSelectionValue: 0,
  humanProb: 0,
  utility: null,
  isPass: false,
  ...over,
});

describe('interpolateEarly', () => {
  it('starts at the early value and decays toward the late one', () => {
    const args = { halflife: 80, earlyValue: 0.85, value: 0.7, boardWidth: 19, boardHeight: 19 };
    expect(interpolateEarly({ ...args, turnNumber: 0 })).toBeCloseTo(0.85, 10);
    expect(interpolateEarly({ ...args, turnNumber: 80 })).toBeCloseTo(0.775, 10);
    expect(interpolateEarly({ ...args, turnNumber: 160 })).toBeCloseTo(0.7375, 10);
  });

  it('counts a small board move as more of the game, like KataGo does', () => {
    const args = { halflife: 80, earlyValue: 1, value: 0, turnNumber: 80 };
    // 19/sqrt(9*9) halflives have elapsed after 80 moves on 9x9, not 1.
    expect(interpolateEarly({ ...args, boardWidth: 9, boardHeight: 9 })).toBeCloseTo(
      Math.pow(0.5, 19 / 9),
      10
    );
    expect(interpolateEarly({ ...args, boardWidth: 19, boardHeight: 19 })).toBeCloseTo(0.5, 10);
  });
});

describe('chooseIndexWithTemperature', () => {
  it('samples in proportion to the weights when nothing is below the threshold', () => {
    const probs = [0.6, 0.4];
    // Rescaled by the max, so the slices are 1 and 2/3 of a 5/3 total.
    expect(chooseIndexWithTemperature(probs, 0.85, 0.01, () => 0.5)).toBe(0);
    expect(chooseIndexWithTemperature(probs, 0.85, 0.01, () => 0.9)).toBe(1);
  });

  it('only reshapes moves below onlyBelowProb of the total', () => {
    // The tail move is 0.5% of the mass, so a temperature under 1 pushes it down
    // further, while the two leading moves keep their exact ratio.
    const probs = [0.6, 0.395, 0.005];
    const processed = new Float64Array(3);
    chooseIndexWithTemperature(probs, 0.5, 0.01, () => 0, processed);
    expect(processed[1]! / processed[0]!).toBeCloseTo(0.395 / 0.6, 10);
    expect(processed[2]!).toBeLessThan(0.005 / 0.6);
  });

  it('takes the maximum when the temperature is zero and nothing is exempt', () => {
    expect(chooseIndexWithTemperature([0.2, 0.5, 0.3], 0, 1, () => 0.99)).toBe(1);
  });

  it('reports nothing when no weight is positive', () => {
    expect(chooseIndexWithTemperature([0, -1, 0], 1, 1, () => 0.5)).toBe(-1);
  });
});

describe('subtractAndPrunePlaySelectionValues', () => {
  it('caps both amounts at a 64th of the largest value', () => {
    const values = Float64Array.from([64, 2, 1]);
    subtractAndPrunePlaySelectionValues(values, 100, 100);
    // Both are capped at 1, so the smallest is pruned and the rest lose 1 each.
    expect(Array.from(values)).toEqual([63, 1, 0]);
  });
});

describe('blendHumanChosenMove', () => {
  it('keeps the play selection scale while taking the human policy shape', () => {
    const values = blendHumanChosenMove({
      candidates: [
        candidate({ playSelectionValue: 10, humanProb: 0.2, utility: 0 }),
        candidate({ playSelectionValue: 1, humanProb: 0.8, utility: 0 }),
      ],
      playerToMove: 'black',
      params: { chosenMoveProp: 1, piklLambda: 1e8, chosenMoveIgnorePass: false },
    });
    expect(values[0]!).toBeCloseTo(11 * 0.2, 6);
    expect(values[1]!).toBeCloseTo(11 * 0.8, 6);
  });

  it('moves only part of the way when chosenMoveProp is below one', () => {
    const values = blendHumanChosenMove({
      candidates: [
        candidate({ playSelectionValue: 10, humanProb: 0.2, utility: 0 }),
        candidate({ playSelectionValue: 1, humanProb: 0.8, utility: 0 }),
      ],
      playerToMove: 'black',
      params: { chosenMoveProp: 0.5, piklLambda: 1e8, chosenMoveIgnorePass: false },
    });
    expect(values[0]!).toBeCloseTo(10 + 0.5 * (11 * 0.2 - 10), 6);
    expect(values[1]!).toBeCloseTo(1 + 0.5 * (11 * 0.8 - 1), 6);
  });

  it('shifts toward the better move when the PIKL lambda is small', () => {
    const candidates = [
      candidate({ playSelectionValue: 10, humanProb: 0.7, utility: -0.5 }),
      candidate({ playSelectionValue: 1, humanProb: 0.3, utility: 0.5 }),
    ];
    const params = { chosenMoveProp: 1, chosenMoveIgnorePass: false };
    const faithful = blendHumanChosenMove({
      candidates,
      playerToMove: 'black',
      params: { ...params, piklLambda: 1e8 },
    });
    expect(faithful[0]!).toBeGreaterThan(faithful[1]!);

    const shifted = blendHumanChosenMove({
      candidates,
      playerToMove: 'black',
      params: { ...params, piklLambda: humanBotPresets.search.piklLambda },
    });
    expect(shifted[1]!).toBeGreaterThan(shifted[0]!);
  });

  it('reads the utilities from the moving player, so white prefers low ones', () => {
    const candidates = [
      candidate({ playSelectionValue: 10, humanProb: 0.7, utility: -0.5 }),
      candidate({ playSelectionValue: 1, humanProb: 0.3, utility: 0.5 }),
    ];
    const values = blendHumanChosenMove({
      candidates,
      playerToMove: 'white',
      params: { chosenMoveProp: 1, piklLambda: 0.08, chosenMoveIgnorePass: false },
    });
    expect(values[0]!).toBeGreaterThan(values[1]!);
  });

  it('leaves passing to the search when chosenMoveIgnorePass is set', () => {
    const candidates = [
      candidate({ playSelectionValue: 8, humanProb: 0.1, utility: 0 }),
      candidate({ playSelectionValue: 2, humanProb: 0.9, utility: 0, isPass: true }),
    ];
    const params = { chosenMoveProp: 1, piklLambda: 1e8 };
    const ignored = blendHumanChosenMove({
      candidates,
      playerToMove: 'black',
      params: { ...params, chosenMoveIgnorePass: true },
    });
    // Pass keeps exactly the weight the search gave it; the rest is the human's.
    expect(ignored[1]!).toBeCloseTo(2, 6);
    expect(ignored[0]!).toBeCloseTo(8, 6);

    const obeyed = blendHumanChosenMove({
      candidates,
      playerToMove: 'black',
      params: { ...params, chosenMoveIgnorePass: false },
    });
    expect(obeyed[1]!).toBeCloseTo(9, 6);
  });

  it('gives unsearched moves the average utility rather than none', () => {
    const values = blendHumanChosenMove({
      candidates: [
        candidate({ playSelectionValue: 10, humanProb: 0.5, utility: 1 }),
        candidate({ playSelectionValue: 0, humanProb: 0.5, utility: null }),
      ],
      playerToMove: 'black',
      params: { chosenMoveProp: 1, piklLambda: 0.5, chosenMoveIgnorePass: false },
    });
    // The unsearched move is judged at the searched average of 1, so nothing shifts.
    expect(values[0]!).toBeCloseTo(5, 6);
    expect(values[1]!).toBeCloseTo(5, 6);
  });

  it('falls back to the human policy alone when nothing was searched', () => {
    const values = blendHumanChosenMove({
      candidates: [
        candidate({ humanProb: 0.75 }),
        candidate({ humanProb: 0.25 }),
        candidate({ humanProb: 0.9, isPass: true }),
      ],
      playerToMove: 'black',
      params: { chosenMoveProp: 1, piklLambda: 1e8, chosenMoveIgnorePass: true },
    });
    expect(values[0]! / values[1]!).toBeCloseTo(3, 6);
    expect(values[2]!).toBe(0);
  });
});

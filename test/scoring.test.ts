import { describe, expect, it } from 'vitest';
import type { BoardState } from '../src/types';
import {
  calculateTerritoryScore,
  computeManualScoreEstimate,
  getConnectedStoneChain,
  scoringPointKey,
  toggleDeadStoneChain,
} from '../src/utils/scoring';

const boardFromRows = (rows: string[]): BoardState =>
  rows.map((row) =>
    [...row].map((cell) => {
      if (cell === 'B') return 'black';
      if (cell === 'W') return 'white';
      return null;
    })
  );

describe('calculateTerritoryScore', () => {
  it('counts enclosed empty points as territory', () => {
    const board = boardFromRows([
      'BBBBB',
      'B...B',
      'B...B',
      'B...B',
      'BBBBB',
    ]);

    const score = calculateTerritoryScore(board, new Set());

    expect(score.blackTerritory).toBe(9);
    expect(score.whiteTerritory).toBe(0);
    expect(score.neutralPoints).toBe(0);
    expect(score.territory[2]?.[2]).toBe(1);
  });

  it('treats marked dead stones as removed before counting territory', () => {
    const board = boardFromRows([
      'BBBBB',
      'B...B',
      'B.W.B',
      'B...B',
      'BBBBB',
    ]);

    const estimate = computeManualScoreEstimate({
      board,
      komi: 6.5,
      capturedBlack: 0,
      capturedWhite: 0,
      deadStones: new Set([scoringPointKey(2, 2)]),
    });

    expect(estimate.blackTerritory).toBe(9);
    expect(estimate.whiteDeadStones).toBe(1);
    expect(estimate.blackScore).toBe(10);
    expect(estimate.whiteScore).toBe(6.5);
    expect(estimate.result).toBe('B+3.5');
  });

  it('leaves open empty boards neutral', () => {
    const board = boardFromRows([
      '...',
      '...',
      '...',
    ]);

    const score = calculateTerritoryScore(board, new Set());

    expect(score.blackTerritory).toBe(0);
    expect(score.whiteTerritory).toBe(0);
    expect(score.neutralPoints).toBe(9);
  });

  it('reports an even manual score as jigo', () => {
    const estimate = computeManualScoreEstimate({
      board: boardFromRows([
        '...',
        '...',
        '...',
      ]),
      komi: 0,
      capturedBlack: 0,
      capturedWhite: 0,
      deadStones: new Set(),
    });

    expect(estimate.blackScore).toBe(0);
    expect(estimate.whiteScore).toBe(0);
    expect(estimate.result).toBe('Jigo');
  });
});

describe('dead stone chains', () => {
  it('collects and toggles a connected chain', () => {
    const board = boardFromRows([
      'BB.',
      '.BW',
      '..W',
    ]);

    const chain = getConnectedStoneChain(board, 0, 0);
    expect(chain.map((p) => scoringPointKey(p.x, p.y)).sort()).toEqual(['0,0', '1,0', '1,1']);

    const marked = toggleDeadStoneChain(board, new Set(), 0, 0);
    expect(marked).toEqual(new Set(['0,0', '1,0', '1,1']));

    const unmarked = toggleDeadStoneChain(board, marked, 1, 1);
    expect(unmarked.size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { AnalysisResult } from '../src/types';
import { decodeKayaKa, decodeKayaOwnership, encodeKayaKaFromAnalysis, encodeKayaOwnership } from '../src/utils/kayaSgfAnalysis';

const makeTerritory = (size: number): number[][] =>
  Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => (x === y ? 0.5 : x < y ? -0.25 : 0.1))
  );

describe('Kaya SGF analysis helpers', () => {
  it('round trips compact KA analysis data', () => {
    const policy = new Array<number>(82).fill(-1);
    policy[3 * 9 + 2] = 0.34;
    policy[81] = 0.02;

    const analysis: AnalysisResult = {
      rootWinRate: 0.61234,
      rootScoreLead: 4.567,
      rootVisits: 1234,
      moves: [
        {
          x: 2,
          y: 3,
          order: 0,
          visits: 321,
          winRate: 0.63,
          winRateLost: 0,
          scoreLead: 5.25,
          scoreSelfplay: 5.25,
          scoreStdev: 0,
          pointsLost: 0,
          relativePointsLost: 0,
          prior: 0.34,
        },
        {
          x: -1,
          y: -1,
          order: 1,
          visits: 12,
          winRate: 0.4,
          winRateLost: 0,
          scoreLead: -1.5,
          scoreSelfplay: -1.5,
          scoreStdev: 0,
          pointsLost: 0,
          relativePointsLost: 0,
          prior: 0.02,
        },
      ],
      territory: makeTerritory(9),
      policy,
      ownershipMode: 'root',
    };

    const ka = encodeKayaKaFromAnalysis({ analysis, boardSize: 9 });
    const decoded = decodeKayaKa({ ka, boardSize: 9, currentPlayer: 'black' });

    expect(decoded?.rootWinRate).toBeCloseTo(0.6123);
    expect(decoded?.rootScoreLead).toBeCloseTo(4.57);
    expect(decoded?.rootVisits).toBe(1234);
    expect(decoded?.moves[0]).toMatchObject({ x: 2, y: 3, order: 0, visits: 321, prior: 0.34 });
    expect(decoded?.moves[1]).toMatchObject({ x: -1, y: -1, order: 1, visits: 12, prior: 0.02 });
    expect(decoded?.territory).toHaveLength(9);
    expect(decoded?.policy?.[3 * 9 + 2]).toBeCloseTo(0.34);
  });

  it('uses Kaya ownership quantization', () => {
    const encoded = encodeKayaOwnership([-1, 0, 1]);
    expect(encoded).toHaveLength(3);
    const decoded = decodeKayaOwnership(encoded);
    expect(decoded[0]).toBeCloseTo(-1);
    expect(decoded[1]).toBeCloseTo(0, 1);
    expect(decoded[2]).toBeCloseTo(1);
  });
});

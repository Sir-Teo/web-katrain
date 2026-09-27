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

  it('drops malformed KA moves instead of treating them as pass', () => {
    const ka = JSON.stringify({
      w: 0.5,
      s: 0,
      m: [
        { m: 'Z99', p: 0.9, w: 0.9, s: 9, v: 90 },
        { m: 'I9', p: 0.8 },
        { m: 'Q4', p: 0.7 },
        { m: '', p: 0.6 },
        { m: 12, p: 0.5 },
        null,
        'bad',
        { m: 'pass', p: 0.2, w: 0.45, s: -1, v: 2 },
        { m: 'J9', p: 0.3, w: 0.55, s: 1, v: 3 },
      ],
    });

    const decoded = decodeKayaKa({ ka, boardSize: 9, currentPlayer: 'black' });

    expect(decoded?.moves).toHaveLength(2);
    expect(decoded?.moves[0]).toMatchObject({ x: -1, y: -1, order: 0, prior: 0.2, visits: 2 });
    expect(decoded?.moves[1]).toMatchObject({ x: 8, y: 0, order: 1, prior: 0.3, visits: 3 });
    expect(decoded?.policy?.[81]).toBeCloseTo(0.2);
    expect(decoded?.policy?.[8]).toBeCloseTo(0.3);
    expect(decoded?.policy?.includes(0.9)).toBe(false);
    expect(decoded?.policy?.includes(0.8)).toBe(false);
    expect(decoded?.policy?.includes(0.7)).toBe(false);
  });

  it('rejects infinite or out-of-range root values', () => {
    // JSON.parse turns 1e999 into Infinity.
    for (const root of ['"w":0.5,"s":1e999', '"w":0.5,"s":-1e999', '"w":1e999,"s":0', '"w":0.5,"s":1e6', '"w":0.5,"s":0,"v":1e999']) {
      expect(decodeKayaKa({ ka: `{${root},"m":[]}`, boardSize: 9, currentPlayer: 'black' })).toBeNull();
    }
    expect(decodeKayaKa({ ka: '{"w":0.5,"s":"3","m":[]}', boardSize: 9, currentPlayer: 'black' })).toBeNull();
  });

  it('drops candidates whose values are infinite or out of range', () => {
    const ka =
      '{"w":0.5,"s":1,"m":[' +
      '{"m":"C3","p":0.1,"s":1e999},' +
      '{"m":"D4","p":0.1,"w":-1e999},' +
      '{"m":"E5","p":1e999},' +
      '{"m":"F6","p":0.1,"v":1e999},' +
      '{"m":"G7","p":0.2,"w":0.6,"s":2,"v":5}' +
      ']}';
    const decoded = decodeKayaKa({ ka, boardSize: 9, currentPlayer: 'black' });
    expect(decoded).not.toBeNull();
    expect(decoded!.moves).toHaveLength(1);
    expect(decoded!.moves[0]).toMatchObject({ x: 6, y: 2, scoreLead: 2, visits: 5 });
    for (const m of decoded!.moves) {
      expect(Number.isFinite(m.pointsLost)).toBe(true);
      expect(Number.isFinite(m.relativePointsLost)).toBe(true);
    }
  });
});


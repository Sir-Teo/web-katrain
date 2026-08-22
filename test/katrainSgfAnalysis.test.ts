import { describe, expect, it } from 'vitest';
import { decodeKaTrainKt, encodeKaTrainKtFromAnalysis, kaTrainAnalysisToAnalysisResult } from '../src/utils/katrainSgfAnalysis';
import type { AnalysisResult } from '../src/types';

const emptyTerritory = (size = 19) => Array.from({ length: size }, () => Array(size).fill(0));

const makeAnalysis = (): AnalysisResult => ({
  rootWinRate: 0.5,
  rootScoreLead: 1,
  moves: [
    { x: 3, y: 3, order: 0, visits: 10, winRate: 0.55, winRateLost: 0, scoreLead: 1.5, scoreSelfplay: 1.5, scoreStdev: 30, pointsLost: 0, relativePointsLost: 0 },
    { x: -1, y: -1, order: 1, visits: 2, winRate: 0.4, winRateLost: 0, scoreLead: 0.5, scoreSelfplay: 0.5, scoreStdev: 30, pointsLost: 0, relativePointsLost: 0 },
  ],
  territory: emptyTerritory(),
});

describe('KaTrain .kt analysis decoding', () => {
  it('round-trips genuine pass candidates through encode/decode', () => {
    const kt = encodeKaTrainKtFromAnalysis({ analysis: makeAnalysis(), boardSize: 19 });
    const decoded = decodeKaTrainKt({ kt, boardSize: 19 });
    expect(decoded).not.toBeNull();

    const result = kaTrainAnalysisToAnalysisResult({
      analysis: decoded!,
      currentPlayer: 'black',
      boardSize: 19,
    });
    const hasPass = result!.moves.some((m) => m.x === -1 && m.y === -1);
    const hasD16 = result!.moves.some((m) => m.x === 3 && m.y === 3);
    expect(hasPass).toBe(true);
    expect(hasD16).toBe(true);
    expect(result!.moves).toHaveLength(2);
  });

  it('drops corrupt coordinate rows instead of turning them into phantom passes', () => {
    const decoded = {
      moves: {
        q16: { move: 'Q16', order: 0, visits: 8, winrate: 0.6, scoreLead: 2 },
        pass: { move: 'pass', order: 1, visits: 1, winrate: 0.4, scoreLead: 0.5 },
        corrupt: { move: 'Z99', order: 2, visits: 3, winrate: 0.5, scoreLead: 1 },
        iColumn: { move: 'I16', order: 3, visits: 2, winrate: 0.5, scoreLead: 1 },
        outOfBounds: { move: 'T26', order: 4, visits: 1, winrate: 0.5, scoreLead: 1 },
        missingMove: { order: 5, visits: 1, winrate: 0.5, scoreLead: 1 },
      },
      root: { winrate: 0.5, scoreLead: 1 },
      ownership: null,
      policy: null,
    };

    const result = kaTrainAnalysisToAnalysisResult({
      analysis: decoded as Parameters<typeof kaTrainAnalysisToAnalysisResult>[0]['analysis'],
      currentPlayer: 'black',
      boardSize: 19,
    });

    expect(result!.moves.map((m) => `${m.x},${m.y}`).sort()).toEqual(['-1,-1', '15,3']);
  });
});

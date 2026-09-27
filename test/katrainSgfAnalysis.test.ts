import { describe, expect, it, vi } from 'vitest';
import pako from 'pako';
import {
  decodeKaTrainKt,
  encodeKaTrainKtFromAnalysis,
  kaTrainAnalysisToAnalysisResult,
  kaTrainKtByteLimits,
} from '../src/utils/katrainSgfAnalysis';
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

  describe('decompression limits', () => {
    const gz = (bytes: Uint8Array) => Buffer.from(pako.gzip(bytes)).toString('base64');
    const genuine = () => encodeKaTrainKtFromAnalysis({ analysis: makeAnalysis(), boardSize: 19 });

    it('refuses a tiny ownership field that inflates to megabytes', () => {
      const bomb = gz(new Uint8Array(8 * 1024 * 1024));
      expect(bomb.length).toBeLessThan(16 * 1024);
      const [, policy, main] = genuine();
      const pushed: number[] = [];
      const originalPush = pako.Inflate.prototype.push;
      const spy = vi.spyOn(pako.Inflate.prototype, 'push').mockImplementation(function (this: pako.Inflate, data, mode) {
        const onData = this.onData.bind(this);
        this.onData = (chunk) => {
          pushed.push((chunk as Uint8Array).length);
          onData(chunk);
        };
        return originalPush.call(this, data, mode);
      });
      try {
        expect(decodeKaTrainKt({ kt: [bomb, policy!, main!], boardSize: 19 })).toBeNull();
      } finally {
        spy.mockRestore();
      }
      // Inflation stopped just past the ownership limit, not after 8 MB.
      const inflated = pushed.reduce((a, b) => a + b, 0);
      expect(inflated).toBeLessThan(kaTrainKtByteLimits(19).ownership + 64 * 1024);
    });

    it('refuses an oversized JSON part', () => {
      const [ownership, policy] = genuine();
      const huge = new TextEncoder().encode(JSON.stringify({ moves: {}, root: { winrate: 0.5 }, pad: ' '.repeat(4 * 1024 * 1024) }));
      expect(decodeKaTrainKt({ kt: [ownership!, policy!, gz(huge)], boardSize: 19 })).toBeNull();
    });

    it('sizes the limits by the board and rejects tensors from another board size', () => {
      expect(kaTrainKtByteLimits(9).ownership).toBe(81 * 2);
      expect(kaTrainKtByteLimits(9).policy).toBe(82 * 2);
      // A 19x19 node read as 9x9 overflows the 9x9 ownership limit.
      expect(decodeKaTrainKt({ kt: genuine(), boardSize: 9 })).toBeNull();
      // A short tensor is corrupt rather than silently zero-padded.
      const [, policy, main] = genuine();
      expect(decodeKaTrainKt({ kt: [gz(new Uint8Array(100)), policy!, main!], boardSize: 19 })).toBeNull();
    });

    it('still decodes genuine nodes, including ones without stored tensors', () => {
      const [, , main] = genuine();
      const empty = gz(new Uint8Array(0));
      const decoded = decodeKaTrainKt({ kt: [empty, empty, main!], boardSize: 19 });
      expect(decoded).not.toBeNull();
      expect(decoded!.ownership).toBeNull();
      expect(decoded!.policy).toBeNull();
      expect(decodeKaTrainKt({ kt: genuine(), boardSize: 19 })!.ownership).toHaveLength(361);
    });

    it('rejects truncated gzip streams', () => {
      const [ownership, policy, main] = genuine();
      const truncated = Buffer.from(Buffer.from(main!, 'base64').subarray(0, 20)).toString('base64');
      expect(decodeKaTrainKt({ kt: [ownership!, policy!, truncated], boardSize: 19 })).toBeNull();
    });
  });
});

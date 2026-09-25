import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf, generateSgfFromTree } from '../src/utils/sgf';
import type { AnalysisResult } from '../src/types';

const s = () => useGameStore.getState();

const makeAnalysis = (n: number): AnalysisResult => ({
  rootWinRate: 0.6, rootScoreLead: 2.5, rootScoreSelfplay: 2.5, rootScoreStdev: 5,
  moves: [{ x: 2, y: 2, order: 0, visits: 100, winRate: 0.6, winRateLost: 0, scoreLead: 2.5, scoreSelfplay: 2.5, scoreStdev: 5, pointsLost: 0, relativePointsLost: 0, prior: 0.5, pv: ['C7'] }],
  territory: Array.from({ length: n }, () => Array.from({ length: n }, (_cell, x) => (x < n / 2 ? 0.75 : -0.5))),
  policy: Array.from({ length: n * n + 1 }, (_, i) => (i === 2 * n + 2 ? 0.5 : 0.001)),
  ownershipMode: 'root',
});

describe('KT analysis round trip on small boards', () => {
  for (const n of [9, 13, 19]) {
    it(`${n}x${n} keeps ownership and policy`, () => {
      s().resetGame();
      s().loadGame(parseSgf(`(;GM[1]SZ[${n}];B[dd])`));
      const node = s().rootNode.children[0]!;
      node.analysis = makeAnalysis(n);
      const sgf = generateSgfFromTree(s().rootNode);
      s().loadGame(parseSgf(sgf));
      const back = s().rootNode.children[0]!.analysis!;
      expect(back).toBeTruthy();
      expect(back.territory[0]![0]).toBeCloseTo(0.75, 2);
      expect(back.policy?.[2 * n + 2]).toBeCloseTo(0.5, 2);
    });
  }
});

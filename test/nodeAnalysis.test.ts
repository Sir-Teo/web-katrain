import { describe, expect, it } from 'vitest';
import type { AnalysisResult, GameNode, Move } from '../src/types';
import { computeNodePointsLost, getEvaluationClass } from '../src/utils/nodeAnalysis';

const analysis = (scoreLead: number, moves: AnalysisResult['moves'] = []): AnalysisResult => ({
  rootScoreLead: scoreLead,
  rootWinRate: 0.5,
  moves,
  territory: Array.from({ length: 19 }, () => Array(19).fill(0)),
});

let nextNodeId = 0;

const node = (args: { parent: GameNode | null; move: Move | null; analysis?: AnalysisResult }): GameNode => ({
  id: `node-${nextNodeId++}`,
  parent: args.parent,
  children: [],
  move: args.move,
  gameState: {
    board: Array.from({ length: 19 }, () => Array(19).fill(null)),
    currentPlayer: args.move?.player === 'black' ? 'white' : 'black',
    moveHistory: args.move ? [args.move] : [],
    capturedBlack: 0,
    capturedWhite: 0,
    komi: 6.5,
  },
  analysis: args.analysis,
});

describe('node analysis helpers', () => {
  it('computes points lost from parent and child score leads', () => {
    const root = node({ parent: null, move: null, analysis: analysis(0) });
    const black = node({ parent: root, move: { x: 3, y: 3, player: 'black' }, analysis: analysis(-5) });
    const white = node({ parent: black, move: { x: 15, y: 15, player: 'white' }, analysis: analysis(-2) });

    expect(computeNodePointsLost(black)).toBe(5);
    expect(computeNodePointsLost(white)).toBe(3);
  });

  it('falls back to parent candidate points lost', () => {
    const root = node({
      parent: null,
      move: null,
      analysis: analysis(0, [
        { x: 3, y: 3, winRate: 0.5, scoreLead: -3, visits: 100, pointsLost: 3, order: 0 },
      ]),
    });
    const child = node({ parent: root, move: { x: 3, y: 3, player: 'black' } });

    expect(computeNodePointsLost(child)).toBe(3);
  });

  it('uses KaTrain-style threshold buckets', () => {
    expect(getEvaluationClass(13, [12, 6, 3, 1.5, 0.5, 0], 6)).toBe(0);
    expect(getEvaluationClass(5.9, [12, 6, 3, 1.5, 0.5, 0], 6)).toBe(2);
    expect(getEvaluationClass(-1, [12, 6, 3, 1.5, 0.5, 0], 6)).toBe(5);
  });
});

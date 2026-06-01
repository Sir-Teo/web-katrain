import { describe, expect, it } from 'vitest';
import type { AnalysisResult, GameNode, Move } from '../src/types';
import { getMoveTreeNodeMarkers } from '../src/utils/moveTreeNodeMarkers';

const territory = () => Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));

function analysis(scoreLead = 0, moves: AnalysisResult['moves'] = []): AnalysisResult {
  return {
    rootScoreLead: scoreLead,
    rootWinRate: 0.5,
    moves,
    territory: territory(),
  };
}

let nextNodeId = 0;

function node(args: {
  parent: GameNode | null;
  move: Move | null;
  note?: string;
  analysis?: AnalysisResult | null;
}): GameNode {
  return {
    id: `node-${nextNodeId++}`,
    parent: args.parent,
    children: [],
    move: args.move,
    gameState: {
      board: Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null)),
      currentPlayer: args.move?.player === 'black' ? 'white' : 'black',
      moveHistory: args.move ? [args.move] : [],
      capturedBlack: 0,
      capturedWhite: 0,
      komi: 6.5,
    },
    analysis: args.analysis,
    note: args.note,
  };
}

describe('move tree node markers', () => {
  it('marks comments and analyzed positions', () => {
    const root = node({ parent: null, move: null, note: 'Fuseki idea', analysis: analysis() });

    expect(getMoveTreeNodeMarkers(root, 3)).toEqual(['note', 'analysis']);
  });

  it('marks point-loss mistakes before other node context', () => {
    const root = node({ parent: null, move: null, analysis: analysis(0) });
    const child = node({
      parent: root,
      move: { x: 3, y: 3, player: 'black' },
      note: 'Bad direction',
      analysis: analysis(-4),
    });

    expect(getMoveTreeNodeMarkers(child, 3)).toEqual(['mistake', 'note', 'analysis']);
  });

  it('uses parent candidate point loss when child analysis is missing', () => {
    const root = node({
      parent: null,
      move: null,
      analysis: analysis(0, [
        { x: 10, y: 10, winRate: 0.5, scoreLead: 0, visits: 100, pointsLost: 4, order: 2 },
      ]),
    });
    const child = node({ parent: root, move: { x: 10, y: 10, player: 'white' } });

    expect(getMoveTreeNodeMarkers(child, 3)).toEqual(['mistake']);
  });
});

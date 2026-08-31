import { describe, expect, it } from 'vitest';
import { getPrimaryMoveQualityMarker } from '../src/utils/moveTreeNodeMarkers';
import type { AnalysisResult, GameNode } from '../src/types';

const analysis = (scoreLead: number, best?: { x: number; y: number }): AnalysisResult =>
  ({
    rootScoreLead: scoreLead,
    rootWinRate: 0.5,
    moves: best ? [{ x: best.x, y: best.y, order: 0, winRate: 0.5, scoreLead, visits: 10, pointsLost: 0 }] : [],
    territory: [],
  }) as unknown as AnalysisResult;

/** Parent leads by `parentLead`; the child move leaves the mover `childLead`. */
const nodeLosing = (points: number, opts: { playedBest?: boolean } = {}): GameNode => {
  const parent: GameNode = {
    id: 'p',
    parent: null,
    children: [],
    move: null,
    analysis: analysis(0, opts.playedBest ? { x: 3, y: 3 } : { x: 15, y: 15 }),
    gameState: { currentPlayer: 'black' },
  } as unknown as GameNode;
  const child: GameNode = {
    id: 'c',
    parent,
    children: [],
    move: { x: 3, y: 3, player: 'black' },
    analysis: analysis(-points),
    gameState: { currentPlayer: 'white' },
  } as unknown as GameNode;
  parent.children.push(child);
  return child;
};

describe('getPrimaryMoveQualityMarker', () => {
  it('reports nothing for a node with no analysis', () => {
    const bare = { id: 'x', parent: null, children: [], move: null } as unknown as GameNode;
    expect(getPrimaryMoveQualityMarker(bare, 2)).toBeNull();
    expect(getPrimaryMoveQualityMarker(undefined, 2)).toBeNull();
  });

  it('ranks a blunder above a mistake', () => {
    expect(getPrimaryMoveQualityMarker(nodeLosing(9), 2)).toBe('blunder');
    expect(getPrimaryMoveQualityMarker(nodeLosing(3), 2)).toBe('mistake');
  });

  it('reports the top move when it was not itself a mistake', () => {
    expect(getPrimaryMoveQualityMarker(nodeLosing(0, { playedBest: true }), 2)).toBe('best');
  });

  it('reports nothing for an ordinary move below the threshold', () => {
    expect(getPrimaryMoveQualityMarker(nodeLosing(0.4), 2)).toBeNull();
  });

  it('follows the configured mistake threshold', () => {
    const node = nodeLosing(3);
    expect(getPrimaryMoveQualityMarker(node, 2)).toBe('mistake');
    expect(getPrimaryMoveQualityMarker(node, 5)).toBeNull();
  });

  it('never reports note or analysis, which are not about move quality', () => {
    const node = nodeLosing(0.1);
    node.note = 'a comment';
    expect(getPrimaryMoveQualityMarker(node, 2)).toBeNull();
  });
});

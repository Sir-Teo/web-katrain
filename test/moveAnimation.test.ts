import { describe, expect, it } from 'vitest';
import { getMoveAnimation } from '../src/utils/moveAnimation';
import type { AnalysisResult, GameNode, GameState } from '../src/types';

const EMPTY_TERRITORY: number[][] = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));

function analysis(scoreLead: number): AnalysisResult {
  return {
    rootWinRate: 0.5,
    rootScoreLead: scoreLead,
    moves: [],
    territory: EMPTY_TERRITORY,
    policy: undefined,
    ownershipStdev: undefined,
  };
}

function gameState(): GameState {
  return {
    board: Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null)),
    currentPlayer: 'white',
    moveHistory: [],
    capturedBlack: 0,
    capturedWhite: 0,
    komi: 6.5,
  };
}

function makeNode(parent: GameNode | null, move: GameNode['move']): GameNode {
  const node: GameNode = {
    id: `n${Math.floor(Math.random() * 1e9)}`,
    parent,
    children: [],
    move,
    gameState: gameState(),
  };
  if (parent) parent.children.push(node);
  return node;
}

// points lost for a black move = parent scoreLead - node scoreLead
function chain(parentLead: number, childLead: number): GameNode {
  const root = makeNode(null, null);
  root.analysis = analysis(parentLead);
  const child = makeNode(root, { x: 3, y: 3, player: 'black' });
  child.analysis = analysis(childLead);
  return child;
}

describe('getMoveAnimation', () => {
  it('returns a severe score-loss pill for a blunder', () => {
    const node = chain(2, -6); // black lost 8 points
    expect(getMoveAnimation(node, 3)).toEqual({ kind: 'score-loss', label: '−8.0', severe: true });
  });

  it('returns a non-severe pill for a plain mistake', () => {
    const node = chain(2, -2); // black lost 4 points
    expect(getMoveAnimation(node, 3)).toEqual({ kind: 'score-loss', label: '−4.0', severe: false });
  });

  it('returns nothing for a fine move', () => {
    const node = chain(2, 1.8);
    expect(getMoveAnimation(node, 3)).toBeNull();
  });

  it('returns a sparkle when the played reply was a big loss (set-up move)', () => {
    const node = chain(2, 1.8); // fine move by black
    const reply = makeNode(node, { x: 15, y: 15, player: 'white' });
    reply.analysis = analysis(8); // white move lost ~6.2 points (lead moved toward black)
    expect(getMoveAnimation(node, 3)).toEqual({ kind: 'sparkle' });
  });

  it('returns nothing for pass moves and the root', () => {
    const root = makeNode(null, null);
    expect(getMoveAnimation(root, 3)).toBeNull();
    root.analysis = analysis(0);
    const pass = makeNode(root, { x: -1, y: -1, player: 'black' });
    expect(getMoveAnimation(pass, 3)).toBeNull();
  });
});

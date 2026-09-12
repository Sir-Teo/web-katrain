import { describe, expect, it } from 'vitest';
import type { GameNode } from '../src/types';
import { createEmptyBoard } from '../src/utils/boardSize';
import { findSolutionPath } from '../src/utils/problemMode';
import { parseSgf } from '../src/utils/sgf';

const DEPTH = 12_000;

function rootNode(): GameNode {
  return {
    id: 'root', parent: null, children: [], move: null,
    gameState: {
      board: createEmptyBoard(9), currentPlayer: 'black', moveHistory: [],
      komi: 6.5, capturedBlack: 0, capturedWhite: 0,
    },
  };
}

function addBranch(root: GameNode, prefix: string, verdict?: string): GameNode[] {
  const path = [root];
  for (let i = 0; i < DEPTH; i++) {
    const parent = path[path.length - 1]!;
    const node: GameNode = {
      id: `${prefix}-${i}`, parent, children: [], move: null,
      gameState: root.gameState,
    };
    parent.children.push(node);
    path.push(node);
  }
  path[path.length - 1]!.note = verdict;
  return path;
}

describe('deep study traversal', () => {
  it('imports 12,000 nested variations without losing or reordering their siblings', () => {
    const tokens = ['(;GM[1]SZ[9]'];
    for (let i = 0; i < DEPTH; i++) tokens.push(`(;C[Study (${i})]`);
    for (let i = DEPTH - 1; i >= 0; i--) tokens.push(`)(;C[Side ${i}])`);
    tokens.push(')');
    let node = parseSgf(tokens.join('')).tree!;
    for (let i = 0; i < DEPTH; i++) {
      expect(node.children).toHaveLength(2);
      expect(node.children[1]!.props.C).toEqual([`Side ${i}`]);
      node = node.children[0]!;
      expect(node.props.C).toEqual([`Study (${i})`]);
    }
    expect(node.children).toHaveLength(0);
  });

  it('backtracks out of a deep wrong line to the first correct solution', () => {
    const root = rootNode();
    addBranch(root, 'wrong', 'Wrong');
    const expected = addBranch(root, 'correct', 'Correct');
    addBranch(root, 'other', 'Correct');
    const path = findSolutionPath(root);
    expect(path).toHaveLength(expected.length);
    expect(path.every((node, index) => node === expected[index])).toBe(true);
  });

  it('returns the complete deep main line when no solution is marked', () => {
    const root = rootNode();
    const expected = addBranch(root, 'main');
    addBranch(root, 'other', 'Wrong');
    const path = findSolutionPath(root);
    expect(path).toHaveLength(expected.length);
    expect(path.every((node, index) => node === expected[index])).toBe(true);
  });
});

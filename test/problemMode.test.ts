import { describe, expect, it } from 'vitest';
import {
  classifyProblemNode,
  findChildForMove,
  findSolutionPath,
  getProblemStarts,
} from '../src/utils/problemMode';
import type { BoardState, GameNode, Move, Player } from '../src/types';

const emptyBoard = (size = 9): BoardState =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

interface NodeSpec {
  move?: Move | null;
  note?: string;
  properties?: Record<string, string[]>;
  stones?: boolean;
  player?: Player;
  children?: NodeSpec[];
}

let counter = 0;
const build = (spec: NodeSpec): GameNode => {
  const board = emptyBoard();
  if (spec.stones) board[0]![0] = 'black';
  const node = {
    id: `n${counter++}`,
    parent: null,
    children: [],
    move: spec.move ?? null,
    note: spec.note,
    properties: spec.properties,
    gameState: {
      board,
      currentPlayer: spec.player ?? 'black',
      moveHistory: [],
      capturedBlack: 0,
      capturedWhite: 0,
      komi: 6.5,
    },
  } as unknown as GameNode;
  node.children = (spec.children ?? []).map(build);
  return node;
};

describe('classifyProblemNode', () => {
  it('detects correct from comments and good-position markers', () => {
    expect(classifyProblemNode(build({ note: 'Correct, black lives.' }))).toBe('correct');
    expect(classifyProblemNode(build({ properties: { GB: ['1'] } }))).toBe('correct');
    expect(classifyProblemNode(build({ note: '正解' }))).toBe('correct');
  });

  it('detects wrong and prefers it over weak positive signals', () => {
    expect(classifyProblemNode(build({ note: 'Wrong — black dies.' }))).toBe('wrong');
    expect(classifyProblemNode(build({ note: 'Failure', properties: { GB: ['1'] } }))).toBe('wrong');
  });

  it('returns unknown without any signal', () => {
    expect(classifyProblemNode(build({ note: 'hello' }))).toBe('unknown');
    expect(classifyProblemNode(build({}))).toBe('unknown');
  });
});

describe('findChildForMove', () => {
  it('matches a child by coordinates', () => {
    const root = build({ children: [{ move: { x: 2, y: 4, player: 'black' } }, { move: { x: 5, y: 5, player: 'black' } }] });
    expect(findChildForMove(root, 2, 4)).toBe(root.children[0]);
    expect(findChildForMove(root, 9, 9)).toBeNull();
  });
});

describe('getProblemStarts', () => {
  it('treats a single problem (root with stones) as one problem', () => {
    const root = build({ stones: true, children: [{ move: { x: 2, y: 2, player: 'black' } }] });
    expect(getProblemStarts(root)).toEqual([root]);
  });

  it('splits an empty synthetic root with stone-bearing children into a collection', () => {
    const root = build({
      children: [
        { stones: true, children: [{ move: { x: 1, y: 1, player: 'black' } }] },
        { stones: true, children: [{ move: { x: 2, y: 2, player: 'black' } }] },
      ],
    });
    expect(getProblemStarts(root)).toHaveLength(2);
  });

  it('treats a normal single-line game as one problem', () => {
    const root = build({ children: [{ move: { x: 3, y: 3, player: 'black' } }] });
    expect(getProblemStarts(root)).toEqual([root]);
  });
});

describe('findSolutionPath', () => {
  it('finds the branch ending in a correct leaf', () => {
    const root = build({
      stones: true,
      children: [
        { move: { x: 1, y: 1, player: 'black' }, note: 'Wrong' },
        {
          move: { x: 2, y: 2, player: 'black' },
          children: [{ move: { x: 3, y: 3, player: 'white' }, note: 'Correct' }],
        },
      ],
    });
    const path = findSolutionPath(root);
    expect(path[0]).toBe(root);
    expect(path[path.length - 1]!.note).toBe('Correct');
  });

  it('falls back to the main line when nothing is marked', () => {
    const root = build({ stones: true, children: [{ move: { x: 1, y: 1, player: 'black' }, children: [{ move: { x: 2, y: 2, player: 'white' } }] }] });
    const path = findSolutionPath(root);
    expect(path).toHaveLength(3);
  });
});

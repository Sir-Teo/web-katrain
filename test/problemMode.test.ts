import { readFileSync } from 'node:fs';
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

  it('offers no problem for a plain game record, which would just be a blank board', () => {
    const root = build({ children: [{ move: { x: 3, y: 3, player: 'black' } }] });
    expect(getProblemStarts(root)).toEqual([]);
  });

  it('accepts an empty-board tree that still records a verdict', () => {
    const root = build({
      children: [{ move: { x: 3, y: 3, player: 'black' }, note: 'Correct' }],
    });
    expect(getProblemStarts(root)).toEqual([root]);
  });

  it('offers no problem for a start with no continuations', () => {
    expect(getProblemStarts(build({ stones: true }))).toEqual([]);
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

describe('ProblemModal reply handling', () => {
  it('locks solver input while the recorded opponent reply is pending', () => {
    const source = readFileSync('src/components/ProblemModal.tsx', 'utf8');

    expect(source).toContain("type Status = 'solving' | 'replying'");
    expect(source).toContain("setStatus('replying')");
    expect(source).toContain("if (!settleAt(reply)) setStatus('solving')");
    expect(source).toContain("status === 'replying'");
    expect(source).toContain("onPointClick={status === 'solving' ? handlePoint : undefined}");
  });

  it('does not update the selected problem during render', () => {
    const source = readFileSync('src/components/ProblemModal.tsx', 'utf8');

    expect(source).not.toContain('if (problemIndex !== safeIndex) setProblemIndex(safeIndex);\n\n  const node');
    expect(source).toContain('}, [problemIndex, safeIndex]);');
  });

  it('keeps the board and result side by side in short landscape', () => {
    const source = readFileSync('src/components/ProblemModal.tsx', 'utf8');
    const styles = readFileSync('src/index.css', 'utf8');

    expect(source).toContain('className="problem-body');
    expect(source).toContain('className="problem-board');
    expect(source).toContain('className="problem-toolbar');
    expect(styles).toMatch(/@media \(max-width: 1023px\) and \(orientation: landscape\)[\s\S]*?\.problem-body \{[\s\S]*?grid-template-columns: minmax\(8rem, 0\.72fr\) minmax\(0, 1fr\);[\s\S]*?\.problem-board \{[\s\S]*?max-width: 11\.25rem !important;/);
  });
});

describe('"right." as a solution comment', () => {
  // The pattern list spelled `right\.` on purpose -- the period keeps "right
  // side" out -- but it sat inside a group ending in `\b`, and a word boundary
  // after a period needs a word character next. So the one place anyone writes
  // it, the end of a sentence, never matched, while "right.Next" did.
  it('reads a solution comment that ends in "right."', () => {
    for (const note of ['Right.', 'That is right.', 'Right. Black lives.', 'and black is right.']) {
      expect(classifyProblemNode(build({ note })), note).toBe('correct');
    }
  });

  it('still keeps "right" without a period out of it', () => {
    for (const note of ['right side', 'the right group', 'rights.', 'outright.']) {
      expect(classifyProblemNode(build({ note })), note).toBe('unknown');
    }
  });

  it('still lets a wrong marker win over it', () => {
    expect(classifyProblemNode(build({ note: 'This looks right. Wrong, black dies.' }))).toBe('wrong');
  });

  it('finds the solution line through a leaf marked only "Right."', () => {
    // The verdict drives the grading, so an unread comment sent the solver
    // down the main line instead of the marked answer.
    const start = build({
      stones: true,
      children: [
        { move: { x: 0, y: 1, player: 'black' }, note: 'Fails.', children: [] },
        { move: { x: 1, y: 1, player: 'black' }, note: 'Right.', children: [] },
      ],
    });

    const path = findSolutionPath(start);

    expect(path).toHaveLength(2);
    expect(path[1]?.move).toEqual({ x: 1, y: 1, player: 'black' });
  });
});


describe('grading against the solver', () => {
  const mv = (x: number, y: number, player: Player): Move => ({ x, y, player });

  it('reads GB and GW as good for one side, not success for whoever solves', () => {
    const goodForWhite = build({ move: mv(1, 1, 'black'), properties: { GW: ['1'] } });
    expect(classifyProblemNode(goodForWhite, 'black')).toBe('wrong');
    expect(classifyProblemNode(goodForWhite, 'white')).toBe('correct');
    expect(classifyProblemNode(goodForWhite)).toBe('correct');
  });

  it('shows the line marked correct, even with the verdict on the key move', () => {
    const start = build({
      stones: true,
      children: [
        { move: mv(1, 1, 'black'), note: 'Wrong', children: [{ move: mv(2, 2, 'white') }] },
        { move: mv(3, 3, 'black'), note: 'Correct', children: [{ move: mv(4, 4, 'white') }] },
      ],
    });
    const path = findSolutionPath(start, 'black');
    expect(path[1]!.move).toMatchObject({ x: 3, y: 3 });
    expect(classifyProblemNode(path[path.length - 1]!, 'black')).toBe('correct');
  });

  it('steers the fallback main line around a refuted move', () => {
    const start = build({
      stones: true,
      children: [
        { move: mv(1, 1, 'black'), note: 'Wrong' },
        { move: mv(3, 3, 'black'), children: [{ move: mv(4, 4, 'white') }] },
      ],
    });
    expect(findSolutionPath(start, 'black').map((node) => node.move?.x ?? null)).toEqual([null, 3, 4]);
  });
});

describe('reading verdicts the way problem files write them', () => {
  const mv = (x: number, y: number, player: Player): Move => ({ x, y, player });
  const verdict = (note: string, solver?: Player) => classifyProblemNode(build({ note }), solver);

  it('does not read a negated positive as correct', () => {
    // Reproduced: "This is not the correct solution" was graded Correct.
    for (const note of [
      'This is not the correct solution',
      "That isn't right.",
      'Not correct: white lives.',
      'No success here.',
      'This never leads to the right answer',
      '不正解',
      '정답이 아닙니다',
    ]) {
      expect(verdict(note), note).toBe('wrong');
    }
  });

  it('lets the verdict a comment opens with decide', () => {
    // Reproduced: "Correct! The other move is a mistake" was graded Wrong.
    expect(verdict('Correct! The other move is a mistake.')).toBe('correct');
    expect(verdict('RIGHT - the alternative fails')).toBe('correct');
    expect(verdict('"Right." Playing elsewhere is wrong.')).toBe('correct');
    expect(verdict('正解。其他的手是错误')).toBe('correct');
    expect(verdict('Wrong. The correct move is at C3.')).toBe('wrong');
    expect(verdict('Incorrect -- the right answer is the hane.')).toBe('wrong');
    expect(verdict('Fails: the correct move was the throw-in.')).toBe('wrong');
  });

  it('keeps a negation word in another clause from negating what follows', () => {
    expect(verdict('No, this is correct.')).toBe('correct');
  });

  it('says nothing for a negated wrong word, or a mixed prose signal', () => {
    expect(verdict('This is not a mistake.')).toBe('unknown');
    expect(verdict('Not the only correct answer, but correct.')).toBe('unknown');
  });

  it('does not read "the solution is ..." in passing as a verdict', () => {
    expect(verdict('Black dies. The solution is at B2.')).toBe('unknown');
  });

  it('takes the node name as well as the comment', () => {
    expect(classifyProblemNode(build({ properties: { N: ['Wrong'], C: ['Correct shape, but too slow.'] } }))).toBe('wrong');
    expect(classifyProblemNode(build({ properties: { N: ['Correct'] } }))).toBe('correct');
  });

  it('reads SGF move annotations on the solver move before any prose', () => {
    expect(classifyProblemNode(build({ move: mv(1, 1, 'black'), properties: { BM: ['1'] }, note: 'Looks correct.' }), 'black')).toBe('wrong');
    expect(classifyProblemNode(build({ move: mv(1, 1, 'black'), properties: { DO: [''] } }), 'black')).toBe('wrong');
    expect(classifyProblemNode(build({ move: mv(1, 1, 'black'), properties: { TE: ['1'] } }), 'black')).toBe('correct');
    expect(classifyProblemNode(build({ move: mv(1, 1, 'black'), properties: { IT: [''] } }), 'black')).toBe('unknown');
  });

  it('leaves the opponent move annotations to the other signals', () => {
    // A tesuji by the opponent is no success for the solver.
    expect(classifyProblemNode(build({ move: mv(1, 1, 'white'), properties: { TE: ['1'] } }), 'black')).toBe('unknown');
    expect(classifyProblemNode(build({ move: mv(1, 1, 'white'), properties: { BM: ['1'] }, note: 'Correct' }), 'black')).toBe('correct');
  });
});

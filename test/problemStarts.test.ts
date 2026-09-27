import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { parseSgf } from '../src/utils/sgf';
import { classifyProblemNode, findChildForMove, findPassChild, getProblemStarts, isProblemPass, problemSideToMove } from '../src/utils/problemMode';

const load = (sgf: string) => {
  useGameStore.getState().loadGame(parseSgf(sgf));
  return useGameStore.getState().rootNode;
};

describe('problem starts', () => {
  afterEach(() => useGameStore.getState().resetGame());

  it('starts a problem at the set-up node after an empty root', () => {
    const root = load('(;GM[1]FF[4]SZ[9];AB[cc][dc]AW[cd][dd](;B[ec]C[Correct])(;B[aa]C[Wrong]))');
    const [start] = getProblemStarts(root);
    expect(start).toBeDefined();
    expect(start!.gameState.board.flat().filter(Boolean)).toHaveLength(4);
    expect(problemSideToMove(start!)).toBe('black');
    expect(findChildForMove(start!, 4, 2)).not.toBeNull();
  });

  it('does not pose a game that branches at move 1 as a collection', () => {
    const root = load('(;GM[1]SZ[9](;B[ee];W[cc];B[gc];W[cg])(;B[cc];W[ge];B[eg]))');
    expect(getProblemStarts(root)).toEqual([]);
  });

  it('does not pose a handicap game record as a problem', () => {
    const root = load('(;SZ[9]HA[2]AB[cc][gg]PL[W];W[ee];B[ce];W[ec])');
    expect(getProblemStarts(root)).toEqual([]);
  });

  it('still splits a real collection of set-up problems', () => {
    const root = load('(;GM[1]SZ[9](;AB[cc]AW[dd];B[dc]C[Correct])(;AB[gg]AW[ff];B[fg]C[Correct]))');
    expect(getProblemStarts(root)).toHaveLength(2);
  });

  it('reads goproblems’ C[RIGHT] as correct, but not "right side"', () => {
    const root = load('(;SZ[9]AB[cc][dc]AW[cd][dd](;B[ec]C[RIGHT])(;B[aa]C[play the right side]))');
    expect(classifyProblemNode(root.children[0]!, 'black')).toBe('correct');
    expect(classifyProblemNode(root.children[1]!, 'black')).toBe('unknown');
  });
});

describe('a problem solved by passing', () => {
  afterEach(() => useGameStore.getState().resetGame());

  // Seki-style problems record the answer as a pass; the board alone could
  // never reach that line.
  const sgf = '(;GM[1]FF[4]SZ[9];AB[cc][dc]AW[cd][dd](;B[]C[Correct, it is seki.])(;B[ec];W[fc]C[Wrong]))';

  it('finds the recorded pass and grades it like any other move', () => {
    const [start] = getProblemStarts(load(sgf));
    const pass = findPassChild(start!);
    expect(pass).not.toBeNull();
    expect(isProblemPass(pass!.move)).toBe(true);
    expect(classifyProblemNode(pass!, problemSideToMove(start!))).toBe('correct');
  });

  it('follows a pass the opponent replies with, and hands the move back', () => {
    const root = load('(;GM[1]FF[4]SZ[9];AB[cc][dc]AW[cd][dd];B[ec];W[];B[fc]C[Correct])');
    const [start] = getProblemStarts(root);
    const solverMove = findChildForMove(start!, 4, 2)!;
    const reply = solverMove.children[0]!;
    expect(isProblemPass(reply.move)).toBe(true);
    expect(classifyProblemNode(reply, 'black')).toBe('unknown');
    expect(problemSideToMove(reply)).toBe('black');
  });

  it('reports no pass where the problem records none', () => {
    const [start] = getProblemStarts(load('(;GM[1]FF[4]SZ[9];AB[cc][dc]AW[cd][dd](;B[ec]C[Correct])(;B[aa]C[Wrong]))'));
    expect(findPassChild(start!)).toBeNull();
  });

  it('offers the pass in the practice dialog', () => {
    const source = readFileSync('src/components/ProblemModal.tsx', 'utf8');
    expect(source).toContain('const child = findPassChild(node);');
    expect(source).toContain('playSolverMove(child);');
    expect(source).toContain('data-problem-pass="true"');
  });
});

import { describe, expect, it } from 'vitest';
import { getPunishQuizPrompt, gradePunishGuess, punishQuizPromptText, punishQuizVerdictText } from '../src/utils/punishQuiz';
import type { AnalysisResult, CandidateMove, GameNode, GameState } from '../src/types';

const EMPTY_TERRITORY: number[][] = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));

function candidate(x: number, y: number, order: number, pointsLost = 0): CandidateMove {
  return { x, y, order, pointsLost, winRate: 0.5, scoreLead: 0, visits: 100, prior: 0.1, pv: [] } as unknown as CandidateMove;
}

function analysis(scoreLead: number, moves: CandidateMove[] = []): AnalysisResult {
  return {
    rootWinRate: 0.5,
    rootScoreLead: scoreLead,
    moves,
    territory: EMPTY_TERRITORY,
    policy: undefined,
    ownershipStdev: undefined,
  };
}

function gameState(): GameState {
  return {
    board: Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null)),
    currentPlayer: 'black',
    moveHistory: [],
    capturedBlack: 0,
    capturedWhite: 0,
    komi: 6.5,
  };
}

function blunderNode(pointsLost: number, replyMoves: CandidateMove[]): GameNode {
  const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: gameState() };
  root.analysis = analysis(0);
  const node: GameNode = {
    id: 'blunder',
    parent: root,
    children: [],
    move: { x: 2, y: 2, player: 'white' }, // white move; lost points => lead moves toward black
    gameState: gameState(),
  };
  node.analysis = analysis(pointsLost, replyMoves);
  root.children.push(node);
  return node;
}

describe('getPunishQuizPrompt', () => {
  it('offers a quiz on a gradable blunder', () => {
    const node = blunderNode(7, [candidate(15, 3, 0)]);
    const prompt = getPunishQuizPrompt(node, 3);
    expect(prompt).toEqual({ blunderer: 'White', punisher: 'Black', pointsLost: 7 });
    expect(punishQuizPromptText(prompt!)).toBe('White just lost 7.0 points — find the punish!');
  });

  it('stays quiet for small losses or missing analysis', () => {
    expect(getPunishQuizPrompt(blunderNode(2, [candidate(15, 3, 0)]), 3)).toBeNull();
    expect(getPunishQuizPrompt(blunderNode(7, []), 3)).toBeNull();
  });
});

describe('gradePunishGuess', () => {
  const node = blunderNode(7, [candidate(15, 3, 0, 0), candidate(3, 15, 1, 0.8), candidate(9, 9, 2, 4.2)]);

  it('recognizes the top answer', () => {
    const verdict = gradePunishGuess(node, { x: 15, y: 3 })!;
    expect(verdict.verdict).toBe('best');
    expect(punishQuizVerdictText(verdict)).toContain('Spot on');
  });

  it('accepts near-best answers as close', () => {
    const verdict = gradePunishGuess(node, { x: 3, y: 15 })!;
    expect(verdict.verdict).toBe('close');
    expect(punishQuizVerdictText(verdict)).toContain("Engine's pick");
  });

  it('marks weak or unknown answers as a miss', () => {
    expect(gradePunishGuess(node, { x: 9, y: 9 })!.verdict).toBe('miss');
    expect(gradePunishGuess(node, { x: 0, y: 0 })!.verdict).toBe('miss');
  });
});

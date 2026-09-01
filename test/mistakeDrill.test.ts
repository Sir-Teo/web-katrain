import { describe, expect, it } from 'vitest';
import type { AnalysisResult, CandidateMove, GameNode, GameState, Move } from '../src/types';
import {
  collectDrillMistakes,
  drillPromptText,
  drillSummaryText,
  drillVerdictText,
  gradeDrillGuess,
  isDrillSolved,
} from '../src/utils/mistakeDrill';

const EMPTY_BOARD: GameState['board'] = Array.from({ length: 19 }, () => Array<null>(19).fill(null));

const state = (moveCount: number): GameState => ({
  board: EMPTY_BOARD,
  currentPlayer: 'black',
  moveHistory: Array.from({ length: moveCount }, () => ({ x: 0, y: 0, player: 'black' as const })),
  capturedBlack: 0,
  capturedWhite: 0,
  komi: 6.5,
});

const candidate = (x: number, y: number, pointsLost: number, order: number): CandidateMove => ({
  x,
  y,
  winRate: 0.5,
  scoreLead: 0,
  visits: 100,
  pointsLost,
  order,
});

const analysis = (scoreLead: number, moves: CandidateMove[]): AnalysisResult => ({
  rootScoreLead: scoreLead,
  rootWinRate: 0.5,
  territory: [[0]],
  moves,
});

/**
 * Builds a line where the score lead moves by `drop` points against the mover,
 * which is how `computeNodePointsLost` reads a mistake.
 */
const line = (): { root: GameNode; blunder: GameNode; quiet: GameNode } => {
  const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: state(0) };
  root.analysis = analysis(10, [candidate(3, 3, 0, 0), candidate(15, 3, 0.4, 1), candidate(9, 9, 4, 2)]);

  const blunderMove: Move = { x: 9, y: 9, player: 'black' };
  const blunder: GameNode = { id: 'blunder', parent: root, children: [], move: blunderMove, gameState: state(1) };
  // Black played and the lead fell from +10 to +4: six points given up.
  blunder.analysis = analysis(4, [candidate(0, 0, 0, 0)]);
  root.children.push(blunder);

  const quietMove: Move = { x: 0, y: 0, player: 'white' };
  const quiet: GameNode = { id: 'quiet', parent: blunder, children: [], move: quietMove, gameState: state(2) };
  quiet.analysis = analysis(4, [candidate(0, 0, 0, 0)]);
  blunder.children.push(quiet);

  return { root, blunder, quiet };
};

describe('collectDrillMistakes', () => {
  it('finds the moves that gave up at least the threshold, in play order', () => {
    const { root } = line();

    const mistakes = collectDrillMistakes({ rootNode: root, threshold: 3 });

    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]).toMatchObject({
      nodeId: 'blunder',
      parentNodeId: 'root',
      moveNumber: 1,
      player: 'black',
      played: { x: 9, y: 9 },
    });
    expect(mistakes[0]!.pointsLost).toBeCloseTo(6);
  });

  it('respects the threshold and the side filter', () => {
    const { root } = line();

    expect(collectDrillMistakes({ rootNode: root, threshold: 8 })).toHaveLength(0);
    expect(collectDrillMistakes({ rootNode: root, threshold: 3, side: 'black' })).toHaveLength(1);
    expect(collectDrillMistakes({ rootNode: root, threshold: 3, side: 'white' })).toHaveLength(0);
  });

  it('skips a move whose position was never analysed, because nothing could grade it', () => {
    const { root } = line();
    root.analysis = undefined;

    expect(collectDrillMistakes({ rootNode: root, threshold: 3 })).toHaveLength(0);
  });

  it('skips passes, which have no board answer to look for', () => {
    const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: state(0) };
    root.analysis = analysis(10, [candidate(3, 3, 0, 0)]);
    const pass: GameNode = {
      id: 'pass',
      parent: root,
      children: [],
      move: { x: -1, y: -1, player: 'black' },
      gameState: state(1),
    };
    pass.analysis = analysis(0, [candidate(0, 0, 0, 0)]);
    root.children.push(pass);

    expect(collectDrillMistakes({ rootNode: root, threshold: 3 })).toHaveLength(0);
  });

  it('follows the branch the reviewer is on', () => {
    const { root, blunder } = line();
    const sideline: GameNode = {
      id: 'sideline',
      parent: root,
      children: [],
      move: { x: 15, y: 3, player: 'black' },
      gameState: state(1),
    };
    sideline.analysis = analysis(10, [candidate(0, 0, 0, 0)]);
    root.children.push(sideline);

    expect(collectDrillMistakes({ rootNode: root, threshold: 3 })).toHaveLength(1);
    expect(
      collectDrillMistakes({ rootNode: root, threshold: 3, activeBranchChildIds: { [root.id]: sideline.id } })
    ).toHaveLength(0);
    expect(blunder.id).toBe('blunder');
  });
});

describe('gradeDrillGuess', () => {
  it('calls the engine top move solved', () => {
    const { root } = line();

    const verdict = gradeDrillGuess(root, { x: 3, y: 3 }, 6)!;

    expect(verdict.kind).toBe('best');
    expect(verdict.bestLabel).toBe('D16');
    expect(isDrillSolved(verdict.kind)).toBe(true);
    expect(drillVerdictText(verdict)).toContain('Solved');
  });

  it('accepts a move that gives up almost nothing', () => {
    const { root } = line();

    const verdict = gradeDrillGuess(root, { x: 15, y: 3 }, 6)!;

    expect(verdict.kind).toBe('good');
    expect(verdict.guessPointsLost).toBeCloseTo(0.4);
    expect(isDrillSolved(verdict.kind)).toBe(true);
  });

  it('separates a real improvement from repeating the mistake', () => {
    const { root } = line();
    root.analysis = analysis(10, [candidate(3, 3, 0, 0), candidate(4, 4, 3, 1), candidate(9, 9, 5.5, 2)]);

    const better = gradeDrillGuess(root, { x: 4, y: 4 }, 6)!;
    expect(better.kind).toBe('better');
    expect(isDrillSolved(better.kind)).toBe(false);
    expect(drillVerdictText(better)).toContain('better');

    // Within a point of what was played is not an improvement worth calling one.
    const same = gradeDrillGuess(root, { x: 9, y: 9 }, 6)!;
    expect(same.kind).toBe('miss');
  });

  it('says the engine did not consider a point rather than inventing a loss for it', () => {
    const { root } = line();

    const verdict = gradeDrillGuess(root, { x: 18, y: 18 }, 6)!;

    expect(verdict.kind).toBe('miss');
    expect(verdict.guessPointsLost).toBeNull();
    expect(drillVerdictText(verdict)).toContain('did not consider');
  });

  it('does not write "gives up -1.1 points" when a candidate scores above the top move', () => {
    const { root } = line();
    root.analysis = analysis(10, [candidate(3, 3, 0, 0), candidate(15, 3, -1.1, 1)]);

    const verdict = gradeDrillGuess(root, { x: 15, y: 3 }, 6)!;

    expect(verdict.kind).toBe('good');
    expect(drillVerdictText(verdict)).toBe('Q16 gives up nothing. The engine plays D16.');
  });

  it('grades nothing without analysis to grade against', () => {
    const { root } = line();
    root.analysis = undefined;

    expect(gradeDrillGuess(root, { x: 3, y: 3 }, 6)).toBeNull();
  });
});

describe('drill copy', () => {
  it('names the position, the side and the cost', () => {
    const { root } = line();
    const mistake = collectDrillMistakes({ rootNode: root, threshold: 3 })[0]!;

    const prompt = drillPromptText(mistake, 0, 3);

    expect(prompt).toContain('1/3');
    expect(prompt).toContain('Move 1');
    expect(prompt).toContain('Black');
    expect(prompt).toContain('6.0 pts');
  });

  it('reports the tally at the end', () => {
    expect(drillSummaryText(3, 3)).toContain('all 3');
    expect(drillSummaryText(1, 3)).toContain('1 of 3');
    expect(drillSummaryText(0, 0)).toContain('No mistakes');
  });
});

describe('a drill cannot outlive the tree it describes', () => {
  it('is cleared wherever the store replaces the root node', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/store/gameStore.ts', 'utf8');

    // A session is a list of node ids on one line of one tree. Loading a game,
    // starting a new one or resetting swaps that tree out from under it, and a
    // drill left running then points at positions that no longer exist.
    const replacements = [...source.matchAll(/^[ \t]*rootNode: newRoot,$/gm)];
    expect(replacements.length).toBeGreaterThanOrEqual(3);
    for (const match of replacements) {
      const preceding = source.slice(Math.max(0, match.index - 400), match.index);
      expect(preceding, `no drill clear before offset ${match.index}`).toContain('mistakeDrill: null,');
    }
  });
});

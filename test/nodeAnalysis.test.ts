import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

describe('one table decides what counts as a mistake', () => {
  const files = readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .map((f) => join('src', f));

  /**
   * `[12, 6, 3, 1.5, 0.5, 0]` is the points-lost boundary between a blunder, a
   * mistake and an inaccuracy, and the user can retune it in Settings. Five
   * components import it from here; two -- the game report and the settings
   * editor that *edits* it -- had written their own copy of the same numbers.
   *
   * They agreed, so nothing was wrong yet. What they could not do is stay
   * agreed: retuning the defaults would have left the report grading against
   * the old table while the board, the candidate list and the graph used the
   * new one, and "reset to default" in Settings would restore numbers the
   * grading no longer used.
   */
  it('is declared in exactly one place', () => {
    const declarers = files.filter((file) =>
      /(?:const|let)\s+DEFAULT_EVAL_THRESHOLDS\s*(?::[^=]+)?=/.test(readFileSync(file, 'utf8'))
    );
    expect(declarers).toEqual(['src/utils/nodeAnalysis.ts']);
  });

  it('has the numbers written down in exactly one file', () => {
    /**
     * Checked across the whole tree rather than against a list of graders. The
     * first version of this guard looked only for a redeclared
     * `DEFAULT_EVAL_THRESHOLDS` in six named components, so it did not see the
     * two bare copies of the literal that were sitting in the fallbacks inside
     * gameReport.ts -- the module that actually computes the report.
     */
    const spelledOut = files.filter((file) => /\[12, 6, 3, 1\.5, 0\.5, 0\]/.test(readFileSync(file, 'utf8')));
    expect(spelledOut).toEqual(['src/utils/nodeAnalysis.ts']);
  });

  it('is imported by every module that falls back to it', () => {
    const users = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return file !== 'src/utils/nodeAnalysis.ts' && source.includes('DEFAULT_EVAL_THRESHOLDS');
    });
    expect(users.length, 'nothing uses the shared table any more').toBeGreaterThanOrEqual(6);
    for (const file of users) {
      expect(readFileSync(file, 'utf8'), file).toMatch(
        /import \{[^}]*DEFAULT_EVAL_THRESHOLDS[^}]*\} from '[^']*nodeAnalysis'/
      );
    }
  });
});

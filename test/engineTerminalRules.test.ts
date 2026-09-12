import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MctsSearch, terminalAreaScoreBlack } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { BoardState, GameRules } from '../src/types';

// One independently alive Black region (51 points), two White regions (30).
// Each region has two eyes. Area scoring gives Black 21 before komi; taxing
// each region two points gives Black 23, because White has one extra region.
// Native formula: BoardHistory::countAreaScoreWhiteMinusBlack.
// https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/game/boardhistory.cpp
const SETTLED = [
  'XXXXOOOOO', 'X.XXO.O.O', 'XXXXOOOOO',
  'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX',
  'XXXXOOOOO', 'X.XXO.O.O', 'XXXXOOOOO',
];
const AREA_RULES = ['chinese', 'aga', 'new-zealand', 'tromp-taylor', 'stone-scoring'] as const satisfies readonly GameRules[];
const board = (swapColors = false): BoardState => SETTLED.map(row => Array.from(row, c =>
  c === '.' ? null : (c === 'X') !== swapColors ? 'black' : 'white'));
const stonesFrom = (rows: string[]) => Uint8Array.from(rows.join(''), c => c === 'X' ? 1 : c === 'O' ? 2 : 0);
const createPassSearch = async (rules: GameRules, extra: Partial<Parameters<typeof MctsSearch.create>[0]> = {}) =>
  MctsSearch.create({
    model: await loadHarnessModel(), board: board(), currentPlayer: 'black',
    moveHistory: [{ x: -1, y: -1, player: 'white' }], komi: 7, rules,
    nnRandomize: false, conservativePass: false, maxChildren: 82, ownershipMode: 'none',
    wideRootNoise: 0, rootSymmetryPruning: false,
    // Both points are occupied. Passing is the root's only candidate.
    regionOfInterest: { xMin: 2, xMax: 3, yMin: 0, yMax: 0 }, ...extra,
  });

describe('rule-aware terminal area counting', () => {
  beforeEach(() => setBoardSize(9));

  it('applies group tax to the score while preserving point ownership', () => {
    const ownership = new Float32Array(81);
    expect(terminalAreaScoreBlack(stonesFrom(SETTLED), 7, 'stone-scoring', ownership)).toBe(16);
    expect(Array.from(ownership).reduce((sum, point) => sum + point, 0)).toBe(21);
    expect(ownership[1 * 9 + 1]).toBe(1); // Black's eye
    expect(ownership[1 * 9 + 5]).toBe(-1); // White's eye
  });

  it.each([
    ['chinese', -15, -1], ['aga', -15, -1],
    ['new-zealand', -19, 1], ['tromp-taylor', -19, 1],
  ] as const)('counts the recorded self-capture-sensitive area under %s', (rules, score, cornerOwner) => {
    // KataGo's recorded "Area 2" maps in cpp/tests/testboardarea.cpp have
    // Black-minus-White totals of -8 without self-capture and -12 with it.
    const stones = stonesFrom([
      'X.OOOOOO.', 'OOX..XX.O', 'O...XOX.O', 'O...X.X.O', 'OXXX.XX.O',
      'OX..X...O', 'O.XOX...O', 'O.XXX...O', '.OOOOOOO.',
    ]);
    const ownership = new Float32Array(81);
    expect(terminalAreaScoreBlack(stones, 7, rules, ownership)).toBe(score);
    expect(ownership[0]).toBe(cornerOwner);
  });

  it.each(['japanese', 'korean'] as const)('rejects an area-only count for %s territory rules', (rules) => {
    expect(() => terminalAreaScoreBlack(stonesFrom(SETTLED), 7, rules)).toThrow('requires area rules');
  });
});

describe.skipIf(!hasModel())('exact terminal evaluation under every supported area rule', () => {
  beforeEach(() => setBoardSize(9));

  for (const player of ['black', 'white'] as const) {
    it.each(AREA_RULES)(`counts the final pass under %s with ${player} to move`, async (rules) => {
      const model = await loadHarnessModel();
      const spy = vi.spyOn(model, 'forwardPolicyValue');
      try {
        const search = await createPassSearch(rules, {
          model, board: board(player === 'white'), currentPlayer: player,
          moveHistory: [{ x: -1, y: -1, player: player === 'black' ? 'white' : 'black' }],
        });
        await search.run({ visits: 16, maxTimeMs: 30000, batchSize: 4 });
        // Only the root needs a neural evaluation. Finished leaves are counted.
        expect.soft(spy).toHaveBeenCalledTimes(1);
        const analysis = search.getAnalysis({ topK: 5, analysisPvLen: 3, includeMovesOwnership: true });
        const pass = analysis.moves.find(move => move.x === -1 && move.y === -1);
        const boardScore = rules === 'stone-scoring' ? 23 : 21;
        const expectedScore = (player === 'black' ? boardScore : -boardScore) - 7;
        expect(pass).toBeDefined();
        expect(pass!.scoreLead).toBeCloseTo(expectedScore, 8);
        expect(pass!.scoreSelfplay).toBeCloseTo(expectedScore, 8);
        expect(pass!.scoreStdev).toBe(0);
        expect(pass!.winRate).toBe(player === 'black' ? 1 : 0);
        expect(pass!.ownership?.[0]).toBe(player === 'black' ? 1 : -1);
        expect(pass!.ownership?.[8]).toBe(player === 'black' ? -1 : 1);
        expect(pass!.pv).toEqual(['pass']);
        expect(analysis.rootVisits).toBe(16);
      } finally {
        spy.mockRestore();
      }
    }, 60000);
  }

  it.each(AREA_RULES)('recognizes a drawn final pass under %s', async (rules) => {
    const search = await createPassSearch(rules, { komi: rules === 'stone-scoring' ? 23 : 21 });
    await search.run({ visits: 16, maxTimeMs: 30000, batchSize: 4 });
    const pass = search.getAnalysis({ topK: 5, analysisPvLen: 2 }).moves.find(move => move.x === -1);
    expect(pass?.scoreLead).toBe(0);
    expect(pass?.winRate).toBe(0.5);
    expect(pass?.scoreStdev).toBe(0);
  });

  it.each(['new-zealand', 'stone-scoring'] as const)('continues evaluating after just one pass under %s', async (rules) => {
    const model = await loadHarnessModel();
    const spy = vi.spyOn(model, 'forwardPolicyValue');
    try {
      const search = await createPassSearch(rules, { moveHistory: [] });
      await search.run({ visits: 16, maxTimeMs: 30000, batchSize: 4 });
      expect(spy.mock.calls.length).toBeGreaterThan(1);
      const pass = search.getAnalysis({ topK: 5, analysisPvLen: 3 }).moves.find(move => move.x === -1);
      expect(pass?.scoreStdev).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });

  it.each(['new-zealand', 'stone-scoring'] as const)('keeps the exact terminal score after reusing a one-pass child under %s', async (rules) => {
    const search = await createPassSearch(rules, { moveHistory: [] });
    await search.run({ visits: 16, maxTimeMs: 30000, batchSize: 4 });
    expect(await search.reRootToChild({
      move: 81, board: board(), previousBoard: board(), currentPlayer: 'white',
      moveHistory: [{ x: -1, y: -1, player: 'black' }], komi: 7, rules,
      regionOfInterest: { xMin: 2, xMax: 3, yMin: 0, yMax: 0 },
    })).toBe(true);
    await search.run({ visits: 32, maxTimeMs: 30000, batchSize: 4 });
    const pass = search.getAnalysis({ topK: 5, analysisPvLen: 3 }).moves.find(move => move.x === -1);
    expect(pass?.scoreLead).toBe(rules === 'stone-scoring' ? 16 : 14);
    expect(pass?.scoreStdev).toBe(0);
    expect(pass?.pv).toEqual(['pass']);
  });
});

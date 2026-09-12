import { beforeEach, describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { isValidMove } from '../src/utils/gameLogic';
import { isSuicideLegal } from '../src/utils/goRules';
import { emptyBoard, hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { BoardState, GameRules, Move } from '../src/types';

const position = (): BoardState => {
  const board = emptyBoard(9);
  board[0]![0] = 'black';
  for (const [x, y] of [[2, 0], [0, 1], [1, 1]]) board[y!]![x!] = 'white';
  return board;
};
const selfCapture: Move = { x: 1, y: 0, player: 'black' };

describe.skipIf(!hasModel())('search follows the selected self-capture rule', () => {
  beforeEach(() => setBoardSize(9));
  const create = async (rules: GameRules, extra: Partial<Parameters<typeof MctsSearch.create>[0]> = {}) => MctsSearch.create({
    model: await loadHarnessModel(), board: position(), currentPlayer: 'black', moveHistory: [],
    komi: 7, rules, nnRandomize: false, conservativePass: true, maxChildren: 82,
    ownershipMode: 'none', wideRootNoise: 0, rootSymmetryPruning: false, ...extra,
  });

  it.each(['japanese', 'chinese', 'new-zealand', 'tromp-taylor'] as const)('agrees with board legality at the root under %s', async (rules) => {
    const legal = isSuicideLegal(rules);
    expect(isValidMove(position(), 1, 0, 'black', undefined, { multiStoneSuicideLegal: legal })).toBe(legal);
    const search = await create(rules);
    const analysis = search.getAnalysis({ topK: 82, analysisPvLen: 0 });
    expect(analysis.policy![1]! >= 0).toBe(legal);
  });

  it.each(['new-zealand', 'tromp-taylor'] as const)('can analyze immediately after self-capture and the following move under %s', async (rules) => {
    const before = position();
    const after = before.map(row => [...row]);
    after[0]![0] = null;
    const next = after.map(row => [...row]);
    next[4]![4] = 'white';
    const immediate = await create(rules, { board: after, previousBoard: before, currentPlayer: 'white', moveHistory: [selfCapture] });
    expect(immediate.getAnalysis({ topK: 1, analysisPvLen: 0 }).rootVisits).toBeGreaterThan(0);
    const following = await create(rules, { board: next, previousBoard: after, previousPreviousBoard: before,
      moveHistory: [selfCapture, { x: 4, y: 4, player: 'white' }], currentPlayer: 'black' });
    expect(following.getAnalysis({ topK: 1, analysisPvLen: 0 }).rootVisits).toBeGreaterThan(0);
  });

  it('searches and reuses a self-capture child without corrupting its earlier positions', async () => {
    const before = position();
    const avoidMoveUntilBlack = new Int32Array(82);
    avoidMoveUntilBlack[81] = 1; // force examination of the target instead of passing at the root
    const search = await create('new-zealand', { regionOfInterest: { xMin: 0, xMax: 1, yMin: 0, yMax: 0 }, avoidMoveUntilBlack });
    await search.run({ visits: 6, maxTimeMs: 30000, batchSize: 1 });
    const analysis = search.getAnalysis({ topK: 82, analysisPvLen: 3 });
    expect(analysis.moves.some(move => move.x === 1 && move.y === 0 && move.visits > 0)).toBe(true);
    const after = before.map(row => [...row]);
    after[0]![0] = null;
    expect(await search.reRootToChild({ move: 1, board: after, previousBoard: before,
      currentPlayer: 'white', moveHistory: [selfCapture], komi: 7, rules: 'new-zealand' })).toBe(true);
    await search.run({ visits: 8, maxTimeMs: 30000, batchSize: 1 });
    expect(search.getAnalysis({ topK: 5, analysisPvLen: 2 }).rootVisits).toBeGreaterThanOrEqual(8);
    expect(before).toEqual(position());
  }, 60000);

  it('also permits self-capture inside the search, after the root player passes', async () => {
    const avoidMoveUntilBlack = new Int32Array(82).fill(2);
    avoidMoveUntilBlack[1] = 0;
    const search = await create('new-zealand', {
      currentPlayer: 'white',
      // Occupied A8/B8 exclude every root move except pass. The restrictions for
      // Black then require B9 on the following ply, inside an expanded leaf.
      regionOfInterest: { xMin: 0, xMax: 1, yMin: 1, yMax: 1 }, avoidMoveUntilBlack,
    });
    await search.run({ visits: 6, maxTimeMs: 30000, batchSize: 2 });
    const moves = search.getAnalysis({ topK: 5, analysisPvLen: 3 }).moves;
    const pass = moves.find(move => move.x === -1);
    expect(pass?.pv.slice(0, 2)).toEqual(['pass', 'B9']);
  }, 60000);
});

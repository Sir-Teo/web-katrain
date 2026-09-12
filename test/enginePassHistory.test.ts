import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setBoardSize, PASS_MOVE } from '../src/engine/katago/fastBoard';
import { extractInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { extractInputsV7 } from '../src/engine/katago/featuresV7';
import { fillInputsV7FastForPosition } from '../src/engine/katago/positionInputsV7';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import { parseSgf } from '../src/utils/sgf';
import type { BoardState, GameRules, Move } from '../src/types';
import reference from './fixtures/katagoPassHistoryV7.json';

const moves = parseSgf(reference.sgf).moves;
const boardAt = (ply: number): BoardState => {
  const board: BoardState = Array.from({ length: 9 }, () => Array(9).fill(null));
  for (const m of moves.slice(0, ply)) if (m.x >= 0 && m.y >= 0) board[m.y]![m.x] = m.player;
  return board;
};
const recent = (line: Move[]) => line.map(m => ({ move: m.x < 0 ? PASS_MOVE : m.y * 9 + m.x, player: m.player }));
const stones = (board: BoardState) => Uint8Array.from(board.flat(), s => s === 'black' ? 1 : s === 'white' ? 2 : 0);
const history = (spatial: ArrayLike<number>, global: ArrayLike<number>) => Array.from({ length: 5 }, (_, h) => {
  const matches = Array.from({ length: 81 }, (_, p) => p).filter(p => spatial[p * 22 + 9 + h] === 1);
  if (global[h] === 1) matches.push(81);
  expect(matches.length).toBeLessThanOrEqual(1);
  const p = matches[0];
  return p === undefined ? 'null' : p === 81 ? 'pass' : `${'ABCDEFGHJ'[p % 9]}${9 - Math.floor(p / 9)}`;
}).join(' ');

beforeEach(() => setBoardSize(9));

describe('recorded KataGo v7 pass and resumed-play histories', () => {
  it.each(reference.cases)('$rules komi=$komi hacks=$enablePassingHacks conservative=$conservativePassAndIsRoot', row => {
    for (let ply = 0; ply <= moves.length; ply++) {
      const board = boardAt(ply);
      const inputs = extractInputsV7Fast({
        ...row, rules: row.rules as GameRules, stones: stones(board), koPoint: -1,
        currentPlayer: ply % 2 ? 'white' : 'black', recentMoves: recent(moves.slice(0, ply)),
      });
      expect.soft(history(inputs.spatial, inputs.global), `ply ${ply}`).toBe(row.history[ply]);
    }
  });

  it.each(['japanese', 'korean'] as const)('keeps phase history consistent in the %s compatibility and worker paths', rules => {
    const expected = reference.cases.find(r => r.rules === 'japanese' && r.komi === 7 && r.conservativePassAndIsRoot)!;
    for (let ply = 0; ply <= moves.length; ply++) {
      const args = { board: boardAt(ply), currentPlayer: ply % 2 ? 'white' as const : 'black' as const,
        moveHistory: moves.slice(0, ply), komi: 7, rules, conservativePassAndIsRoot: true };
      const compat = extractInputsV7(args);
      expect.soft(history(compat.spatial, compat.global), `compat ply ${ply}`).toBe(expected.history[ply]);
      const outSpatial = new Float32Array(81 * 22), outGlobal = new Float32Array(19);
      fillInputsV7FastForPosition({ ...args, previousBoard: boardAt(Math.max(0, ply - 1)),
        previousPreviousBoard: boardAt(Math.max(0, ply - 2)), outSpatial, outGlobal });
      expect.soft(history(outSpatial, outGlobal), `worker ply ${ply}`).toBe(expected.history[ply]);
      expect(outGlobal[14], `phase-end signal at ply ${ply}`).toBe(ply > 0 && moves[ply - 1]!.x < 0 ? 1 : 0);
    }
  });

  it.each(['japanese', 'korean', 'chinese', 'aga', 'new-zealand', 'tromp-taylor', 'stone-scoring'] as const)(
    'uses the native friendly-pass preset for %s with conservative passing disabled', rules => {
      const friendly = ['chinese', 'aga', 'new-zealand', 'stone-scoring'].includes(rules);
      for (const player of ['black', 'white'] as const) {
        const inputs = extractInputsV7Fast({ stones: new Uint8Array(81), currentPlayer: player, koPoint: -1,
          recentMoves: [{ move: PASS_MOVE, player: player === 'black' ? 'white' : 'black' }],
          rules, komi: 0, enablePassingHacks: false, conservativePassAndIsRoot: false });
        expect(inputs.global[0]).toBe(friendly ? 0 : 1);
        expect(inputs.global[14]).toBe(friendly ? 0 : 1);
      }
    },
  );
});

describe.skipIf(!hasModel())('pass history reaching the actual search network', () => {
  it.each(['japanese', 'korean', 'chinese', 'aga', 'new-zealand', 'tromp-taylor', 'stone-scoring'] as const)(
    'uses the same %s history cap for previous ladder inputs', async rules => {
      const before: BoardState = Array.from({ length: 9 }, () => Array(9).fill(null));
      before[3]![3] = 'white';
      for (const [x, y] of [[2, 3], [3, 2], [4, 3], [2, 4], [4, 4], [3, 5]]) before[y!]![x!] = 'black';
      const board = before.map(row => [...row]);
      board[4]![3] = 'black'; // D5 captures White; the old ladder target disappears.
      board[3]![3] = null;
      const moveHistory: Move[] = [{ x: 3, y: 4, player: 'black' }, { x: -1, y: -1, player: 'white' }];
      const args = { board, previousBoard: board, previousPreviousBoard: before,
        moveHistory, currentPlayer: 'black' as const, komi: 100, rules, conservativePassAndIsRoot: false };
      const outSpatial = new Float32Array(81 * 22), outGlobal = new Float32Array(19);
      fillInputsV7FastForPosition({ ...args, outSpatial, outGlobal });
      const friendly = ['chinese', 'aga', 'new-zealand', 'stone-scoring'].includes(rules);
      const target = (3 * 9 + 3) * 22;
      expect(outSpatial[target + 14]).toBe(0);
      expect(outSpatial[target + 16]).toBe(friendly ? 0 : 1);

      const model = await loadHarnessModel();
      const recorded: Float32Array[] = [];
      const forward = model.forwardPolicyValue.bind(model);
      const spy = vi.spyOn(model, 'forwardPolicyValue').mockImplementation((spatial, global, meta) => {
        recorded.push(new Float32Array(spatial.dataSync()));
        return forward(spatial, global, meta);
      });
      try {
        await MctsSearch.create({ ...args, model, conservativePass: false, ignorePreRootHistory: false,
          nnRandomize: false, wideRootNoise: 0, ownershipMode: 'none', maxChildren: 82 });
        // Search enables passing hacks, so losing Tromp–Taylor also hides history.
        const suppressed = friendly || rules === 'tromp-taylor';
        expect(recorded[0]![target + 14]).toBe(0);
        expect(recorded[0]![target + 16]).toBe(suppressed ? 0 : 1);
      } finally { spy.mockRestore(); }
    },
  );

  it.each(['japanese', 'korean'] as const)('preserves the %s first pass in root and child tensors', async rules => {
    const model = await loadHarnessModel();
    const recorded: Array<{ spatial: Float32Array; global: Float32Array }> = [];
    const forward = model.forwardPolicyValue.bind(model);
    const spy = vi.spyOn(model, 'forwardPolicyValue').mockImplementation((spatial, global, meta) => {
      recorded.push({ spatial: new Float32Array(spatial.dataSync()), global: new Float32Array(global.dataSync()) });
      return forward(spatial, global, meta);
    });
    try {
      await MctsSearch.create({ model, board: boardAt(4), previousBoard: boardAt(3), previousPreviousBoard: boardAt(2),
        moveHistory: moves.slice(0, 4), currentPlayer: 'black', komi: 7, rules, conservativePass: true,
        ignorePreRootHistory: false, nnRandomize: false, wideRootNoise: 0, ownershipMode: 'none', maxChildren: 82 });
      expect(history(recorded[0]!.spatial, recorded[0]!.global)).toBe('pass D6 E5 F4 null');
      expect(recorded[0]!.global[14]).toBe(1);
      recorded.length = 0;
      // Only pass is available inside this occupied region. Its child must see
      // the new pass even though conservative passing was enabled at the root.
      const forcePassBoard = (ply: number) => { const board = boardAt(ply); board[3]![4] = 'black'; return board; };
      const search = await MctsSearch.create({ model, board: forcePassBoard(3), previousBoard: forcePassBoard(2),
        previousPreviousBoard: forcePassBoard(1), moveHistory: moves.slice(0, 3), currentPlayer: 'white',
        komi: 7, rules, conservativePass: true, ignorePreRootHistory: false, nnRandomize: false,
        wideRootNoise: 0, ownershipMode: 'none', maxChildren: 82, rootSymmetryPruning: false,
        regionOfInterest: { xMin: 3, xMax: 4, yMin: 3, yMax: 3 } });
      await search.run({ visits: 3, maxTimeMs: 30000, batchSize: 1 });
      expect(recorded.length).toBeGreaterThanOrEqual(2);
      expect(history(recorded[1]!.spatial, recorded[1]!.global)).toBe('pass D6 E5 F4 null');
    } finally { spy.mockRestore(); }
  }, 60000);
});

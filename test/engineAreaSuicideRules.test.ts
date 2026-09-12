import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { extractInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { fillInputsV7FastForPosition } from '../src/engine/katago/positionInputsV7';
import { computeAreaMapV7KataGo, computePassAliveAreaInto, setBoardSize } from '../src/engine/katago/fastBoard';
import { isValidMove } from '../src/utils/gameLogic';
import { isSuicideLegal } from '../src/utils/goRules';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { BoardState, GameRules, Move, Player } from '../src/types';

// KataGo's "Area 2" board and recorded calculateArea output, with all three
// area options enabled, as used for v7 area-scoring inputs. The two maps differ
// at seven points; a settled two-eye fixture would not expose a missing flag.
// https://github.com/lightvector/KataGo/blob/d3263466bd61c9e6aaee51b48c08826e18026506/cpp/tests/testboardarea.cpp
const POSITION = [
  'x.oooooo.', 'oox..xx.o', 'o...xox.o', 'o...x.x.o', 'oxxx.xx.o',
  'ox..x...o', 'o.xox...o', 'o.xxx...o', '.ooooooo.',
].join('');
const NO_SUICIDE_AREA = [
  'OOOOOOOOO', 'OOX..XX.O', 'O...XXX.O', 'O...XXX.O', 'OXXXXXX.O',
  'OXXXX...O', 'O.XXX...O', 'O.XXX...O', 'OOOOOOOOO',
].join('');
const SUICIDE_AREA = [
  'X.OOOOOOO', 'OOX..XX.O', 'O...XOX.O', 'O...X.X.O', 'OXXXXXX.O',
  'OX..X...O', 'O.XOX...O', 'O.XXX...O', 'OOOOOOOOO',
].join('');
const RULE_CASES = [
  ['chinese', NO_SUICIDE_AREA],
  ['new-zealand', SUICIDE_AREA],
  ['tromp-taylor', SUICIDE_AREA],
] as const satisfies ReadonlyArray<readonly [GameRules, string]>;

const stones = () => Uint8Array.from(POSITION, c => c === 'x' ? 1 : c === 'o' ? 2 : 0);
const board = (): BoardState => Array.from({ length: 9 }, (_, y) =>
  Array.from(POSITION.slice(y * 9, y * 9 + 9), c => c === 'x' ? 'black' : c === 'o' ? 'white' : null));
const expectArea = (spatial: ArrayLike<number>, area: string, player: Player) => {
  const own = player === 'black' ? 'X' : 'O';
  const opponent = player === 'black' ? 'O' : 'X';
  const actual = Array.from({ length: 81 }, (_, p) =>
    spatial[p * 22 + 18] === 1 ? own : spatial[p * 22 + 19] === 1 ? opponent : '.').join('');
  expect(actual).toBe(area);
};

describe('rule-dependent neural area features', () => {
  beforeEach(() => setBoardSize(9));

  it.each([[false, NO_SUICIDE_AREA], [true, SUICIDE_AREA]] as const)(
    'matches the recorded KataGo map with self-capture %s', (legal, area) => {
      expect(Array.from(computeAreaMapV7KataGo(stones(), legal), c => '.XO'[c]).join('')).toBe(area);
    });

  for (const player of ['black', 'white'] as const) {
    it.each(RULE_CASES)(`uses %s rules in standalone inputs for ${player}`, (rules, area) => {
      const inputs = extractInputsV7Fast({
        stones: stones(), currentPlayer: player, koPoint: -1, recentMoves: [], komi: 7, rules,
      });
      expectArea(inputs.spatial, area, player);
    });

    it.each(RULE_CASES)(`uses %s rules in single-position inputs for ${player}`, (rules, area) => {
      const outSpatial = new Float32Array(81 * 22);
      fillInputsV7FastForPosition({
        board: board(), currentPlayer: player, moveHistory: [], komi: 7, rules,
        conservativePassAndIsRoot: true, outSpatial, outGlobal: new Float32Array(19),
      });
      expectArea(outSpatial, area, player);
    });
  }
});

describe.skipIf(!hasModel())('rule-dependent pruning after opponent passes', () => {
  beforeEach(() => setBoardSize(9));
  const target = 5 * 9 + 2; // C4: pass-alive only when self-capture is forbidden.
  const plays = [[1, 4], [2, 4], [3, 4], [1, 5]] as const;
  const history = (player: Player): Move[] => plays.flatMap(([x, y]) => [
    { x, y, player },
    { x: -1, y: -1, player: player === 'black' ? 'white' : 'black' },
  ]);
  const position = (player: Player) => board().map(row => row.map(stone =>
    !stone || player === 'black' ? stone : stone === 'black' ? 'white' : 'black'));
  const create = async (player: Player, rules: GameRules, passes: 3 | 4) => {
    const current = position(player);
    if (passes === 3) current[5]![1] = null;
    expect(isValidMove(current, 2, 5, player, undefined, { multiStoneSuicideLegal: isSuicideLegal(rules) })).toBe(true);
    return MctsSearch.create({
      model: await loadHarnessModel(), board: current, currentPlayer: player,
      moveHistory: history(player).slice(0, passes * 2), komi: 7, rules,
      nnRandomize: false, conservativePass: true, ownershipMode: 'none', maxChildren: 82,
      wideRootNoise: 0, rootSymmetryPruning: false,
      // Both C4 and D4 are marked safe only under no-suicide rules. Limit search
      // to these points plus pass, with flatter priors so their visits are observable.
      regionOfInterest: { xMin: 2, xMax: 3, yMin: 5, yMax: 5 }, rootPolicyTemperature: 100,
    });
  };

  it('matches KataGo’s strict safe area at the target for both self-capture settings', () => {
    expect(computePassAliveAreaInto(stones(), new Uint8Array(81), false)[target]).toBe(1);
    // KataGo's recorded strict safe area for this fixture is entirely empty
    // when self-capture is legal (all three calculateArea options disabled).
    expect(Array.from(computePassAliveAreaInto(stones(), new Uint8Array(81), true))).toEqual(new Array(81).fill(0));
  });

  for (const player of ['black', 'white'] as const) {
    it.each(RULE_CASES)(`applies %s safe-area pruning for ${player} after four opponent passes`, async (rules) => {
      const search = await create(player, rules, 4);
      await search.run({ visits: 8, maxTimeMs: 30000, batchSize: 1 });
      const analysis = search.getAnalysis({ topK: 5, analysisPvLen: 0 });
      // Raw policy deliberately includes every legal move, even pruned ones.
      // Actual visits establish whether the endgame mask allowed exploration.
      expect(analysis.policy![target]).toBeGreaterThanOrEqual(0);
      expect(analysis.moves.some(move => move.y === 5 && move.visits > 0)).toBe(isSuicideLegal(rules));
    });

    it(`does not prune the target for ${player} after only three opponent passes`, async () => {
      const search = await create(player, 'chinese', 3);
      await search.run({ visits: 8, maxTimeMs: 30000, batchSize: 1 });
      expect(search.getAnalysis({ topK: 5, analysisPvLen: 0 }).moves.some(move => move.y === 5 && move.visits > 0)).toBe(true);
    });
  }

  it.each(['new-zealand', 'tromp-taylor'] as const)('retains useful moves when reusing the fourth-pass child under %s', async (rules) => {
    const current = position('black');
    const moves = history('black');
    const search = await MctsSearch.create({
      model: await loadHarnessModel(), board: current, currentPlayer: 'white',
      moveHistory: moves.slice(0, -1), komi: 7, rules, nnRandomize: false,
      conservativePass: true, ownershipMode: 'none', maxChildren: 82,
      wideRootNoise: 0, rootSymmetryPruning: false, rootPolicyTemperature: 100,
      // Force the fourth pass from White; both intersections are occupied.
      regionOfInterest: { xMin: 2, xMax: 3, yMin: 0, yMax: 0 },
    });
    await search.run({ visits: 4, maxTimeMs: 30000, batchSize: 1 });
    expect(await search.reRootToChild({
      move: 81, board: current, previousBoard: current, currentPlayer: 'black',
      moveHistory: moves, komi: 7, rules,
      regionOfInterest: { xMin: 2, xMax: 3, yMin: 5, yMax: 5 },
    })).toBe(true);
    await search.run({ visits: 16, maxTimeMs: 30000, batchSize: 1 });
    expect(search.getAnalysis({ topK: 5, analysisPvLen: 0 }).moves.some(move => move.y === 5 && move.visits > 0)).toBe(true);
  });
});

describe.skipIf(!hasModel())('area features reaching the real search network', () => {
  beforeEach(() => setBoardSize(9));

  it.each(RULE_CASES)('uses %s at the root and after passing into a child', async (rules, area) => {
    const model = await loadHarnessModel();
    const recorded: Float32Array[] = [];
    const forward = model.forwardPolicyValue.bind(model);
    const spy = vi.spyOn(model, 'forwardPolicyValue').mockImplementation((spatial, global, meta) => {
      // Record the real tensors and still execute the bundled network.
      recorded.push(new Float32Array(spatial.dataSync()));
      return forward(spatial, global, meta);
    });
    try {
      const search = await MctsSearch.create({
        model, board: board(), currentPlayer: 'black', moveHistory: [], komi: 7, rules,
        nnRandomize: false, conservativePass: true, ownershipMode: 'none', maxChildren: 82,
        wideRootNoise: 0, rootSymmetryPruning: false,
        // Both intersections are occupied: the root must pass. The first child
        // has the same stones with White to move, reversing the area channels.
        regionOfInterest: { xMin: 2, xMax: 3, yMin: 0, yMax: 0 },
      });
      await search.run({ visits: 4, maxTimeMs: 30000, batchSize: 2 });
      expect(recorded.length).toBeGreaterThanOrEqual(2);
      expectArea(recorded[0]!, area, 'black');
      expectArea(recorded[1]!, area, 'white');
    } finally {
      spy.mockRestore();
    }
  }, 60000);
});

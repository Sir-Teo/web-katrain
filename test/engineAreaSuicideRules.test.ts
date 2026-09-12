import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { extractInputsV7Fast } from '../src/engine/katago/featuresV7Fast';
import { fillInputsV7FastForPosition } from '../src/engine/katago/positionInputsV7';
import { computeAreaMapV7KataGo, setBoardSize } from '../src/engine/katago/fastBoard';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { BoardState, GameRules, Player } from '../src/types';

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

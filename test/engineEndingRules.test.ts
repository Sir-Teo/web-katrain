import { beforeEach, describe, expect, it } from 'vitest';
import { computeEndingScoreBonuses, MctsSearch } from '../src/engine/katago/analyzeMcts';
import {
  computeLibertyMap,
  computePassAliveAreaInto,
  isNonPassAliveSelfConnection,
  setBoardSize,
} from '../src/engine/katago/fastBoard';
import { boardFromDiagram, hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { GameRules } from '../src/types';

// Native getEndingWhiteScoreBonus applies the territory-only pass adjustment
// and capture penalty to Japanese/Korean, never to these five area presets.
const RULE_CASES = [
  ['japanese', 1 / 3, 0.5],
  ['korean', 1 / 3, 0.5],
  ['chinese', 0, 0],
  ['aga', 0, 0],
  ['new-zealand', 0, 0],
  ['tromp-taylor', 0, 0],
  ['stone-scoring', 0, 0],
] as const satisfies ReadonlyArray<readonly [GameRules, number, number]>;
const SPLIT = ['XXX.OOOOO', 'X.X.OO.OO', ...Array(7).fill('XXX.OOOOO')].join('\n');
const stonesOf = (diagram: string) =>
  Uint8Array.from(diagram.replaceAll('\n', ''), (c) => /[xX]/.test(c) ? 1 : /[oO]/.test(c) ? 2 : 0);

// KataGo testboardarea.cpp "Area 2", first board. Its strict safe-area output
// is entirely empty with legal self-capture, while C4 is Black otherwise.
const CONNECTION = [
  'x.oooooo.',
  'oox..xx.o',
  'o...xox.o',
  'o...x.x.o',
  'oxxx.xx.o',
  'ox..x...o',
  'o.xox...o',
  'o.xxx...o',
  '.ooooooo.',
].join('\n');

describe('endgame adjustments follow all supported rules', () => {
  beforeEach(() => setBoardSize(9));

  it.each(RULE_CASES)('applies the native pass adjustment under %s', (rules, passPenalty) => {
    const stones = stonesOf(SPLIT);
    for (const currentPlayer of ['black', 'white'] as const) {
      const bonuses = computeEndingScoreBonuses({
        stones,
        libertyMap: computeLibertyMap(stones),
        koPoint: -1,
        currentPlayer,
        rules,
        ownership: new Float32Array(81),
      });
      expect(bonuses?.[81] ?? 0).toBeCloseTo(currentPlayer === 'black' ? passPenalty : -passPenalty, 12);
    }
  });

  it.each(RULE_CASES)('preserves the native cleanup-capture adjustment under %s', (rules, _pass, capturePenalty) => {
    for (const player of [1, 2] as const) {
      const stones = new Uint8Array(81);
      stones[10] = 3 - player;
      for (const p of [1, 9, 19]) stones[p] = player;
      const ownership = new Float32Array(81);
      ownership[11] = player === 1 ? -1 : 1;
      const bonuses = computeEndingScoreBonuses({
        stones,
        libertyMap: computeLibertyMap(stones),
        koPoint: -1,
        currentPlayer: player === 1 ? 'black' : 'white',
        rules,
        ownership,
      });
      // C8 captures B8 even if the net predicts the intersection for the opponent.
      expect(bonuses?.[11] ?? 0).toBeCloseTo(player === 1 ? capturePenalty : -capturePenalty, 12);
    }
  });

  it.each([
    ['chinese', false, 0.5],
    ['new-zealand', true, 0],
    ['tromp-taylor', true, 0],
  ] as const)('uses the %s safe-area rule before discouraging a connection', (rules, suicideLegal, penalty) => {
    for (const player of [1, 2] as const) {
      const stones = stonesOf(CONNECTION);
      if (player === 2) {
        for (let p = 0; p < 81; p++) if (stones[p]) stones[p] = 3 - stones[p]!;
      }
      const safe = computePassAliveAreaInto(stones, new Uint8Array(81), suicideLegal);
      expect(safe[47]).toBe(suicideLegal ? 0 : player);
      expect(isNonPassAliveSelfConnection(stones, 47, player, safe)).toBe(suicideLegal);
      const ownership = new Float32Array(81);
      ownership[47] = player === 1 ? 1 : -1;
      const bonuses = computeEndingScoreBonuses({
        stones,
        libertyMap: computeLibertyMap(stones),
        koPoint: -1,
        currentPlayer: player === 1 ? 'black' : 'white',
        rules,
        ownership,
      });
      expect(bonuses?.[47] ?? 0).toBeCloseTo(player === 1 ? penalty : -penalty, 12);
    }
  });
});

describe.skipIf(!hasModel())('endgame adjustment in real search construction and reuse', () => {
  it.each(RULE_CASES)('keeps the %s adjustment when the opponent becomes the root', async (rules, passPenalty) => {
    setBoardSize(9);
    const board = boardFromDiagram(SPLIT);
    const search = await MctsSearch.create({
      model: await loadHarnessModel(),
      board,
      currentPlayer: 'black',
      moveHistory: [],
      komi: 7,
      rules,
      nnRandomize: false,
      conservativePass: false,
      wideRootNoise: 0,
      ownershipMode: 'root',
      maxChildren: 82,
      regionOfInterest: { xMin: 0, xMax: 1, yMin: 0, yMax: 0 },
    });
    // Inspect the actual adjustments consumed by selection; they are intentionally
    // not included in the reported raw policy or score.
    const passBonus = () => (search as unknown as { rootEndingBonus: Float64Array | null }).rootEndingBonus?.[81] ?? 0;
    expect(passBonus()).toBeCloseTo(passPenalty, 12);
    await search.run({ visits: 3, maxTimeMs: 30000, batchSize: 1 });
    expect(await search.reRootToChild({
      move: 81,
      board,
      previousBoard: board,
      currentPlayer: 'white',
      moveHistory: [{ x: -1, y: -1, player: 'black' }],
      komi: 7,
      rules,
    })).toBe(true);
    expect(passBonus()).toBeCloseTo(-passPenalty, 12);
  }, 60000);
});

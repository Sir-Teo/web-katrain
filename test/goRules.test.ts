import { describe, expect, it } from 'vitest';
import {
  RULES,
  RULES_OPTIONS,
  handicapBonusForWhite,
  isAreaScoring,
  isGameRules,
  areaFeatureModeForRules,
  groupTaxPerRegion,
  isSuicideLegal,
  rulesFromSgf,
  rulesLabel,
  rulesOf,
  rulesToSgf,
  rulesUseAreaFeature,
} from '../src/utils/goRules';

describe('ruleset table', () => {
  // Transcribed from KataGo's parseRulesHelper (cpp/game/rules.cpp).
  it.each([
    ['japanese', 'territory', 'simple', 'seki', false, 'zero', 6.5],
    ['korean', 'territory', 'simple', 'seki', false, 'zero', 6.5],
    ['chinese', 'area', 'simple', 'none', false, 'n', 7.5],
    ['aga', 'area', 'situational', 'none', false, 'n-minus-one', 7.5],
    ['new-zealand', 'area', 'situational', 'none', true, 'zero', 7.0],
    ['tromp-taylor', 'area', 'positional', 'none', true, 'zero', 7.5],
    ['stone-scoring', 'area', 'simple', 'all', false, 'zero', 7.5],
  ] as const)('matches KataGo for %s', (id, scoring, ko, tax, suicide, bonus, komi) => {
    const def = RULES[id];
    expect(def.scoring).toBe(scoring);
    expect(def.ko).toBe(ko);
    expect(def.tax).toBe(tax);
    expect(def.multiStoneSuicideLegal).toBe(suicide);
    expect(def.handicapBonus).toBe(bonus);
    expect(def.defaultKomi).toBe(komi);
  });

  it('offers every ruleset it defines', () => {
    expect(RULES_OPTIONS.map((option) => option.id).sort()).toEqual(Object.keys(RULES).sort());
  });

  it('gives every ruleset a summary of what differs', () => {
    for (const option of RULES_OPTIONS) {
      expect(option.summary.length).toBeGreaterThan(10);
    }
  });
});

describe('rule predicates', () => {
  it('knows which rulesets score by area', () => {
    expect(isAreaScoring('chinese')).toBe(true);
    expect(isAreaScoring('tromp-taylor')).toBe(true);
    expect(isAreaScoring('japanese')).toBe(false);
  });

  it('knows where suicide is legal', () => {
    expect(isSuicideLegal('new-zealand')).toBe(true);
    expect(isSuicideLegal('tromp-taylor')).toBe(true);
    expect(isSuicideLegal('chinese')).toBe(false);
  });

  it('picks the area feature KataGo computes for each ruleset', () => {
    // Pass-alive area for plain area scoring, independent life once taxed,
    // nothing at all for territory scoring.
    expect(areaFeatureModeForRules('chinese')).toBe('pass-alive');
    expect(areaFeatureModeForRules('aga')).toBe('pass-alive');
    expect(areaFeatureModeForRules('new-zealand')).toBe('pass-alive');
    expect(areaFeatureModeForRules('tromp-taylor')).toBe('pass-alive');
    expect(areaFeatureModeForRules('stone-scoring')).toBe('independent-life');
    expect(areaFeatureModeForRules('japanese')).toBe('none');
    expect(areaFeatureModeForRules('korean')).toBe('none');
    expect(rulesUseAreaFeature('stone-scoring')).toBe(true);
    expect(rulesUseAreaFeature('japanese')).toBe(false);
  });

  it('taxes living groups only under stone scoring', () => {
    expect(groupTaxPerRegion('stone-scoring')).toBe(2);
    expect(groupTaxPerRegion('chinese')).toBe(0);
    expect(groupTaxPerRegion('japanese')).toBe(0);
  });

  it('applies each handicap compensation rule', () => {
    expect(handicapBonusForWhite('chinese', 4)).toBe(4);
    expect(handicapBonusForWhite('aga', 4)).toBe(3);
    expect(handicapBonusForWhite('japanese', 4)).toBe(0);
    expect(handicapBonusForWhite('chinese', 0)).toBe(0);
  });

  it('falls back to Japanese for anything unknown', () => {
    expect(rulesOf('nonsense' as never).id).toBe('japanese');
    expect(isGameRules('aga')).toBe(true);
    expect(isGameRules('ing')).toBe(false);
    expect(rulesLabel('new-zealand')).toBe('New Zealand');
  });
});

describe('SGF round trip', () => {
  it('writes and reads every ruleset', () => {
    for (const option of RULES_OPTIONS) {
      expect(rulesFromSgf(rulesToSgf(option.id))).toBe(option.id);
    }
  });

  it('understands the aliases other clients write', () => {
    expect(rulesFromSgf('jp')).toBe('japanese');
    expect(rulesFromSgf('Chinese-OGS')).toBe('chinese');
    expect(rulesFromSgf('BGA')).toBe('aga');
    expect(rulesFromSgf('NZ')).toBe('new-zealand');
    expect(rulesFromSgf('TrompTaylor')).toBe('tromp-taylor');
    expect(rulesFromSgf('tromp taylor')).toBe('tromp-taylor');
  });

  it('reads the stone-scoring aliases', () => {
    expect(rulesFromSgf('stone-scoring')).toBe('stone-scoring');
    expect(rulesFromSgf('Ancient Chinese')).toBe('stone-scoring');
    expect(rulesFromSgf('ancient_area')).toBe('stone-scoring');
  });

  it('returns null for rulesets we do not serve', () => {
    expect(rulesFromSgf('Ing')).toBeNull();
    expect(rulesFromSgf('')).toBeNull();
    expect(rulesFromSgf(undefined)).toBeNull();
  });
});

describe('rules affect play and scoring', () => {
  it('allows multi-stone suicide only where the rules do', async () => {
    const { isValidMove } = await import('../src/utils/gameLogic');
    // White surrounds a 2-space eye; Black filling the last point kills its own pair.
    const board = [
      ['white', 'white', 'white', null],
      ['white', null, null, 'white'],
      ['white', 'white', 'white', null],
      [null, null, null, null],
    ].map((row) => row.map((cell) => (cell as 'white' | null))) as never;

    // Filling one of the two points is a normal move; filling the second is suicide.
    expect(isValidMove(board, 1, 1, 'black', undefined)).toBe(true);
    const withOne = (board as unknown as Array<Array<string | null>>).map((row) => [...row]);
    withOne[1]![1] = 'black';
    const partial = withOne as never;
    expect(isValidMove(partial, 2, 1, 'black', undefined)).toBe(false);
    expect(isValidMove(partial, 2, 1, 'black', undefined, { multiStoneSuicideLegal: true })).toBe(true);
  });

  it('scores by area when the rules say so', async () => {
    const { computeManualScoreEstimate } = await import('../src/utils/scoring');
    // Black owns the top half, White the bottom, with one stone each and no captures.
    const size = 4;
    const board = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => (y < 2 ? (y === 0 && x === 0 ? 'black' : null) : y === 3 && x === 3 ? 'white' : null))
    ) as never;

    const japanese = computeManualScoreEstimate({
      board,
      komi: 0,
      capturedBlack: 0,
      capturedWhite: 0,
      deadStones: new Set<string>(),
      rules: 'japanese',
    });
    const chinese = computeManualScoreEstimate({
      board,
      komi: 0,
      capturedBlack: 0,
      capturedWhite: 0,
      deadStones: new Set<string>(),
      rules: 'chinese',
    });
    // Area scoring counts the stones on the board as well as the territory.
    expect(chinese.blackScore).toBe(japanese.blackScore + 1);
    expect(chinese.whiteScore).toBe(japanese.whiteScore + 1);
  });

  it('taxes each living group under stone scoring', async () => {
    const { computeManualScoreEstimate } = await import('../src/utils/scoring');
    // Two separate black stones (two groups), one white stone (one group).
    const size = 5;
    const board = Array.from({ length: size }, () => Array.from({ length: size }, () => null)) as never as
      Array<Array<'black' | 'white' | null>>;
    board[0]![0] = 'black';
    board[0]![4] = 'black';
    board[4]![4] = 'white';

    const args = {
      board: board as never,
      komi: 0,
      capturedBlack: 0,
      capturedWhite: 0,
      deadStones: new Set<string>(),
      handicapStones: 0,
    };
    const chinese = computeManualScoreEstimate({ ...args, rules: 'chinese' as const });
    const ancient = computeManualScoreEstimate({ ...args, rules: 'stone-scoring' as const });

    // Black loses 2 points per group (two groups), White one group.
    expect(ancient.blackScore).toBe(chinese.blackScore - 4);
    expect(ancient.whiteScore).toBe(chinese.whiteScore - 2);
  });

  it('does not tax groups the players marked dead', async () => {
    const { computeManualScoreEstimate, countLivingGroups } = await import('../src/utils/scoring');
    const size = 5;
    const board = Array.from({ length: size }, () => Array.from({ length: size }, () => null)) as never as
      Array<Array<'black' | 'white' | null>>;
    board[0]![0] = 'black';
    board[0]![4] = 'black';

    expect(countLivingGroups(board as never, new Set())).toEqual({ blackGroups: 2, whiteGroups: 0 });
    expect(countLivingGroups(board as never, new Set(['4,0']))).toEqual({ blackGroups: 1, whiteGroups: 0 });

    const scored = computeManualScoreEstimate({
      board: board as never,
      komi: 0,
      capturedBlack: 0,
      capturedWhite: 0,
      deadStones: new Set(['4,0']),
      rules: 'stone-scoring',
    });
    expect(scored.blackScore).toBeGreaterThanOrEqual(0);
  });

  it('compensates White for handicap stones under the rules that do', async () => {
    const { computeManualScoreEstimate } = await import('../src/utils/scoring');
    const board = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => null)) as never;
    const score = (rules: 'chinese' | 'aga' | 'japanese') =>
      computeManualScoreEstimate({
        board,
        komi: 0,
        capturedBlack: 0,
        capturedWhite: 0,
        deadStones: new Set<string>(),
        rules,
        handicapStones: 4,
      }).whiteScore;

    expect(score('chinese')).toBe(4);
    expect(score('aga')).toBe(3);
    expect(score('japanese')).toBe(0);
  });
});

import type { GameRules } from '../types';

/**
 * Rulesets, as KataGo defines them.
 *
 * The parameters below are a direct transcription of `parseRulesHelper` in
 * KataGo's `cpp/game/rules.cpp`. They drive three things: the rule inputs the
 * network is given (`featuresV7`), whether multi-stone suicide is a legal move,
 * and how the position is scored.
 *
 * Only rulesets we can serve correctly are listed: each one's network inputs,
 * move legality and scoring are implemented rather than approximated.
 */

export type ScoringRule = 'area' | 'territory';
export type KoRule = 'simple' | 'positional' | 'situational';
export type TaxRule = 'none' | 'seki' | 'all';
/** Compensation White gets for Black's N handicap stones. */
export type HandicapBonusRule = 'zero' | 'n' | 'n-minus-one';

export type RulesDefinition = {
  id: GameRules;
  label: string;
  /** Short line for pickers, describing what actually differs. */
  summary: string;
  scoring: ScoringRule;
  ko: KoRule;
  tax: TaxRule;
  multiStoneSuicideLegal: boolean;
  hasButton: boolean;
  handicapBonus: HandicapBonusRule;
  /** KataGo's default komi for this ruleset. */
  defaultKomi: number;
  /** Value written to the SGF `RU` property. */
  sgf: string;
};

export const RULES: Record<GameRules, RulesDefinition> = {
  japanese: {
    id: 'japanese',
    label: 'Japanese',
    summary: 'Territory scoring, seki tax, simple ko.',
    scoring: 'territory',
    ko: 'simple',
    tax: 'seki',
    multiStoneSuicideLegal: false,
    hasButton: false,
    handicapBonus: 'zero',
    defaultKomi: 6.5,
    sgf: 'Japanese',
  },
  korean: {
    id: 'korean',
    label: 'Korean',
    summary: 'Same as Japanese: territory scoring, seki tax, simple ko.',
    scoring: 'territory',
    ko: 'simple',
    tax: 'seki',
    multiStoneSuicideLegal: false,
    hasButton: false,
    handicapBonus: 'zero',
    defaultKomi: 6.5,
    sgf: 'Korean',
  },
  chinese: {
    id: 'chinese',
    label: 'Chinese',
    summary: 'Area scoring, simple ko, White gets a point per handicap stone.',
    scoring: 'area',
    ko: 'simple',
    tax: 'none',
    multiStoneSuicideLegal: false,
    hasButton: false,
    handicapBonus: 'n',
    defaultKomi: 7.5,
    sgf: 'Chinese',
  },
  aga: {
    id: 'aga',
    label: 'AGA',
    summary: 'Area scoring, situational superko, White gets N−1 for handicap.',
    scoring: 'area',
    ko: 'situational',
    tax: 'none',
    multiStoneSuicideLegal: false,
    hasButton: false,
    handicapBonus: 'n-minus-one',
    defaultKomi: 7.5,
    sgf: 'AGA',
  },
  'new-zealand': {
    id: 'new-zealand',
    label: 'New Zealand',
    summary: 'Area scoring, situational superko, suicide is legal.',
    scoring: 'area',
    ko: 'situational',
    tax: 'none',
    multiStoneSuicideLegal: true,
    hasButton: false,
    handicapBonus: 'zero',
    defaultKomi: 7.0,
    sgf: 'New Zealand',
  },
  'stone-scoring': {
    id: 'stone-scoring',
    label: 'Ancient Chinese',
    summary: 'Area scoring with a two-point tax per living group (stone scoring).',
    scoring: 'area',
    ko: 'simple',
    tax: 'all',
    multiStoneSuicideLegal: false,
    hasButton: false,
    handicapBonus: 'zero',
    defaultKomi: 7.5,
    sgf: 'Stone Scoring',
  },
  'tromp-taylor': {
    id: 'tromp-taylor',
    label: 'Tromp-Taylor',
    summary: 'Area scoring, positional superko, suicide is legal.',
    scoring: 'area',
    ko: 'positional',
    tax: 'none',
    multiStoneSuicideLegal: true,
    hasButton: false,
    handicapBonus: 'zero',
    defaultKomi: 7.5,
    sgf: 'Tromp-Taylor',
  },
};

export const RULES_OPTIONS: RulesDefinition[] = [
  RULES.japanese,
  RULES.chinese,
  RULES.korean,
  RULES.aga,
  RULES['new-zealand'],
  RULES['tromp-taylor'],
  RULES['stone-scoring'],
];

export const isGameRules = (value: unknown): value is GameRules =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(RULES, value);

export const rulesOf = (rules: GameRules): RulesDefinition => RULES[rules] ?? RULES.japanese;

export const rulesLabel = (rules: GameRules): string => rulesOf(rules).label;

export const isAreaScoring = (rules: GameRules): boolean => rulesOf(rules).scoring === 'area';

export const isSuicideLegal = (rules: GameRules): boolean => rulesOf(rules).multiStoneSuicideLegal;

/**
 * Which "current area" input planes the network gets.
 *
 * KataGo computes them from pass-alive area for area scoring without a group
 * tax, and from independent-life area when a group tax applies. Territory
 * scoring omits the feature outside the encore, which we never enter.
 */
export type AreaFeatureMode = 'none' | 'pass-alive' | 'independent-life';

export const areaFeatureModeForRules = (rules: GameRules): AreaFeatureMode => {
  const def = rulesOf(rules);
  if (def.scoring !== 'area') return 'none';
  return def.tax === 'none' ? 'pass-alive' : 'independent-life';
};

export const rulesUseAreaFeature = (rules: GameRules): boolean =>
  areaFeatureModeForRules(rules) !== 'none';

/** Points each living group costs its owner under this ruleset's group tax. */
export const groupTaxPerRegion = (rules: GameRules): number => (rulesOf(rules).tax === 'all' ? 2 : 0);

/** Points White receives for Black's handicap stones under these rules. */
export const handicapBonusForWhite = (rules: GameRules, handicapStones: number): number => {
  if (handicapStones <= 0) return 0;
  switch (rulesOf(rules).handicapBonus) {
    case 'n':
      return handicapStones;
    case 'n-minus-one':
      return handicapStones - 1;
    default:
      return 0;
  }
};

const SGF_ALIASES: Array<{ match: RegExp; rules: GameRules }> = [
  { match: /^(japanese|jp)$/i, rules: 'japanese' },
  { match: /^(korean|kr)$/i, rules: 'korean' },
  { match: /^(chinese|cn|chinese-?(ogs|kgs))$/i, rules: 'chinese' },
  { match: /^(aga|bga|french)$/i, rules: 'aga' },
  { match: /^(nz|new[-_ ]?zealand)$/i, rules: 'new-zealand' },
  { match: /^(tromp[-_ ]?taylor|tromptaylor|tt)$/i, rules: 'tromp-taylor' },
  {
    match: /^(stone[-_ ]?scoring|ancient[-_ ]?area|ancient[-_ ]?chinese)$/i,
    rules: 'stone-scoring',
  },
];

/** Read an SGF `RU` value, falling back to null when it names something else. */
export const rulesFromSgf = (value: string | null | undefined): GameRules | null => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  for (const alias of SGF_ALIASES) {
    if (alias.match.test(trimmed)) return alias.rules;
  }
  return null;
};

export const rulesToSgf = (rules: GameRules): string => rulesOf(rules).sgf;

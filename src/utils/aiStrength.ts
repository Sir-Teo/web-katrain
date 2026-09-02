import type { GameSettings } from '../types';
import { describeHumanProfile } from './humanProfileLabel';

/**
 * Estimated playing strength of an AI configuration.
 *
 * KaTrain calibrated its weakened bots against reference opponents and stores
 * the results as lookup tables; `ai_rank_estimation` in `core/ai.py` reads a
 * configuration out of them. This is a direct port, tables included, so the
 * strength we show is the strength KaTrain measured rather than a guess.
 *
 * Ranks are on KaTrain's dan scale: 1 and above is that dan rank, anything
 * lower is `1 - rank` kyu. Some strategies have no meaningful estimate.
 */

type EloGrid = {
  xs: number[];
  ys: number[];
  /** values[yIndex][xIndex] */
  values: number[][];
};

/** elo -> kyu, from KaTrain CALIBRATED_RANK_ELO. */
const CALIBRATED_RANK_ELO: Array<[number, number]> = [[-21.679482223451032, 18], [42.60243194422105, 17], [106.88434611189314, 16], [171.16626027956522, 15], [235.44817444723742, 14], [299.7300886149095, 13], [364.0120027825817, 12], [428.2939169502538, 11], [492.5758311179259, 10], [556.8577452855981, 9], [621.1396594532702, 8], [685.4215736209424, 7], [749.7034877886144, 6], [813.9854019562865, 5], [878.2673161239586, 4], [942.5492302916308, 3], [1006.8311444593029, 2], [1071.113058626975, 1], [1135.3949727946472, 0], [1199.6768869623193, -1], [1263.9588011299913, -2], [1700, -4]];
const AI_WEIGHTED_ELO: Array<[number, number]> = [[0.5, 1591.5718897531551], [1.0, 1269.9896556526198], [1.25, 1042.25179764667], [1.5, 848.9410084463602], [1.75, 630.1483212024823], [2, 575.3637091858013], [2.5, 410.9747543504796], [3.0, 219.8667371799533]];
const AI_SCORELOSS_ELO: Array<[number, number]> = [[0.0, 539], [0.05, 625], [0.1, 859], [0.2, 1035], [0.3, 1201], [0.4, 1299], [0.5, 1346], [0.75, 1374], [1.0, 1386]];
const AI_PICK_ELO_GRID: EloGrid = {
  xs: [0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0],
  ys: [0, 5, 10, 15, 25, 50],
  values: [[-533.0, -515.0, -355.0, 234.0, 650.0, 1147.0, 1546.0, 1700.0], [-531.0, -450.0, -69.0, 347.0, 670.0, 1182.0, 1550.0, 1700.0], [-450.0, -311.0, 140.0, 459.0, 693.0, 1252.0, 1555.0, 1700.0], [-365.0, -82.0, 265.0, 508.0, 864.0, 1301.0, 1619.0, 1700.0], [-113.0, 273.0, 363.0, 641.0, 983.0, 1486.0, 1700.0, 1700.0], [514.0, 670.0, 870.0, 1128.0, 1305.0, 1550.0, 1700.0, 1700.0]],
};
const AI_LOCAL_ELO_GRID: EloGrid = {
  xs: [0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0],
  ys: [0, 5, 10, 15, 25, 50],
  values: [[-204.0, 791.0, 1154.0, 1372.0, 1402.0, 1473.0, 1700.0, 1700.0], [174.0, 1094.0, 1191.0, 1384.0, 1435.0, 1522.0, 1700.0, 1700.0], [619.0, 1155.0, 1323.0, 1390.0, 1450.0, 1558.0, 1700.0, 1700.0], [975.0, 1289.0, 1332.0, 1401.0, 1461.0, 1575.0, 1700.0, 1700.0], [1344.0, 1348.0, 1358.0, 1467.0, 1477.0, 1616.0, 1700.0, 1700.0], [1425.0, 1474.0, 1489.0, 1524.0, 1571.0, 1700.0, 1700.0, 1700.0]],
};
const AI_TENUKI_ELO_GRID: EloGrid = {
  xs: [0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0],
  ys: [0, 5, 10, 15, 25, 50],
  values: [[47.0, 335.0, 530.0, 678.0, 830.0, 1070.0, 1376.0, 1700.0], [99.0, 469.0, 546.0, 707.0, 855.0, 1090.0, 1413.0, 1700.0], [327.0, 513.0, 605.0, 745.0, 875.0, 1110.0, 1424.0, 1700.0], [429.0, 519.0, 620.0, 754.0, 900.0, 1130.0, 1435.0, 1700.0], [492.0, 607.0, 682.0, 797.0, 1000.0, 1208.0, 1454.0, 1700.0], [778.0, 830.0, 909.0, 949.0, 1169.0, 1461.0, 1483.0, 1700.0]],
};
const AI_TERRITORY_ELO_GRID: EloGrid = {
  xs: [0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0],
  ys: [0, 5, 10, 15, 25, 50],
  values: [[34.0, 383.0, 566.0, 748.0, 980.0, 1264.0, 1527.0, 1700.0], [131.0, 450.0, 586.0, 826.0, 995.0, 1280.0, 1537.0, 1700.0], [291.0, 517.0, 627.0, 850.0, 1010.0, 1310.0, 1547.0, 1700.0], [454.0, 526.0, 696.0, 870.0, 1038.0, 1340.0, 1590.0, 1700.0], [491.0, 603.0, 747.0, 890.0, 1050.0, 1390.0, 1635.0, 1700.0], [718.0, 841.0, 1039.0, 1076.0, 1332.0, 1523.0, 1700.0, 1700.0]],
};
const AI_INFLUENCE_ELO_GRID: EloGrid = {
  xs: [0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0],
  ys: [0, 5, 10, 15, 25, 50],
  values: [[217.0, 439.0, 572.0, 768.0, 960.0, 1227.0, 1449.0, 1521.0], [302.0, 551.0, 580.0, 800.0, 1028.0, 1257.0, 1470.0, 1529.0], [388.0, 572.0, 619.0, 839.0, 1077.0, 1305.0, 1490.0, 1561.0], [467.0, 591.0, 764.0, 878.0, 1097.0, 1390.0, 1530.0, 1591.0], [539.0, 622.0, 815.0, 953.0, 1120.0, 1420.0, 1560.0, 1601.0], [772.0, 912.0, 958.0, 1145.0, 1318.0, 1511.0, 1577.0, 1623.0]],
};

/** Index and fraction for interpolating `x` into a sorted axis, as KaTrain does. */
const interpIndex = (axis: number[], x: number): { index: number; t: number } => {
  let i = 0;
  while (i + 1 < axis.length - 1 && axis[i + 1]! < x) i += 1;
  const lo = axis[i]!;
  const hi = axis[i + 1]!;
  const span = hi - lo;
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, (x - lo) / span));
  return { index: i, t };
};

const interp1d = (table: Array<[number, number]>, x: number): number => {
  const xs = table.map((entry) => entry[0]);
  const ys = table.map((entry) => entry[1]);
  const { index, t } = interpIndex(xs, x);
  return (1 - t) * ys[index]! + t * ys[index + 1]!;
};

const interp2d = (grid: EloGrid, x: number, y: number): number => {
  const { index: i, t } = interpIndex(grid.xs, x);
  const { index: j, t: s } = interpIndex(grid.ys, y);
  return (
    grid.values[j]![i]! * (1 - t) * (1 - s) +
    grid.values[j]![i + 1]! * t * (1 - s) +
    grid.values[j + 1]![i]! * (1 - t) * s +
    grid.values[j + 1]![i + 1]! * t * s
  );
};

/** Dan-scale strength of the full-strength or fixed-strength strategies. */
const FIXED_STRENGTH: Partial<Record<GameSettings['aiStrategy'], number>> = {
  default: 9,
  handicap: 9,
  antimirror: 9,
  policy: 5,
  simple: 2,
  settle: 2,
};

export type AiStrengthEstimate = {
  /** KaTrain dan scale, or null when the strategy has no calibration. */
  rank: number | null;
  /** "4k", "1d", or null. */
  label: string | null;
  /** True when the number comes from KaTrain's measurements rather than a fixed value. */
  calibrated: boolean;
  /** Set for the human-net bot, whose strength is the profile it imitates, not a search setting. */
  imitates?: string;
};

/** KaTrain `rank_label`: 1 and up is dan, below that is kyu. */
export const formatRankLabel = (rank: number | null): string | null => {
  if (rank === null || !Number.isFinite(rank)) return null;
  return rank >= 0.5 ? `${Math.round(rank)}d` : `${Math.round(1 - rank)}k`;
};

/**
 * Port of KaTrain's `ai_rank_estimation`. Returns null for the strategies whose
 * strength depends on settings KaTrain never calibrated (jigo, weighted-by-hand
 * variations of the pick strategies are covered; the rest fall back to fixed
 * values).
 */
export const estimateAiRank = (
  strategy: GameSettings['aiStrategy'],
  settings: GameSettings
): AiStrengthEstimate => {
  const fixed = (rank: number): AiStrengthEstimate => ({
    rank,
    label: formatRankLabel(rank),
    calibrated: false,
  });
  const measured = (rank: number): AiStrengthEstimate => ({
    rank,
    label: formatRankLabel(rank),
    calibrated: true,
  });

  switch (strategy) {
    case 'rank':
      return measured(1 - settings.aiRankKyu);
    case 'weighted':
      return measured(1 - interp1d(CALIBRATED_RANK_ELO, interp1d(AI_WEIGHTED_ELO, settings.aiWeightedWeakenFac)));
    case 'scoreloss':
      return measured(1 - interp1d(CALIBRATED_RANK_ELO, interp1d(AI_SCORELOSS_ELO, settings.aiScoreLossStrength)));
    case 'pick':
      return measured(
        1 - interp1d(CALIBRATED_RANK_ELO, interp2d(AI_PICK_ELO_GRID, settings.aiPickPickFrac, settings.aiPickPickN))
      );
    case 'local':
      return measured(
        1 - interp1d(CALIBRATED_RANK_ELO, interp2d(AI_LOCAL_ELO_GRID, settings.aiLocalPickFrac, settings.aiLocalPickN))
      );
    case 'tenuki':
      return measured(
        1 -
          interp1d(CALIBRATED_RANK_ELO, interp2d(AI_TENUKI_ELO_GRID, settings.aiTenukiPickFrac, settings.aiTenukiPickN))
      );
    case 'territory':
      return measured(
        1 -
          interp1d(
            CALIBRATED_RANK_ELO,
            interp2d(AI_TERRITORY_ELO_GRID, settings.aiTerritoryPickFrac, settings.aiTerritoryPickN)
          )
      );
    case 'influence':
      return measured(
        1 -
          interp1d(
            CALIBRATED_RANK_ELO,
            interp2d(AI_INFLUENCE_ELO_GRID, settings.aiInfluencePickFrac, settings.aiInfluencePickN)
          )
      );
    case 'jigo':
      // KaTrain has no rank for a bot that aims for a half-point win.
      return { rank: null, label: null, calibrated: false };
    case 'human': {
      // The human network plays like the profile it is given; the label is the
      // profile itself, and no search calibration applies.
      const profile = settings.humanSlProfile?.trim();
      if (!profile) return { rank: null, label: null, calibrated: false };
      return { rank: null, label: describeHumanProfile(profile), calibrated: false, imitates: profile };
    }
    default: {
      const rank = FIXED_STRENGTH[strategy];
      return rank === undefined ? { rank: null, label: null, calibrated: false } : fixed(rank);
    }
  }
};

/** One line for the settings panel. */
export const describeAiStrength = (estimate: AiStrengthEstimate): string => {
  if (estimate.imitates && estimate.label) return `Plays like a ${estimate.label} player, from KataGo's human network.`;
  if (!estimate.label) return 'No calibrated strength for this style.';
  return estimate.calibrated
    ? `Estimated strength: about ${estimate.label}.`
    : `Estimated strength: ${estimate.label} (full strength).`;
};

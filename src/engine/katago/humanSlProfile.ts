import { NUM_INPUT_META_CHANNELS_V1 } from './loadModelV8';
import type { Player } from '../../types';

/**
 * The metadata row that KataGo's human SL net takes alongside the board: who is
 * playing, how strong they are, what the time control was, when the game was played
 * and where the record came from. Ported from cpp/neuralnet/sgfmetadata.cpp
 * (SGFMetadata::getProfile and SGFMetadata::fillMetadataRow).
 */

export type SgfMetadata = {
  inverseBRank: number; // 9d = 1, 8d = 2, ... 1d = 9, 1k = 10, ... 20k = 29
  inverseWRank: number;
  bIsHuman: boolean;
  wIsHuman: boolean;
  bIsUnranked: boolean;
  wIsUnranked: boolean;
  bRankIsUnknown: boolean;
  wRankIsUnknown: boolean;
  gameIsUnrated: boolean;
  gameRatednessIsUnknown: boolean;
  tcIsUnknown: boolean;
  tcIsNone: boolean;
  tcIsAbsolute: boolean;
  tcIsSimple: boolean;
  tcIsByoYomi: boolean;
  tcIsCanadian: boolean;
  tcIsFischer: boolean;
  mainTimeSeconds: number;
  periodTimeSeconds: number;
  byoYomiPeriods: number;
  canadianMoves: number;
  gameDate: { year: number; month: number; day: number };
  source: number;
};

// SGFMetadata::SOURCE_* in cpp/neuralnet/sgfmetadata.h
const SOURCE_KGS = 2;
const SOURCE_GOGOD = 5;
const SOURCE_GO4GO = 6;

const RANKS = [
  '9d', '8d', '7d', '6d', '5d', '4d', '3d', '2d', '1d',
  '1k', '2k', '3k', '4k', '5k', '6k', '7k', '8k', '9k', '10k',
  '11k', '12k', '13k', '14k', '15k', '16k', '17k', '18k', '19k', '20k',
];

/** 9d = 1, 8d = 2, ... 20k = 29; -1 when the rank is not one KataGo knows. */
export function inverseRankOf(rank: string): number {
  const idx = RANKS.indexOf(rank);
  return idx < 0 ? -1 : idx + 1;
}

export const HUMAN_SL_RANKS = RANKS;

const emptyMetadata = (): SgfMetadata => ({
  inverseBRank: 0,
  inverseWRank: 0,
  bIsHuman: false,
  wIsHuman: false,
  bIsUnranked: false,
  wIsUnranked: false,
  bRankIsUnknown: false,
  wRankIsUnknown: false,
  gameIsUnrated: false,
  gameRatednessIsUnknown: false,
  tcIsUnknown: false,
  tcIsNone: false,
  tcIsAbsolute: false,
  tcIsSimple: false,
  tcIsByoYomi: false,
  tcIsCanadian: false,
  tcIsFischer: false,
  mainTimeSeconds: 0,
  periodTimeSeconds: 0,
  byoYomiPeriods: 0,
  canadianMoves: 0,
  gameDate: { year: 2020, month: 3, day: 1 },
  source: 0,
});

function basicRankProfile(inverseRankBlack: number, inverseRankWhite: number, preAZ: boolean): SgfMetadata {
  // KataGo uses KGS as the source because its rating system is a reasonable anchor.
  const meta = emptyMetadata();
  meta.inverseBRank = inverseRankBlack;
  meta.inverseWRank = inverseRankWhite;
  meta.bIsHuman = true;
  meta.wIsHuman = true;
  meta.gameRatednessIsUnknown = true;
  meta.tcIsByoYomi = true;
  meta.mainTimeSeconds = 1200;
  meta.periodTimeSeconds = 30;
  meta.byoYomiPeriods = 5;
  meta.gameDate = preAZ ? { year: 2016, month: 9, day: 1 } : { year: 2020, month: 3, day: 1 };
  meta.source = SOURCE_KGS;
  return meta;
}

function proProfile(year: number, modern: boolean): SgfMetadata {
  const meta = emptyMetadata();
  meta.inverseBRank = 1;
  meta.inverseWRank = 1;
  meta.bIsHuman = true;
  meta.wIsHuman = true;
  meta.tcIsUnknown = true;
  meta.gameDate = { year, month: 6, day: 1 };
  meta.source = modern ? SOURCE_GO4GO : SOURCE_GOGOD;
  return meta;
}

/**
 * Turns a humanSLProfile string into metadata. Accepts `rank_5k`, `preaz_3d`,
 * `proyear_1950`, and the asymmetric `rank_{black}_{white}` forms. Returns null
 * for anything KataGo would not recognize.
 */
export function humanSlProfileToMetadata(profile: string): SgfMetadata | null {
  if (profile === '' || profile === '_') return null;

  if (profile.startsWith('proyear_')) {
    const year = Number.parseInt(profile.slice('proyear_'.length), 10);
    if (!Number.isFinite(year)) return null;
    if (year >= 1800 && year <= 2020) return proProfile(year, false);
    if (year >= 2021 && year <= 2023) return proProfile(year, true);
    return null;
  }

  const preAZ = profile.startsWith('preaz_');
  if (!preAZ && !profile.startsWith('rank_')) return null;
  const ranksStr = profile.slice(preAZ ? 'preaz_'.length : 'rank_'.length);

  const single = inverseRankOf(ranksStr);
  if (single !== -1) return basicRankProfile(single, single, preAZ);

  const pieces = ranksStr.split('_');
  if (pieces.length === 2) {
    const black = inverseRankOf(pieces[0]!);
    const white = inverseRankOf(pieces[1]!);
    if (black !== -1 && white !== -1) return basicRankProfile(black, white, preAZ);
  }
  return null;
}

/** Days from 1970-01-01 to the given date, as KataGo's SimpleDate::numDaysAfter. */
function daysSinceEpoch(date: { year: number; month: number; day: number }): number {
  const ms = Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(1970, 0, 1);
  return Math.round(ms / 86400000);
}

/**
 * Fills KataGo's 192-channel metadata row for the player to move
 * (SGFMetadata::fillMetadataRow).
 */
export function fillHumanSlMetadataRow(args: {
  meta: SgfMetadata;
  nextPlayer: Player;
  boardArea: number;
  out?: Float32Array;
}): Float32Array {
  const row = args.out ?? new Float32Array(NUM_INPUT_META_CHANNELS_V1);
  row.fill(0);
  const meta = args.meta;
  const isWhite = args.nextPlayer === 'white';

  row[0] = (isWhite ? meta.wIsHuman : meta.bIsHuman) ? 1 : 0;
  row[1] = (isWhite ? meta.bIsHuman : meta.wIsHuman) ? 1 : 0;

  const plaIsUnranked = isWhite ? meta.wIsUnranked : meta.bIsUnranked;
  const oppIsUnranked = isWhite ? meta.bIsUnranked : meta.wIsUnranked;
  row[2] = plaIsUnranked ? 1 : 0;
  row[3] = oppIsUnranked ? 1 : 0;

  row[4] = (isWhite ? meta.wRankIsUnknown : meta.bRankIsUnknown) ? 1 : 0;
  row[5] = (isWhite ? meta.bRankIsUnknown : meta.wRankIsUnknown) ? 1 : 0;

  const RANK_START_IDX = 6;
  const RANK_LEN_PER_PLA = 34;
  const invPlaRank = isWhite ? meta.inverseWRank : meta.inverseBRank;
  const invOppRank = isWhite ? meta.inverseBRank : meta.inverseWRank;
  if (!plaIsUnranked) {
    for (let i = 0; i < Math.min(invPlaRank, RANK_LEN_PER_PLA); i++) row[RANK_START_IDX + i] = 1;
  }
  if (!oppIsUnranked) {
    for (let i = 0; i < Math.min(invOppRank, RANK_LEN_PER_PLA); i++) row[RANK_START_IDX + RANK_LEN_PER_PLA + i] = 1;
  }

  row[74] = meta.gameRatednessIsUnknown ? 0.5 : meta.gameIsUnrated ? 1 : 0;

  row[75] = meta.tcIsUnknown ? 1 : 0;
  row[76] = meta.tcIsNone ? 1 : 0;
  row[77] = meta.tcIsAbsolute ? 1 : 0;
  row[78] = meta.tcIsSimple ? 1 : 0;
  row[79] = meta.tcIsByoYomi ? 1 : 0;
  row[80] = meta.tcIsCanadian ? 1 : 0;
  row[81] = meta.tcIsFischer ? 1 : 0;

  const mainTime = Math.min(Math.max(meta.mainTimeSeconds, 0), 3 * 86400);
  const periodTime = Math.min(Math.max(meta.periodTimeSeconds, 0), 1 * 86400);
  row[82] = 0.4 * (Math.log(mainTime + 60.0) - 6.5);
  row[83] = 0.3 * (Math.log(periodTime + 1.0) - 3.0);
  const byoYomiPeriods = Math.min(Math.max(meta.byoYomiPeriods, 0), 50);
  const canadianMoves = Math.min(Math.max(meta.canadianMoves, 0), 50);
  row[84] = 0.5 * (Math.log(byoYomiPeriods + 2.0) - 1.5);
  row[85] = 0.25 * (Math.log(canadianMoves + 2.0) - 1.5);

  row[86] = 0.5 * Math.log(args.boardArea / 361.0);

  // A bank of sine/cosine features over the game date, starting at a one-week
  // period and stretching out to cover a couple of centuries.
  const DATE_START_IDX = 87;
  const DATE_LEN = 32;
  const daysDifference = daysSinceEpoch(meta.gameDate);
  let period = 7.0;
  const factor = Math.pow(80000, 1.0 / (DATE_LEN - 1));
  const twopi = 2 * Math.PI;
  for (let i = 0; i < DATE_LEN; i++) {
    const numRevolutions = daysDifference / period;
    row[DATE_START_IDX + i * 2 + 0] = Math.cos(numRevolutions * twopi);
    row[DATE_START_IDX + i * 2 + 1] = Math.sin(numRevolutions * twopi);
    period *= factor;
  }

  if (meta.source < 0 || meta.source >= 16) throw new Error(`Invalid SGF metadata source ${meta.source}`);
  row[151 + meta.source] = 1;

  return row;
}

/** Convenience: the metadata row for a profile name, or null if unrecognized. */
export function humanSlMetadataRow(args: {
  profile: string;
  nextPlayer: Player;
  boardArea: number;
  out?: Float32Array;
}): Float32Array | null {
  const meta = humanSlProfileToMetadata(args.profile);
  if (!meta) return null;
  return fillHumanSlMetadataRow({ meta, nextPlayer: args.nextPlayer, boardArea: args.boardArea, out: args.out });
}

import { BOARD_AREA, BOARD_SIZE } from './fastBoard';

const TWO_OVER_PI = 2 / Math.PI;
const EXTRA_SCORE_DISTR_RADIUS = 60;

const SV_TABLE_ASSUMED_BSIZE = BOARD_SIZE;
const SV_TABLE_MEAN_RADIUS = SV_TABLE_ASSUMED_BSIZE * SV_TABLE_ASSUMED_BSIZE + EXTRA_SCORE_DISTR_RADIUS;
const SV_TABLE_MEAN_LEN = SV_TABLE_MEAN_RADIUS * 2;
const SV_TABLE_STDEV_LEN = SV_TABLE_ASSUMED_BSIZE * SV_TABLE_ASSUMED_BSIZE + EXTRA_SCORE_DISTR_RADIUS;

let expectedSVTable: Float64Array | null = null;

function whiteScoreValueOfScoreSmoothNoDrawAdjust(finalWhiteMinusBlackScore: number, center: number, scale: number, sqrtBoardArea: number): number {
  const adjustedScore = finalWhiteMinusBlackScore - center;
  return Math.atan(adjustedScore / (scale * sqrtBoardArea)) * TWO_OVER_PI;
}

function initScoreValueTables(): void {
  if (expectedSVTable) return;

  expectedSVTable = new Float64Array(SV_TABLE_MEAN_LEN * SV_TABLE_STDEV_LEN);

  const stepsPerUnit = 10;
  const boundStdevs = 5;
  const minStdevSteps = -boundStdevs * stepsPerUnit;
  const maxStdevSteps = -minStdevSteps;

  const normalPDF = new Float64Array(maxStdevSteps - minStdevSteps + 1);
  for (let i = minStdevSteps; i <= maxStdevSteps; i++) {
    const xInStdevs = i / stepsPerUnit;
    normalPDF[i - minStdevSteps] = Math.exp(-0.5 * xInStdevs * xInStdevs);
  }

  const minSVSteps = -(
    SV_TABLE_MEAN_RADIUS * stepsPerUnit +
    stepsPerUnit / 2 +
    boundStdevs * SV_TABLE_STDEV_LEN * stepsPerUnit
  );
  const maxSVSteps = -minSVSteps;

  const svPrecomp = new Float64Array(maxSVSteps - minSVSteps + 1);
  for (let i = minSVSteps; i <= maxSVSteps; i++) {
    const mean = i / stepsPerUnit;
    svPrecomp[i - minSVSteps] = whiteScoreValueOfScoreSmoothNoDrawAdjust(mean, 0.0, 1.0, SV_TABLE_ASSUMED_BSIZE);
  }

  for (let meanIdx = 0; meanIdx < SV_TABLE_MEAN_LEN; meanIdx++) {
    const meanSteps = (meanIdx - SV_TABLE_MEAN_RADIUS) * stepsPerUnit - stepsPerUnit / 2;
    const rowBase = meanIdx * SV_TABLE_STDEV_LEN;

    for (let stdevIdx = 0; stdevIdx < SV_TABLE_STDEV_LEN; stdevIdx++) {
      let wSum = 0.0;
      let wsvSum = 0.0;

      for (let i = minStdevSteps; i <= maxStdevSteps; i++) {
        const xSteps = meanSteps + stdevIdx * i;
        const w = normalPDF[i - minStdevSteps]!;
        const sv = svPrecomp[xSteps - minSVSteps]!;
        wSum += w;
        wsvSum += w * sv;
      }

      expectedSVTable[rowBase + stdevIdx] = wsvSum / wSum;
    }
  }
}

export function expectedWhiteScoreValue(args: {
  whiteScoreMean: number;
  whiteScoreStdev: number;
  center: number;
  scale: number;
  sqrtBoardArea: number;
}): number {
  initScoreValueTables();
  if (!expectedSVTable) throw new Error('ScoreValue tables not initialized');

  const scaleFactor = SV_TABLE_ASSUMED_BSIZE / (args.scale * args.sqrtBoardArea);

  const meanScaled = (args.whiteScoreMean - args.center) * scaleFactor;
  const stdevScaled = args.whiteScoreStdev * scaleFactor;

  const meanRounded = Math.round(meanScaled);
  const stdevFloored = Math.floor(stdevScaled);
  let meanIdx0 = meanRounded + SV_TABLE_MEAN_RADIUS;
  let stdevIdx0 = stdevFloored;
  let meanIdx1 = meanIdx0 + 1;
  let stdevIdx1 = stdevIdx0 + 1;

  if (meanIdx0 < 0) {
    meanIdx0 = 0;
    meanIdx1 = 0;
  }
  if (meanIdx1 >= SV_TABLE_MEAN_LEN) {
    meanIdx0 = SV_TABLE_MEAN_LEN - 1;
    meanIdx1 = SV_TABLE_MEAN_LEN - 1;
  }

  if (stdevIdx0 < 0) stdevIdx0 = 0;
  if (stdevIdx1 >= SV_TABLE_STDEV_LEN) {
    stdevIdx0 = SV_TABLE_STDEV_LEN - 1;
    stdevIdx1 = SV_TABLE_STDEV_LEN - 1;
  }

  const lambdaMean = meanScaled - meanRounded + 0.5;
  const lambdaStdev = stdevScaled - stdevFloored;

  const row0 = meanIdx0 * SV_TABLE_STDEV_LEN;
  const row1 = meanIdx1 * SV_TABLE_STDEV_LEN;
  const a00 = expectedSVTable[row0 + stdevIdx0]!;
  const a01 = expectedSVTable[row0 + stdevIdx1]!;
  const a10 = expectedSVTable[row1 + stdevIdx0]!;
  const a11 = expectedSVTable[row1 + stdevIdx1]!;

  const b0 = a00 + lambdaStdev * (a01 - a00);
  const b1 = a10 + lambdaStdev * (a11 - a10);
  return b0 + lambdaMean * (b1 - b0);
}

export function getScoreStdev(scoreMean: number, scoreMeanSq: number): number {
  const variance = scoreMeanSq - scoreMean * scoreMean;
  if (variance <= 0) return 0;
  return Math.sqrt(variance);
}

export const SQRT_BOARD_AREA = Math.sqrt(BOARD_AREA);

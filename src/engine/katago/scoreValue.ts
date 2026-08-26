import { BOARD_AREA, BOARD_SIZE } from './fastBoard';

const TWO_OVER_PI = 2 / Math.PI;
const EXTRA_SCORE_DISTR_RADIUS = 60;

let svTableBoardSize = 0;
let svTableMeanRadius = 0;
let svTableMeanLen = 0;
let svTableStdevLen = 0;

let expectedSVTable: Float64Array | null = null;

function whiteScoreValueOfScoreSmoothNoDrawAdjust(finalWhiteMinusBlackScore: number, center: number, scale: number, sqrtBoardArea: number): number {
  const adjustedScore = finalWhiteMinusBlackScore - center;
  return Math.atan(adjustedScore / (scale * sqrtBoardArea)) * TWO_OVER_PI;
}

function initScoreValueTables(): void {
  const boardSize = BOARD_SIZE;
  if (expectedSVTable && svTableBoardSize === boardSize) return;

  svTableBoardSize = boardSize;
  svTableMeanRadius = svTableBoardSize * svTableBoardSize + EXTRA_SCORE_DISTR_RADIUS;
  svTableMeanLen = svTableMeanRadius * 2;
  svTableStdevLen = svTableBoardSize * svTableBoardSize + EXTRA_SCORE_DISTR_RADIUS;
  expectedSVTable = new Float64Array(svTableMeanLen * svTableStdevLen);

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
    svTableMeanRadius * stepsPerUnit +
    stepsPerUnit / 2 +
    boundStdevs * svTableStdevLen * stepsPerUnit
  );
  const maxSVSteps = -minSVSteps;

  const svPrecomp = new Float64Array(maxSVSteps - minSVSteps + 1);
  for (let i = minSVSteps; i <= maxSVSteps; i++) {
    const mean = i / stepsPerUnit;
    svPrecomp[i - minSVSteps] = whiteScoreValueOfScoreSmoothNoDrawAdjust(mean, 0.0, 1.0, svTableBoardSize);
  }

  for (let meanIdx = 0; meanIdx < svTableMeanLen; meanIdx++) {
    const meanSteps = (meanIdx - svTableMeanRadius) * stepsPerUnit - stepsPerUnit / 2;
    const rowBase = meanIdx * svTableStdevLen;

    for (let stdevIdx = 0; stdevIdx < svTableStdevLen; stdevIdx++) {
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

  const scaleFactor = svTableBoardSize / (args.scale * args.sqrtBoardArea);

  const meanScaled = (args.whiteScoreMean - args.center) * scaleFactor;
  const stdevScaled = args.whiteScoreStdev * scaleFactor;

  const meanRounded = Math.round(meanScaled);
  const stdevFloored = Math.floor(stdevScaled);
  let meanIdx0 = meanRounded + svTableMeanRadius;
  let stdevIdx0 = stdevFloored;
  let meanIdx1 = meanIdx0 + 1;
  let stdevIdx1 = stdevIdx0 + 1;

  if (meanIdx0 < 0) {
    meanIdx0 = 0;
    meanIdx1 = 0;
  }
  if (meanIdx1 >= svTableMeanLen) {
    meanIdx0 = svTableMeanLen - 1;
    meanIdx1 = svTableMeanLen - 1;
  }

  if (stdevIdx0 < 0) stdevIdx0 = 0;
  if (stdevIdx1 >= svTableStdevLen) {
    stdevIdx0 = svTableStdevLen - 1;
    stdevIdx1 = svTableStdevLen - 1;
  }

  const lambdaMean = meanScaled - meanRounded + 0.5;
  const lambdaStdev = stdevScaled - stdevFloored;

  const row0 = meanIdx0 * svTableStdevLen;
  const row1 = meanIdx1 * svTableStdevLen;
  const a00 = expectedSVTable[row0 + stdevIdx0]!;
  const a01 = expectedSVTable[row0 + stdevIdx1]!;
  const a10 = expectedSVTable[row1 + stdevIdx0]!;
  const a11 = expectedSVTable[row1 + stdevIdx1]!;

  const b0 = a00 + lambdaStdev * (a01 - a00);
  const b1 = a10 + lambdaStdev * (a11 - a10);
  return b0 + lambdaMean * (b1 - b0);
}

/**
 * d(scoreValue)/d(score), KataGo ScoreValue::whiteDScoreValueDScoreSmoothNoDrawAdjust
 * (cpp/neuralnet/nninputs.cpp). Used to turn a score error into a utility error.
 */
export function whiteDScoreValueDScoreSmoothNoDrawAdjust(args: {
  finalWhiteMinusBlackScore: number;
  center: number;
  scale: number;
  sqrtBoardArea: number;
}): number {
  const adjustedScore = args.finalWhiteMinusBlackScore - args.center;
  const scaleFactor = args.scale * args.sqrtBoardArea;
  return (scaleFactor / (scaleFactor * scaleFactor + adjustedScore * adjustedScore)) * (2 / Math.PI);
}

export function getScoreStdev(scoreMean: number, scoreMeanSq: number): number {
  const variance = scoreMeanSq - scoreMean * scoreMean;
  if (variance <= 0) return 0;
  return Math.sqrt(variance);
}

export const getSqrtBoardArea = (): number => Math.sqrt(BOARD_AREA);

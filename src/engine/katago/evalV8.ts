import type { Player } from '../../types';

export type KataGoEval = {
  blackWinProb: number; // 0..1
  blackScoreLead: number; // >0 means black ahead
  blackScoreMean: number; // >0 means black ahead (score mean)
  blackScoreStdev: number; // >=0
  blackNoResultProb: number; // 0..1
  /**
   * The net's own estimate of how much its win/loss and score judgements will move
   * over the next few moves. Only nets from model version 10 on predict these; older
   * ones report -1, exactly like KataGo does (cpp/neuralnet/nneval.cpp).
   */
  shorttermWinlossError: number;
  shorttermScoreError: number;
};

export type KataGoPostProcessParams = {
  scoreMeanMultiplier: number;
  scoreStdevMultiplier: number;
  leadMultiplier: number;
  outputScaleMultiplier: number;
  shorttermValueErrorMultiplier?: number;
  shorttermScoreErrorMultiplier?: number;
};

const softPlus = (x: number): number => {
  // Stable-ish softplus
  if (x > 20) return x;
  if (x < -20) return Math.exp(x);
  return Math.log1p(Math.exp(x));
};

export function postprocessKataGoV8(args: {
  nextPlayer: Player;
  valueLogits: ArrayLike<number>; // [win, loss, noResult] from player-to-move perspective
  // [scoreMean, scoreStdevPreSoftplus, lead, varTimeLeftPreSoftplus,
  //  shorttermWinlossErrorPreSoftplus, shorttermScoreErrorPreSoftplus]
  scoreValue: ArrayLike<number>;
  postProcessParams?: KataGoPostProcessParams;
  modelVersion?: number;
}): KataGoEval {
  const { nextPlayer, valueLogits, scoreValue } = args;
  const postProcessParams = args.postProcessParams;

  const outputScaleMultiplier = postProcessParams?.outputScaleMultiplier ?? 1.0;
  const winLogits = valueLogits[0] * outputScaleMultiplier;
  const lossLogits = valueLogits[1] * outputScaleMultiplier;
  const noResultLogits = valueLogits[2] * outputScaleMultiplier;

  const maxLogits = Math.max(winLogits, lossLogits, noResultLogits);
  let winProb = Math.exp(winLogits - maxLogits);
  let lossProb = Math.exp(lossLogits - maxLogits);
  let noResultProb = Math.exp(noResultLogits - maxLogits);
  const probSum = winProb + lossProb + noResultProb;
  winProb /= probSum;
  lossProb /= probSum;
  noResultProb /= probSum;

  // Defaults for older models (ModelPostProcessParams).
  const scoreMeanMultiplier = postProcessParams?.scoreMeanMultiplier ?? 20.0;
  const scoreStdevMultiplier = postProcessParams?.scoreStdevMultiplier ?? 20.0;
  const leadMultiplier = postProcessParams?.leadMultiplier ?? 20.0;

  const scoreMeanPreScaled = scoreValue[0] * outputScaleMultiplier;
  const scoreStdevPreSoftplus = scoreValue[1] * outputScaleMultiplier;
  const leadPreScaled = scoreValue[2] * outputScaleMultiplier;

  let scoreMean = scoreMeanPreScaled * scoreMeanMultiplier;
  const scoreStdev = softPlus(scoreStdevPreSoftplus) * scoreStdevMultiplier;
  let scoreMeanSq = scoreMean * scoreMean + scoreStdev * scoreStdev;
  let lead = leadPreScaled * leadMultiplier;

  // Make unconditional with respect to no-result.
  scoreMean *= 1.0 - noResultProb;
  scoreMeanSq *= 1.0 - noResultProb;
  lead *= 1.0 - noResultProb;

  // Convert from player-to-move perspective to black perspective.
  const blackWinProb = nextPlayer === 'black' ? winProb : lossProb;
  const blackScoreLead = nextPlayer === 'black' ? lead : -lead;
  const blackScoreMean = nextPlayer === 'black' ? scoreMean : -scoreMean;
  const blackScoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreMean * scoreMean));
  const blackNoResultProb = noResultProb;

  // Shortterm error heads: model version 10 and up (cpp/neuralnet/nneval.cpp, the
  // modelVersion >= 4 block). Version 14 halves the pre-softplus input and squares.
  let shorttermWinlossError = -1;
  let shorttermScoreError = -1;
  if (scoreValue.length >= 6) {
    const modelVersion = args.modelVersion ?? 0;
    const valueErrorMultiplier = postProcessParams?.shorttermValueErrorMultiplier ?? 0.25;
    const scoreErrorMultiplier = postProcessParams?.shorttermScoreErrorMultiplier ?? 30.0;
    const winlossPre = scoreValue[4]! * outputScaleMultiplier;
    const scorePre = scoreValue[5]! * outputScaleMultiplier;
    if (modelVersion >= 14) {
      const sw = softPlus(winlossPre * 0.5);
      shorttermWinlossError = Math.sqrt(sw * sw * valueErrorMultiplier);
      const ss = softPlus(scorePre * 0.5);
      shorttermScoreError = Math.sqrt(ss * ss * scoreErrorMultiplier);
    } else if (modelVersion >= 10) {
      shorttermWinlossError = Math.sqrt(softPlus(winlossPre) * valueErrorMultiplier);
      shorttermScoreError = Math.sqrt(softPlus(scorePre) * scoreErrorMultiplier);
    } else {
      shorttermWinlossError = softPlus(winlossPre);
      shorttermScoreError = softPlus(scorePre) * 10.0;
    }
  }

  return {
    blackWinProb,
    blackScoreLead,
    blackScoreMean,
    blackScoreStdev,
    blackNoResultProb,
    shorttermWinlossError,
    shorttermScoreError,
  };
}
